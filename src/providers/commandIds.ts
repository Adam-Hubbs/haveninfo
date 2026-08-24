/**
 * Command IDs shared between `renderHoverContent.ts` (which builds Markdown
 * command links -- and must stay free of any `vscode`/`positron` import so
 * it remains unit-testable in plain Node) and the modules that actually
 * register/handle those commands. Keep this file dependency-free.
 */
export const SHOW_ALL_VALUE_LABELS_COMMAND = 'havenLabels.showAllValueLabels';

/**
 * Also a first-class command (declared in `package.json`'s
 * `contributes.commands`) so users can bind it to a keyboard shortcut, not
 * just click it from a hover link. When invoked without arguments (e.g.
 * from a keybinding or the Command Palette), the handler resolves the
 * dataframe/column reference at the active editor's cursor itself -- see
 * `runFrequenciesCommand.ts`.
 */
export const RUN_FREQUENCIES_COMMAND = 'havenLabels.runFrequencies';
