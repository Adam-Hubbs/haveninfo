import { describe, expect, it } from 'vitest';
import type { ColumnLookupResult } from './havenLabels';
import { RUN_FREQUENCIES_COMMAND, SHOW_ALL_VALUE_LABELS_COMMAND } from './commandIds';
import { renderHoverContent } from './renderHoverContent';

const NO_LINK = { showRunFrequenciesLink: false };
const WITH_LINK = { showRunFrequenciesLink: true };

function exact(fields: Partial<Extract<ColumnLookupResult, { kind: 'exact' }>> = {}): ColumnLookupResult {
  return { kind: 'exact', valueLabels: [], ...fields };
}

describe('renderHoverContent', () => {
  describe('kind: none', () => {
    it('always shows nothing, regardless of settings', () => {
      expect(renderHoverContent({ dataframe: 'df', column: 'col' }, { kind: 'none' }, { mode: 'short', maxValueLabels: 10, maxStemMatches: 10, ...NO_LINK })).toBeUndefined();
      expect(renderHoverContent({ dataframe: 'df', column: 'col' }, { kind: 'none' }, { mode: 'full', maxValueLabels: 10, maxStemMatches: 10, ...WITH_LINK })).toBeUndefined();
    });
  });

  describe('kind: exact, short mode', () => {
    it('shows the bold column name and the plain-text label', () => {
      const text = renderHoverContent(
        { dataframe: 'df', column: 'age' },
        exact({ label: 'Age in years' }),
        { mode: 'short', maxValueLabels: 10, maxStemMatches: 10, ...NO_LINK },
      );
      expect(text).toBe('**age**\n\nAge in years');
    });

    it('shows nothing when there is no label and no run-frequencies link, even with value labels', () => {
      const text = renderHoverContent(
        { dataframe: 'df', column: 'sex' },
        exact({ valueLabels: [{ value: 1, label: 'Male' }] }),
        { mode: 'short', maxValueLabels: 10, maxStemMatches: 10, ...NO_LINK },
      );
      expect(text).toBeUndefined();
    });
  });

  describe('kind: exact, full mode', () => {
    it('shows column name, label, and a "Variable labels" section with an indented list', () => {
      const text = renderHoverContent(
        { dataframe: 'df', column: 'sex' },
        exact({
          label: 'Sex',
          valueLabels: [
            { value: 1, label: 'Male' },
            { value: 2, label: 'Female' },
          ],
        }),
        { mode: 'full', maxValueLabels: 10, maxStemMatches: 10, ...NO_LINK },
      );
      expect(text).toBe(
        ['**sex**', '', 'Sex', '', '*Variable labels*', '', '---', '', '- `1`: Male', '- `2`: Female'].join('\n'),
      );
    });

    it('shows only the column name and label when there are no value labels', () => {
      const text = renderHoverContent({ dataframe: 'df', column: 'sex' }, exact({ label: 'Sex' }), {
        mode: 'full',
        maxValueLabels: 10, maxStemMatches: 10,
        ...NO_LINK,
      });
      expect(text).toBe('**sex**\n\nSex');
    });

    it('still shows the value-labels section when there is no variable label', () => {
      const text = renderHoverContent(
        { dataframe: 'df', column: 'sex' },
        exact({ valueLabels: [{ value: 1, label: 'Male' }] }),
        { mode: 'full', maxValueLabels: 10, maxStemMatches: 10, ...NO_LINK },
      );
      expect(text).toBe(['**sex**', '', '*Variable labels*', '', '---', '', '- `1`: Male'].join('\n'));
    });

    it('shows nothing when there is neither a label, value labels, nor the run-frequencies link', () => {
      const text = renderHoverContent({ dataframe: 'df', column: 'sex' }, exact(), {
        mode: 'full',
        maxValueLabels: 10, maxStemMatches: 10,
        ...NO_LINK,
      });
      expect(text).toBeUndefined();
    });

    it('shows just the column name and the run-frequencies link for an existing but unlabelled column', () => {
      const text = renderHoverContent({ dataframe: 'df', column: 'plain' }, exact(), {
        mode: 'full',
        maxValueLabels: 10, maxStemMatches: 10,
        ...WITH_LINK,
      });
      const expectedArgs = encodeURIComponent(JSON.stringify(['df', 'plain', undefined]));
      expect(text).toBe(`**plain**\n\n[Run frequencies \u2192](command:${RUN_FREQUENCIES_COMMAND}?${expectedArgs})`);
    });

    it('truncates value labels and appends a clickable command link with the remaining count', () => {
      const valueLabels = Array.from({ length: 15 }, (_, i) => ({ value: i + 1, label: `Label ${i + 1}` }));
      const text = renderHoverContent({ dataframe: 'df', column: 'col' }, exact({ valueLabels }), {
        mode: 'full',
        maxValueLabels: 10, maxStemMatches: 10,
        ...NO_LINK,
      });

      expect(text).toContain('- `1`: Label 1');
      expect(text).toContain('- `10`: Label 10');
      expect(text).not.toContain('Label 11');

      const expectedArgs = encodeURIComponent(JSON.stringify(['df', 'col']));
      expect(text).toContain(`[*...and 5 more*](command:${SHOW_ALL_VALUE_LABELS_COMMAND}?${expectedArgs})`);
    });

    it('does not append a truncation link when nothing is truncated', () => {
      const text = renderHoverContent(
        { dataframe: 'df', column: 'col' },
        exact({ valueLabels: [{ value: 1, label: 'Male' }] }),
        { mode: 'full', maxValueLabels: 10, maxStemMatches: 10, ...NO_LINK },
      );
      expect(text).not.toContain('command:');
      expect(text).not.toContain('more');
    });

    it('falls back to a default cutoff for a non-positive-integer maxValueLabels', () => {
      const valueLabels = Array.from({ length: 15 }, (_, i) => ({ value: i + 1, label: `Label ${i + 1}` }));
      const text = renderHoverContent({ dataframe: 'df', column: 'col' }, exact({ valueLabels }), {
        mode: 'full',
        maxValueLabels: 0, maxStemMatches: 10,
        ...NO_LINK,
      });

      expect(text).toContain('- `10`: Label 10');
      expect(text).not.toContain('Label 11');
    });

    it('escapes markdown-significant characters in the column name and labels, but not in value codes', () => {
      const text = renderHoverContent(
        { dataframe: 'df', column: 'my_col' },
        exact({ label: 'A *label*', valueLabels: [{ value: 1, label: 'Has [brackets]' }] }),
        { mode: 'full', maxValueLabels: 10, maxStemMatches: 10, ...NO_LINK },
      );
      expect(text).toContain('**my\\_col**');
      expect(text).toContain('A \\*label\\*');
      expect(text).toContain('- `1`: Has \\[brackets\\]');
    });
  });

  describe('kind: exact, showRunFrequenciesLink', () => {
    it('appends a "Run frequencies" link carrying dataframe/column/expressionUpToHere as command args', () => {
      const text = renderHoverContent(
        { dataframe: 'df', column: 'col', expressionUpToHere: 'df |> select(col)' },
        exact({ label: 'Col' }),
        { mode: 'short', maxValueLabels: 10, maxStemMatches: 10, ...WITH_LINK },
      );

      const expectedArgs = encodeURIComponent(JSON.stringify(['df', 'col', 'df |> select(col)']));
      expect(text).toBe(`**col**\n\nCol\n\n[Run frequencies \u2192](command:${RUN_FREQUENCIES_COMMAND}?${expectedArgs})`);
    });

    it('is omitted when showRunFrequenciesLink is false, even with haven info present', () => {
      const text = renderHoverContent({ dataframe: 'df', column: 'col' }, exact({ label: 'Col' }), {
        mode: 'short',
        maxValueLabels: 10, maxStemMatches: 10,
        ...NO_LINK,
      });
      expect(text).not.toContain('command:');
    });
  });

  describe('kind: stem', () => {
    it('shows a distinct "(stem)" hover listing each match with its variable label, and a "Run frequencies" link', () => {
      const text = renderHoverContent(
        { dataframe: 'df', column: 'Q1' },
        {
          kind: 'stem',
          matches: [
            { name: 'Q1_1', label: 'First choice' },
            { name: 'Q1_2', label: 'Second choice' },
            { name: 'Q1r1' },
          ],
        },
        { mode: 'short', maxValueLabels: 10, maxStemMatches: 10, ...WITH_LINK },
      );

      const expectedArgs = encodeURIComponent(JSON.stringify(['df', 'y2clerk::stem("Q1")', undefined]));
      expect(text).toBe(
        [
          '**Q1** *(stem)*',
          '- `Q1_1`: First choice\n- `Q1_2`: Second choice\n- `Q1r1`',
          `[Run frequencies \u2192](command:${RUN_FREQUENCIES_COMMAND}?${expectedArgs})`,
        ].join('\n\n'),
      );
    });

    it('truncates the matches list and notes how many more', () => {
      const matches = Array.from({ length: 15 }, (_, i) => ({ name: `Q1_${i + 1}`, label: `Label ${i + 1}` }));
      const text = renderHoverContent({ dataframe: 'df', column: 'Q1' }, { kind: 'stem', matches }, {
        mode: 'short',
        maxValueLabels: 10, maxStemMatches: 10,
        ...WITH_LINK,
      });

      expect(text).toContain('- `Q1_1`: Label 1');
      expect(text).toContain('- `Q1_10`: Label 10');
      expect(text).not.toContain('Q1_11');
      expect(text).toContain('*...and 5 more*');
    });

    it('falls back to a default cutoff of 15 for a non-positive-integer maxStemMatches', () => {
      const matches = Array.from({ length: 20 }, (_, i) => ({ name: `Q1_${i + 1}` }));
      const text = renderHoverContent({ dataframe: 'df', column: 'Q1' }, { kind: 'stem', matches }, {
        mode: 'short',
        maxValueLabels: 10,
        maxStemMatches: 0,
        ...WITH_LINK,
      });

      expect(text).toContain('- `Q1_15`');
      expect(text).not.toContain('Q1_16');
      expect(text).toContain('*...and 5 more*');
    });

    it('preserves expressionUpToHere in the stem link args', () => {
      const text = renderHoverContent(
        { dataframe: 'df', column: 'Q1', expressionUpToHere: 'df |> mutate(x = 1)' },
        { kind: 'stem', matches: [{ name: 'Q1_1' }] },
        { mode: 'short', maxValueLabels: 10, maxStemMatches: 10, ...WITH_LINK },
      );
      const expectedArgs = encodeURIComponent(JSON.stringify(['df', 'y2clerk::stem("Q1")', 'df |> mutate(x = 1)']));
      expect(text).toContain(`command:${RUN_FREQUENCIES_COMMAND}?${expectedArgs}`);
    });

    it('shows nothing when showRunFrequenciesLink is false', () => {
      const text = renderHoverContent({ dataframe: 'df', column: 'Q1' }, { kind: 'stem', matches: [{ name: 'Q1_1' }] }, {
        mode: 'short',
        maxValueLabels: 10, maxStemMatches: 10,
        ...NO_LINK,
      });
      expect(text).toBeUndefined();
    });

    it('escapes markdown-significant characters in the stem column name and match labels', () => {
      const text = renderHoverContent(
        { dataframe: 'df', column: 'my_stem' },
        { kind: 'stem', matches: [{ name: 'my_stem_1', label: 'A *label*' }] },
        { mode: 'short', maxValueLabels: 10, maxStemMatches: 10, ...WITH_LINK },
      );
      expect(text).toContain('**my\\_stem** *(stem)*');
      expect(text).toContain('- `my_stem_1`: A \\*label\\*');
    });
  });
});
