#!/usr/bin/env node
// Builds the Rust crate in air-resolver/ (Air's R parser plus our column
// reference resolver) to WebAssembly and vendors the output into
// src/ast/air/, where `npm run compile` picks it up.
//
// Requires a Rust toolchain with the wasm32-unknown-unknown target and
// wasm-pack. The output is committed, so this only needs re-running after
// changing the crate or bumping its pinned Air revision.
//
// Usage: node scripts/build-parser.js

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "src", "ast", "air");

execFileSync(
  "wasm-pack",
  ["build", "air-resolver", "--release", "--target", "nodejs", "--no-pack", "--out-dir", OUT_DIR],
  { cwd: ROOT, stdio: "inherit" },
);

// wasm-pack writes a catch-all .gitignore, but we commit the build output.
fs.rmSync(path.join(OUT_DIR, ".gitignore"), { force: true });
