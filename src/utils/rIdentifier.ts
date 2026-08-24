/**
 * Matches a plain R identifier (a dataframe/column name, function name, or
 * named argument) -- letters, digits, dots, and underscores, not starting
 * with a digit. Shared defense-in-depth check used anywhere we interpolate
 * a string into R source text or into an executed command's arguments.
 */
const R_IDENTIFIER_PATTERN = /^[.a-zA-Z][.a-zA-Z0-9_]*$/;

export function isValidRIdentifier(text: string): boolean {
  return R_IDENTIFIER_PATTERN.test(text);
}
