import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';
import { DEFAULT_DATA_MASKING_FUNCTIONS } from './dataMaskingFunctions';

/**
 * `package.json`'s `havenLabels.dataMaskingFunctions` setting default is
 * meant to mirror `DEFAULT_DATA_MASKING_FUNCTIONS` exactly (in the
 * flattened `{ name, position?, argName? }` shape used by the setting's
 * JSON schema), so that a user who's never touched the setting sees the
 * same built-in behavior either way. This test exists purely to catch
 * drift between the two -- if it fails, update whichever side is stale.
 */
describe('havenLabels.dataMaskingFunctions setting default', () => {
  it('matches DEFAULT_DATA_MASKING_FUNCTIONS', () => {
    const configuredDefault =
      packageJson.contributes?.configuration?.properties?.['havenLabels.dataMaskingFunctions']?.default;

    const expected = DEFAULT_DATA_MASKING_FUNCTIONS.map((fn) => ({
      name: fn.name,
      ...fn.dataArg,
    }));

    expect(configuredDefault).toEqual(expected);
  });
});
