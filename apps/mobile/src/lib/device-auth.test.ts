import { describe, expect, it, vi } from 'vitest';
import { authenticateForReveal, type LocalAuthModule } from './device-auth';

function moduleWith(overrides: Partial<LocalAuthModule>): LocalAuthModule {
  return {
    hasHardwareAsync: () => Promise.resolve(true),
    isEnrolledAsync: () => Promise.resolve(true),
    authenticateAsync: () => Promise.resolve({ success: true }),
    ...overrides,
  };
}

describe('authenticateForReveal', () => {
  it('passes when the device authenticates', async () => {
    expect(await authenticateForReveal(moduleWith({}))).toBe('passed');
  });

  it('fails closed when the prompt is rejected', async () => {
    const module = moduleWith({ authenticateAsync: () => Promise.resolve({ success: false }) });
    expect(await authenticateForReveal(module)).toBe('failed');
  });

  it('reports unavailable without prompting when nothing is enrolled', async () => {
    const authenticate = vi.fn(() => Promise.resolve({ success: true }));
    const module = moduleWith({
      isEnrolledAsync: () => Promise.resolve(false),
      authenticateAsync: authenticate,
    });
    expect(await authenticateForReveal(module)).toBe('unavailable');
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('reports unavailable when the device has no auth hardware', async () => {
    const module = moduleWith({ hasHardwareAsync: () => Promise.resolve(false) });
    expect(await authenticateForReveal(module)).toBe('unavailable');
  });
});
