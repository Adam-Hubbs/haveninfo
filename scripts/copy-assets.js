#!/usr/bin/env node
// Copies non-TypeScript runtime assets that `tsc` won't emit into `out/`,
// mirroring their `src/` location. Currently just the vendored Air resolver
// wasm and its wasm-bindgen JS glue (see scripts/build-parser.js for how
// those get built).
//
// Run as part of `npm run compile` (after `tsc`), not standalone.

const fs = require("fs");
const path = require("path");

const ASSETS = [
  ["src/ast/air/air_resolver.js", "out/ast/air/air_resolver.js"],
  ["src/ast/air/air_resolver_bg.wasm", "out/ast/air/air_resolver_bg.wasm"],
];

for (const [src, dest] of ASSETS) {
  const srcPath = path.join(__dirname, "..", src);
  const destPath = path.join(__dirname, "..", dest);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  console.log(`Copied ${src} -> ${dest}`);
}
