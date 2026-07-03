import { afterEach, describe, expect, it, vi } from 'vitest';
import { supabaseConfig, vapidPublicKey } from './config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('supabaseConfig', () => {
  it('returns null when either value is missing (accounts stay optional)', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    expect(supabaseConfig()).toBeNull();

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    expect(supabaseConfig()).toBeNull();
  });

  it('returns the pair when both are set', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    expect(supabaseConfig()).toEqual({ url: 'https://proj.supabase.co', anonKey: 'anon-key' });
  });
});

describe('vapidPublicKey', () => {
  it('returns null when unset and the key when set', () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '');
    expect(vapidPublicKey()).toBeNull();

    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'BPub');
    expect(vapidPublicKey()).toBe('BPub');
  });
});
