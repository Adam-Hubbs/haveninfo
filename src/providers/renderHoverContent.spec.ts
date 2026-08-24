import { describe, expect, it } from 'vitest';
import { renderHoverContent } from './renderHoverContent';

describe('renderHoverContent', () => {
  describe('short mode', () => {
    it('shows just the label', () => {
      const text = renderHoverContent({ label: 'Age in years', valueLabels: [] }, { mode: 'short', maxValueLabels: 10 });
      expect(text).toBe('**Haven label:** Age in years');
    });

    it('shows nothing when there is no label, even with value labels', () => {
      const text = renderHoverContent(
        { valueLabels: [{ value: 1, label: 'Male' }] },
        { mode: 'short', maxValueLabels: 10 },
      );
      expect(text).toBeUndefined();
    });
  });

  describe('full mode', () => {
    it('shows the label and a value-labels table', () => {
      const text = renderHoverContent(
        {
          label: 'Sex',
          valueLabels: [
            { value: 1, label: 'Male' },
            { value: 2, label: 'Female' },
          ],
        },
        { mode: 'full', maxValueLabels: 10 },
      );
      expect(text).toBe(['**Sex**', '', '| Value | Label |', '|---|---|', '| 1 | Male |', '| 2 | Female |'].join('\n'));
    });

    it('shows only the label when there are no value labels', () => {
      const text = renderHoverContent({ label: 'Sex', valueLabels: [] }, { mode: 'full', maxValueLabels: 10 });
      expect(text).toBe('**Sex**');
    });

    it('shows only the value-labels table when there is no label', () => {
      const text = renderHoverContent(
        { valueLabels: [{ value: 1, label: 'Male' }] },
        { mode: 'full', maxValueLabels: 10 },
      );
      expect(text).toBe(['| Value | Label |', '|---|---|', '| 1 | Male |'].join('\n'));
    });

    it('shows nothing when there is neither a label nor value labels', () => {
      const text = renderHoverContent({ valueLabels: [] }, { mode: 'full', maxValueLabels: 10 });
      expect(text).toBeUndefined();
    });

    it('truncates value labels at the configured cutoff and notes how many more', () => {
      const valueLabels = Array.from({ length: 15 }, (_, i) => ({ value: i + 1, label: `Label ${i + 1}` }));
      const text = renderHoverContent({ valueLabels }, { mode: 'full', maxValueLabels: 10 });

      expect(text).toContain('| 1 | Label 1 |');
      expect(text).toContain('| 10 | Label 10 |');
      expect(text).not.toContain('Label 11');
      expect(text).toContain('*...and 5 more*');
    });

    it('falls back to a default cutoff for a non-positive-integer maxValueLabels', () => {
      const valueLabels = Array.from({ length: 15 }, (_, i) => ({ value: i + 1, label: `Label ${i + 1}` }));
      const text = renderHoverContent({ valueLabels }, { mode: 'full', maxValueLabels: 0 });

      expect(text).toContain('| 10 | Label 10 |');
      expect(text).not.toContain('Label 11');
    });

    it('escapes markdown-significant characters in labels', () => {
      const text = renderHoverContent(
        { label: 'A *label* with | pipe', valueLabels: [{ value: 1, label: 'Has | a pipe' }] },
        { mode: 'full', maxValueLabels: 10 },
      );
      // Pipe is only special (and needs escaping) inside a table cell, not
      // in the plain bold label line.
      expect(text).toContain('A \\*label\\* with | pipe');
      expect(text).toContain('| 1 | Has \\| a pipe |');
    });
  });
});
