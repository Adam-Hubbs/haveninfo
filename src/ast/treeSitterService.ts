import * as path from "path";
import { Language, Node, Parser, Tree } from "web-tree-sitter";

const GRAMMAR_PATH = path.join(__dirname, "grammar", "tree-sitter-r.wasm");

let languagePromise: Promise<Language> | undefined;

/**
 * Loads (and caches) the vendored R grammar. Safe to call repeatedly -- the
 * underlying wasm is only parsed/instantiated once per process.
 */
function loadRLanguage(): Promise<Language> {
  if (!languagePromise) {
    languagePromise = Parser.init().then(() => Language.load(GRAMMAR_PATH));
  }
  return languagePromise;
}

/** Creates a fresh parser configured with the R grammar. */
export async function createRParser(): Promise<Parser> {
  const language = await loadRLanguage();
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}

/** Parses a complete document/snippet of R source into a tree-sitter `Tree`. */
export async function parseR(source: string): Promise<Tree> {
  const parser = await createRParser();
  const tree = parser.parse(source);
  if (!tree) {
    throw new Error("tree-sitter failed to produce a parse tree");
  }
  return tree;
}

export type { Node, Tree };
