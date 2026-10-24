//! Resolves the dataframe/column a cursor position refers to, on top of Air's
//! R syntax tree. This is a port of the extension's former tree-sitter based
//! `resolveReference.ts` -- see that file's doc-comment (now a thin wrapper
//! around this module) for the supported and deliberately unsupported
//! patterns.

use std::collections::HashMap;

use air_r_syntax::AnyRExpression;
use air_r_syntax::AnyRSelector;
use air_r_syntax::AnyRValue;
use air_r_syntax::RArgument;
use air_r_syntax::RArgumentList;
use air_r_syntax::RBinaryExpression;
use air_r_syntax::RCall;
use air_r_syntax::RExtractExpression;
use air_r_syntax::RIdentifier;
use air_r_syntax::RStringValue;
use air_r_syntax::RSubset;
use air_r_syntax::RSubset2;
use air_r_syntax::RSyntaxKind;
use air_r_syntax::RSyntaxNode;
use air_r_syntax::RSyntaxToken;
use biome_rowan::AstNode;
use biome_rowan::AstSeparatedList;
use biome_rowan::TextRange;
use biome_rowan::TextSize;

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct DataArgSpec {
    pub position: Option<usize>,
    pub arg_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedReference {
    pub dataframe: String,
    pub column: String,
    pub expression_up_to_here: Option<String>,
}

/// Distinguishes "not this kind of node" from "recognized, but no result".
enum Outcome {
    NotApplicable,
    Resolved(Option<ResolvedReference>),
}

/// Data-masking functions, keyed by unqualified name.
#[derive(Debug, Default)]
pub struct Registry(HashMap<String, DataArgSpec>);

impl Registry {
    /// Later entries win on name collisions.
    pub fn new(functions: impl IntoIterator<Item = (String, DataArgSpec)>) -> Self {
        Self(functions.into_iter().collect())
    }

    /// Matches by unqualified name, so `dplyr::select(...)` finds `select`.
    fn lookup(&self, function: &AnyRExpression) -> Option<&DataArgSpec> {
        let name = match function {
            AnyRExpression::RNamespaceExpression(namespace) => {
                text(namespace.right().ok()?.syntax())
            }
            function => text(function.syntax()),
        };
        self.0.get(&name)
    }
}

pub fn resolve_reference(
    root: &RSyntaxNode,
    offset: TextSize,
    registry: &Registry,
) -> Option<ResolvedReference> {
    let token = token_at(root, offset)?;
    let leaf = token.parent()?;

    match leaf.kind() {
        RSyntaxKind::R_IDENTIFIER => {
            if let Outcome::Resolved(resolved) = resolve_dollar_access(&leaf) {
                return resolved;
            }
            if let Outcome::Resolved(resolved) = resolve_bracket_access(&leaf) {
                return resolved;
            }
            resolve_data_masking_call(&leaf, registry)
        }
        // Only the string's contents count, not its delimiters, matching
        // tree-sitter's `string_content` leaf.
        RSyntaxKind::R_STRING_VALUE if string_content_range(&token).contains(offset) => {
            match resolve_bracket_access(&leaf) {
                Outcome::Resolved(resolved) => resolved,
                Outcome::NotApplicable => None,
            }
        }
        _ => None,
    }
}

fn token_at(root: &RSyntaxNode, offset: TextSize) -> Option<RSyntaxToken> {
    let token = root.token_at_offset(offset).right_biased()?;
    token.text_trimmed_range().contains(offset).then_some(token)
}

fn string_content_range(token: &RSyntaxToken) -> TextRange {
    let range = token.text_trimmed_range();
    let Some(content) = RStringValue::cast(token.parent().unwrap())
        .and_then(|string| string.inner_string_text().ok())
    else {
        return TextRange::empty(range.start());
    };

    // Quoted strings have one delimiter character on each side; raw strings
    // (`r"--(x)--"`) have one more on the opening side than the closing side.
    // Either way, the opening delimiter is the larger half.
    let delimiters = range.len() - TextSize::of(content.text());
    let open = TextSize::from(u32::from(delimiters).div_ceil(2));
    TextRange::at(range.start() + open, TextSize::of(content.text()))
}

fn resolve_dollar_access(leaf: &RSyntaxNode) -> Outcome {
    let Some(extract) = leaf.parent().and_then(RExtractExpression::cast) else {
        return Outcome::NotApplicable;
    };

    let is_rhs =
        matches!(extract.right(), Ok(AnyRSelector::RIdentifier(rhs)) if rhs.syntax() == leaf);
    if !is_rhs {
        // Cursor is on the lhs (the dataframe/list token itself): not a column.
        return Outcome::Resolved(None);
    }

    // A dataframe side that's a more complex expression (e.g.
    // `(df1 |> left_join(df2))$col`) is unsupported.
    Outcome::Resolved(match extract.left() {
        Ok(AnyRExpression::RIdentifier(lhs)) => Some(ResolvedReference {
            dataframe: text(lhs.syntax()),
            column: text(leaf),
            expression_up_to_here: None,
        }),
        _ => None,
    })
}

fn resolve_bracket_access(leaf: &RSyntaxNode) -> Outcome {
    // Climb from the leaf to the nearest argument, then check whether that
    // argument belongs directly to a `[`/`[[` subset (single-argument bracket
    // access only -- `df[a, b]` matrix-style indexing isn't a column reference).
    let Some(argument) = leaf.ancestors().find_map(RArgument::cast) else {
        return Outcome::NotApplicable;
    };
    let Some((dataframe, arguments)) = argument
        .syntax()
        .parent()
        .and_then(RArgumentList::cast)
        .and_then(|list| Some((subset_function(&list)?, list)))
    else {
        return Outcome::NotApplicable;
    };

    if present_arguments(&arguments).count() != 1 {
        return Outcome::Resolved(None);
    }
    let AnyRExpression::RIdentifier(dataframe) = dataframe else {
        return Outcome::Resolved(None);
    };

    // Anything other than a string here (e.g. `df[[idx]]`) is a dynamic
    // index, which is unsupported.
    Outcome::Resolved(match argument.value() {
        Some(AnyRExpression::AnyRValue(AnyRValue::RStringValue(string)))
            if string.syntax() == leaf =>
        {
            string
                .inner_string_text()
                .ok()
                .map(|content| ResolvedReference {
                    dataframe: text(dataframe.syntax()),
                    column: content.text().to_string(),
                    expression_up_to_here: None,
                })
        }
        _ => None,
    })
}

/// The object being subset, if `arguments` are the arguments of a `[` or `[[`.
fn subset_function(arguments: &RArgumentList) -> Option<AnyRExpression> {
    let subset = arguments.syntax().parent()?.parent()?;
    match subset.kind() {
        RSyntaxKind::R_SUBSET => RSubset::cast(subset)?.function().ok(),
        RSyntaxKind::R_SUBSET2 => RSubset2::cast(subset)?.function().ok(),
        _ => None,
    }
}

fn resolve_data_masking_call(leaf: &RSyntaxNode, registry: &Registry) -> Option<ResolvedReference> {
    for call in leaf.ancestors().filter_map(RCall::cast) {
        let (Ok(function), Ok(arguments)) = (call.function(), call.arguments()) else {
            continue;
        };
        if function.syntax() == leaf {
            continue;
        }
        let Some(spec) = registry.lookup(&function) else {
            continue;
        };

        // Nearest matching call didn't yield a result (e.g. leaf is the
        // dataframe argument itself, or the data arg couldn't be found for a
        // non-piped call) -- deliberately stop rather than keep climbing past
        // a call we recognize, to avoid surprising outer matches.
        if !is_within(arguments.syntax(), leaf) {
            return None;
        }

        if let Some(pipe) = piping_into(&call) {
            let lhs = pipe.left().ok()?;
            let dataframe = pipeline_root(lhs.clone())?;
            return Some(ResolvedReference {
                dataframe: text(dataframe.syntax()),
                column: text(leaf),
                expression_up_to_here: Some(text(lhs.syntax())),
            });
        }

        let (dataframe, data_argument) = find_explicit_data_argument(&arguments.items(), spec)?;
        if is_within(data_argument.syntax(), leaf) {
            return None;
        }
        return Some(ResolvedReference {
            dataframe: text(dataframe.syntax()),
            column: text(leaf),
            expression_up_to_here: Some(text(dataframe.syntax())),
        });
    }

    None
}

fn find_explicit_data_argument(
    arguments: &RArgumentList,
    spec: &DataArgSpec,
) -> Option<(RIdentifier, RArgument)> {
    if let Some(arg_name) = &spec.arg_name {
        let named = present_arguments(arguments).find(|argument| {
            argument
                .name_clause()
                .and_then(|clause| clause.name().ok())
                .is_some_and(|name| text(name.syntax()) == *arg_name)
        });
        if let Some(argument) = named {
            return identifier_value(&argument).map(|identifier| (identifier, argument));
        }
    }

    let argument = present_arguments(arguments)
        .filter(|argument| argument.name_clause().is_none())
        .nth(spec.position?)?;
    identifier_value(&argument).map(|identifier| (identifier, argument))
}

/// Arguments other than holes (e.g. the empty first argument of `df[, "x"]`),
/// which tree-sitter never produced a node for.
fn present_arguments(arguments: &RArgumentList) -> impl Iterator<Item = RArgument> {
    arguments
        .iter()
        .filter_map(Result::ok)
        .filter(|argument| !argument.is_hole())
}

fn identifier_value(argument: &RArgument) -> Option<RIdentifier> {
    match argument.value()? {
        AnyRExpression::RIdentifier(identifier) => Some(identifier),
        _ => None,
    }
}

/// The pipe whose rhs is `call`, if any.
fn piping_into(call: &RCall) -> Option<RBinaryExpression> {
    let binary = call.syntax().parent().and_then(RBinaryExpression::cast)?;
    let is_rhs = binary
        .right()
        .is_ok_and(|rhs| rhs.syntax() == call.syntax());
    (is_rhs && is_pipe(&binary)).then_some(binary)
}

fn is_pipe(binary: &RBinaryExpression) -> bool {
    binary
        .operator()
        .is_ok_and(|operator| match operator.kind() {
            RSyntaxKind::PIPE => true,
            RSyntaxKind::SPECIAL => operator.text_trimmed() == "%>%",
            _ => false,
        })
}

/// Walks back through a (possibly multi-stage) pipe chain to the original
/// dataframe identifier. Pipes are left-associative, so each earlier stage
/// is nested as the lhs of the next.
fn pipeline_root(mut expression: AnyRExpression) -> Option<RIdentifier> {
    loop {
        match expression {
            AnyRExpression::RBinaryExpression(binary) if is_pipe(&binary) => {
                expression = binary.left().ok()?;
            }
            AnyRExpression::RIdentifier(identifier) => return Some(identifier),
            _ => return None,
        }
    }
}

fn is_within(ancestor: &RSyntaxNode, node: &RSyntaxNode) -> bool {
    node.ancestors().any(|candidate| candidate == *ancestor)
}

fn text(node: &RSyntaxNode) -> String {
    node.text_trimmed().to_string()
}
