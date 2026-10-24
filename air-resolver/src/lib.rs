//! WebAssembly bindings for the Haven Info extension. Built with
//! `npm run build-parser`, which vendors the output into `src/ast/air/`.

mod offsets;
mod resolve;

use air_r_parser::RParserOptions;
use air_r_syntax::RSyntaxNode;
use js_sys::Array;
use js_sys::Object;
use js_sys::Reflect;
use wasm_bindgen::prelude::*;

use crate::offsets::Utf16Index;
use crate::resolve::DataArgSpec;
use crate::resolve::Registry;
use crate::resolve::ResolvedReference;

/// Parses `source` and returns the number of parse diagnostics. Exists for
/// benchmarking and diagnostics; the extension itself only needs
/// [ParsedDocument].
#[wasm_bindgen]
pub fn parse(source: &str) -> usize {
    air_r_parser::parse(source, RParserOptions::default())
        .diagnostics()
        .len()
}

/// A parsed R document, kept alive across hovers until the document changes.
/// Lives in WebAssembly memory: call `free()` when done with it.
#[wasm_bindgen]
pub struct ParsedDocument {
    root: RSyntaxNode,
    offsets: Utf16Index,
}

#[wasm_bindgen]
impl ParsedDocument {
    #[wasm_bindgen(constructor)]
    pub fn new(source: &str) -> Self {
        Self {
            root: air_r_parser::parse(source, RParserOptions::default()).syntax(),
            offsets: Utf16Index::new(source),
        }
    }

    /// Resolves the dataframe/column reference at `utf16_offset` (a JS string
    /// index). Returns `{ dataframe, column, expressionUpToHere? }` or
    /// `undefined`.
    pub fn resolve(&self, utf16_offset: u32, registry: &DataMaskingRegistry) -> JsValue {
        self.offsets
            .utf8_offset(utf16_offset)
            .and_then(|offset| resolve::resolve_reference(&self.root, offset, &registry.0))
            .map_or(JsValue::UNDEFINED, to_js)
    }
}

/// The data-masking functions to recognize, built once from the extension's
/// `{ name, dataArg: { position?, argName? } }[]` registry. Lives in
/// WebAssembly memory: call `free()` when done with it.
#[wasm_bindgen]
pub struct DataMaskingRegistry(Registry);

#[wasm_bindgen]
impl DataMaskingRegistry {
    #[wasm_bindgen(constructor)]
    pub fn new(functions: Array) -> Self {
        Self(Registry::new(functions.iter().filter_map(|function| {
            let name = field(&function, "name")?.as_string()?;
            Some((name, data_arg_spec(&field(&function, "dataArg")?)))
        })))
    }
}

fn data_arg_spec(value: &JsValue) -> DataArgSpec {
    DataArgSpec {
        position: field(value, "position")
            .and_then(|v| v.as_f64())
            .map(|v| v as usize),
        arg_name: field(value, "argName").and_then(|v| v.as_string()),
    }
}

fn field(value: &JsValue, name: &str) -> Option<JsValue> {
    Reflect::get(value, &JsValue::from_str(name))
        .ok()
        .filter(|v| !v.is_undefined() && !v.is_null())
}

fn to_js(reference: ResolvedReference) -> JsValue {
    let object = Object::new();
    let set = |key: &str, value: String| {
        Reflect::set(&object, &JsValue::from_str(key), &JsValue::from_str(&value)).unwrap();
    };
    set("dataframe", reference.dataframe);
    set("column", reference.column);
    if let Some(expression) = reference.expression_up_to_here {
        set("expressionUpToHere", expression);
    }
    object.into()
}
