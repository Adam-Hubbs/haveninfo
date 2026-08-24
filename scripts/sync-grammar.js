#!/usr/bin/env node
// Copies the pre-built tree-sitter-r.wasm shipped inside the
// @davisvaughan/tree-sitter-r npm package into our own vendored location.
//
// We do NOT build this wasm ourselves (no tree-sitter-cli/Emscripten/Docker
// toolchain needed) -- the npm package already publishes a compiled wasm
// artifact at its package root. Re-run this script whenever the pinned
// version of @davisvaughan/tree-sitter-r in package.json is bumped.
//
// Usage: node scripts/sync-grammar.js

const fs = require("fs");
const path = require("path");

const SOURCE = require.resolve("@davisvaughan/tree-sitter-r/tree-sitter-r.wasm");
const DEST_DIR = path.join(__dirname, "..", "src", "ast", "grammar");
const DEST = path.join(DEST_DIR, "tree-sitter-r.wasm");

fs.mkdirSync(DEST_DIR, { recursive: true });
fs.copyFileSync(SOURCE, DEST);

const { version } = require("@davisvaughan/tree-sitter-r/package.json");
console.log(`Synced tree-sitter-r.wasm (grammar v${version}) -> ${path.relative(process.cwd(), DEST)}`);
