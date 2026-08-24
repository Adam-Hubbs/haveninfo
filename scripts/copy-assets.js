#!/usr/bin/env node
// Copies non-TypeScript runtime assets that `tsc` won't emit into `out/`,
// mirroring their `src/` location. Currently just the vendored grammar wasm
// (see src/ast/grammar/NOTES.md for how that file itself gets vendored).
//
// Run as part of `npm run compile` (after `tsc`), not standalone.

const fs = require("fs");
const path = require("path");

const ASSETS = [["src/ast/grammar/tree-sitter-r.wasm", "out/ast/grammar/tree-sitter-r.wasm"]];

for (const [src, dest] of ASSETS) {
  const srcPath = path.join(__dirname, "..", src);
  const destPath = path.join(__dirname, "..", dest);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  console.log(`Copied ${src} -> ${dest}`);
}
