import { describe, expect, it } from 'vitest';
import { buildFrequenciesCode, resolveFrequencyFunction } from './frequencyFunction';

describe('resolveFrequencyFunction', () => {
  it('defaults to y2clerk::freqs', () => {
    expect(resolveFrequencyFunction(undefined, undefined)).toEqual({
      ok: true,
      fn: { call: 'y2clerk::freqs', packageName: 'y2clerk' },
    });
  });

  it('falls back to the default for an unrecognized preset', () => {
    expect(resolveFrequencyFunction('nope::freqs', '')).toEqual({
      ok: true,
      fn: { call: 'y2clerk::freqs', packageName: 'y2clerk' },
    });
  });

  it('resolves the freq2 preset', () => {
    expect(resolveFrequencyFunction('freq2::freqs', '')).toEqual({
      ok: true,
      fn: { call: 'freq2::freqs', packageName: 'freq2' },
    });
  });

  it('ignores the custom function unless "custom" is selected', () => {
    expect(resolveFrequencyFunction('freq2::freqs', 'mypkg::f')).toEqual({
      ok: true,
      fn: { call: 'freq2::freqs', packageName: 'freq2' },
    });
  });

  it.each([
    ['mypkg::my_freqs', { call: 'mypkg::my_freqs', packageName: 'mypkg' }],
    ['mypkg:::my_freqs', { call: 'mypkg:::my_freqs', packageName: 'mypkg' }],
    ['my.freqs', { call: 'my.freqs' }],
    ['  my_freqs  ', { call: 'my_freqs' }],
  ])('resolves custom function %j', (custom, fn) => {
    expect(resolveFrequencyFunction('custom', custom)).toEqual({ ok: true, fn });
  });

  it.each(['', '   ', undefined, 42])('rejects an empty custom function (%j)', (custom) => {
    const result = resolveFrequencyFunction('custom', custom);
    expect(result.ok).toBe(false);
  });

  it.each(['my_freqs(nas = FALSE)', 'pkg::', '::f', '1freqs', 'a::b::c', 'system("rm -rf /"); f'])(
    'rejects invalid custom function %j',
    (custom) => {
      const result = resolveFrequencyFunction('custom', custom);
      expect(result.ok).toBe(false);
    },
  );
});

describe('buildFrequenciesCode', () => {
  const fn = { call: 'freq2::freqs', packageName: 'freq2' };

  it('pipes the pipeline-so-far into the function', () => {
    expect(
      buildFrequenciesCode(fn, { dataframe: 'df', selectorExpression: 'x', expressionUpToHere: 'df |> filter(y > 1)' }),
    ).toBe('df |> filter(y > 1) |> freq2::freqs(x)');
  });

  it('calls the function directly with no pipeline point', () => {
    expect(buildFrequenciesCode(fn, { dataframe: 'df', selectorExpression: 'y2clerk::stem("Q1")' })).toBe(
      'freq2::freqs(df, y2clerk::stem("Q1"))',
    );
  });
});
