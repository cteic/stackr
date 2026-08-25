import { describe, expect, it } from 'vitest';
import { readPrivyConfig } from './privy-config';

describe('readPrivyConfig', () => {
  it('returns both ids when configured', () => {
    expect(
      readPrivyConfig({
        EXPO_PUBLIC_PRIVY_APP_ID: 'app123',
        EXPO_PUBLIC_PRIVY_CLIENT_ID: 'client456',
      }),
    ).toEqual({ appId: 'app123', clientId: 'client456' });
  });

  it.each([
    ['missing app id', { EXPO_PUBLIC_PRIVY_CLIENT_ID: 'client456' }],
    ['missing client id', { EXPO_PUBLIC_PRIVY_APP_ID: 'app123' }],
    ['empty app id', { EXPO_PUBLIC_PRIVY_APP_ID: '', EXPO_PUBLIC_PRIVY_CLIENT_ID: 'c' }],
    ['nothing set', {}],
  ])('returns null when %s', (_label, env) => {
    expect(readPrivyConfig(env)).toBeNull();
  });
});
