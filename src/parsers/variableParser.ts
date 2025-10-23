// parsers/variableParser.ts
import * as vscode from 'vscode';
export class VariableParser {
  static parseVariable(document: vscode.TextDocument, position: vscode.Position): { type: 'simple' | 'dataframe', variable: string, column?: string } | undefined {
    const line = document.lineAt(position.line).text;
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) return undefined;
    
    const word = document.getText(wordRange);
    const wordStart = wordRange.start.character;
    const wordEnd = wordRange.end.character;
    
    // Check if word is in quotes
    if (this.isInQuotes(line, wordStart)) return undefined;
    
    // Check if word is followed by ( or {
    const nextChar = line.charAt(wordEnd);
    if (nextChar === '(' || nextChar === '{') return undefined;

    // Handle $ notation
    const dollarMatch = line.match(/(\w+)\$(\w+)/);
    if (dollarMatch) {
      return {
        type: 'dataframe',
        variable: dollarMatch[1],
        column: dollarMatch[2]
      };
    }

    // Handle [[]] notation
    const bracketMatch = line.match(/(\w+)\[\[["']?(\w+)["']?\]\]/);
    if (bracketMatch) {
      return {
        type: 'dataframe',
        variable: bracketMatch[1],
        column: bracketMatch[2]
      };
    }

    // If we get here, assume it's a function argument and look for piped dataframe
    const dataframe = this.findPipedDataframe(document, position.line);
    if (dataframe) {
      return {
        type: 'dataframe',
        variable: dataframe,
        column: word
      };
    }

    return undefined;
  }

 private static isInQuotes(line: string, position: number): boolean {
  let inSingleQuotes = false;
  let inDoubleQuotes = false;
  let bracketDepth = 0;
  
  for (let i = 0; i < position; i++) {
    // Track bracket depth
    if (line[i] === '[') {
      bracketDepth++;
    } else if (line[i] === ']') {
      bracketDepth--;
    }
    // Only count quotes when not inside [[]]
    else if (bracketDepth < 2) {
      if (line[i] === "'" && !inDoubleQuotes) {
        inSingleQuotes = !inSingleQuotes;
      } else if (line[i] === '"' && !inSingleQuotes) {
        inDoubleQuotes = !inDoubleQuotes;
      }
    }
  }
  
  return (inSingleQuotes || inDoubleQuotes) && bracketDepth < 2;
}

 private static findPipedDataframe(document: vscode.TextDocument, currentLine: number): string | undefined {
    let lineNum = currentLine - 1; // Start from previous line
    let lastDataframe: string | undefined;

    while (lineNum >= 0) {
        const line = document.lineAt(lineNum).text.trim();
        
        if (line.endsWith('%>%') || line.endsWith('|>')) {
            const words = line.split(/\s+/);
            const lastWord = words[words.length - 2];
            if (lastWord && lastWord !== ')') {
                lastDataframe = lastWord;
            }
        } else if (!line.startsWith('%>%') && !line.startsWith('|>')) {
            // If this line doesn't start with a pipe and we haven't found a dataframe yet,
            // check if it contains one before a pipe
            if (!lastDataframe) {
                const pipeIndex = Math.max(line.lastIndexOf('%>%'), line.lastIndexOf('|>'));
                if (pipeIndex > -1) {
                    const beforePipe = line.substring(0, pipeIndex).trim();
                    const words = beforePipe.split(/\s+/);
                    const lastWord = words[words.length - 1];
                    if (lastWord && lastWord !== ')') {
                        lastDataframe = lastWord;
                    }
                }
            }
            break;
        }
        
    lineNum--;
    }
    return lastDataframe;
    }
}