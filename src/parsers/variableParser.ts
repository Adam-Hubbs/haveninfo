// variableParser.ts
export class VariableParser {
  static parseVariable(text: string): { type: 'dataframe', variable: string, column?: string } | undefined{
    // Check for dataframe$column pattern
    const dollarMatch = text.match(/^(\w+)\$(\w+)$/);
    if (dollarMatch) {
      return {
        type: 'dataframe',
        variable: dollarMatch[1],
        column: dollarMatch[2]
      };
    }

    // Check for dataframe[["column"]] or dataframe[[column]] pattern
    const bracketMatch = text.match(/^(\w+)\[\[["']?(\w+)["']?\]\]$/);
    if (bracketMatch) {
      return {
        type: 'dataframe',
        variable: bracketMatch[1],
        column: bracketMatch[2]
      };
    }
    
    return undefined;
  }
}