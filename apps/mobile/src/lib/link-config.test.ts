import { describe, expect, it } from 'vitest';
import { parseLinkConfig } from './link-config';

describe('parseLinkConfig', () => {
  it('returns the pair when both values are present', () => {
    expect(
      parseLinkConfig({
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'sb_publishable_x',
      }),
    ).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'sb_publishable_x',
    });
  });

  it('returns null when either value is missing or blank', () => {
    expect(parseLinkConfig({ supabaseUrl: undefined, supabaseAnonKey: 'k' })).toBeNull();
    expect(
      parseLinkConfig({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: '  ' }),
    ).toBeNull();
  });

  it('rejects a non-https relay URL', () => {
    expect(
      parseLinkConfig({ supabaseUrl: 'http://x.supabase.co', supabaseAnonKey: 'k' }),
    ).toBeNull();
  });
});
