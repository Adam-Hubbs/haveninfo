# Changelog

## Unreleased

- New `havenLabels.frequencyFunction` setting chooses which function "Run frequencies" calls: `y2clerk::freqs` (default), `freq2::freqs`, or a custom function set in `havenLabels.customFrequencyFunction`.

## 0.3.0

- Replaced the tree-sitter R parser with [Air](https://github.com/posit-dev/air)'s Rust parser, compiled to WebAssembly. Parsing is roughly 5-8x faster and the packaged extension is smaller.
- Parses are now cached per document version, so repeated hovers on an unchanged file no longer reparse it.
- Fixed a memory leak where every hover allocated a parser and tree that were never freed, which could crash the extension host on large files.
- The "Haven Labels" output channel no longer opens on startup.
