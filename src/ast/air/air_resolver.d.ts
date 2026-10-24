/* tslint:disable */
/* eslint-disable */

/**
 * The data-masking functions to recognize, built once from the extension's
 * `{ name, dataArg: { position?, argName? } }[]` registry. Lives in
 * WebAssembly memory: call `free()` when done with it.
 */
export class DataMaskingRegistry {
    free(): void;
    [Symbol.dispose](): void;
    constructor(functions: Array<any>);
}

/**
 * A parsed R document, kept alive across hovers until the document changes.
 * Lives in WebAssembly memory: call `free()` when done with it.
 */
export class ParsedDocument {
    free(): void;
    [Symbol.dispose](): void;
    constructor(source: string);
    /**
     * Resolves the dataframe/column reference at `utf16_offset` (a JS string
     * index). Returns `{ dataframe, column, expressionUpToHere? }` or
     * `undefined`.
     */
    resolve(utf16_offset: number, registry: DataMaskingRegistry): any;
}

/**
 * Parses `source` and returns the number of parse diagnostics. Exists for
 * benchmarking and diagnostics; the extension itself only needs
 * [ParsedDocument].
 */
export function parse(source: string): number;
