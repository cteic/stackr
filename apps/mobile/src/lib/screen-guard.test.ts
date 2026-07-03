import { describe, expect, it, vi } from 'vitest';
import { createScreenGuard, type ScreenCaptureModule } from './screen-guard';

function mockModule(): ScreenCaptureModule & {
  prevent: ReturnType<typeof vi.fn>;
  allow: ReturnType<typeof vi.fn>;
} {
  const prevent = vi.fn(() => Promise.resolve());
  const allow = vi.fn(() => Promise.resolve());
  return { preventScreenCaptureAsync: prevent, allowScreenCaptureAsync: allow, prevent, allow };
}

describe('createScreenGuard', () => {
  it('blocks capture on acquire and restores it on release', async () => {
    const module = mockModule();
    const guard = createScreenGuard(module);

    await guard.acquire();
    expect(guard.isActive()).toBe(true);
    expect(module.prevent).toHaveBeenCalledTimes(1);

    await guard.release();
    expect(guard.isActive()).toBe(false);
    expect(module.allow).toHaveBeenCalledTimes(1);
  });

  it('is idempotent under effect re-runs (double acquire, double release)', async () => {
    const module = mockModule();
    const guard = createScreenGuard(module);

    await guard.acquire();
    await guard.acquire();
    expect(module.prevent).toHaveBeenCalledTimes(1);

    await guard.release();
    await guard.release();
    expect(module.allow).toHaveBeenCalledTimes(1);
  });

  it('release before acquire never calls the native module', async () => {
    const module = mockModule();
    const guard = createScreenGuard(module);
    await guard.release();
    expect(module.allow).not.toHaveBeenCalled();
  });
});
