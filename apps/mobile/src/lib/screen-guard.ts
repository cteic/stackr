/**
 * Module surface of `expo-screen-capture` the guard consumes — injected so
 * node-run tests never touch the native module.
 */
export interface ScreenCaptureModule {
  preventScreenCaptureAsync(key?: string): Promise<void>;
  allowScreenCaptureAsync(key?: string): Promise<void>;
}

export interface ScreenGuard {
  acquire(): Promise<void>;
  release(): Promise<void>;
  isActive(): boolean;
}

const GUARD_KEY = 'stackr-backup-reveal';

/**
 * Screenshot/recording block while the phrase is on screen. Idempotent in
 * both directions so React effect re-runs (mount, blur, unmount) can call it
 * freely without unbalancing the underlying native counter.
 */
export function createScreenGuard(module: ScreenCaptureModule): ScreenGuard {
  let active = false;
  return {
    async acquire(): Promise<void> {
      if (active) return;
      active = true;
      await module.preventScreenCaptureAsync(GUARD_KEY);
    },
    async release(): Promise<void> {
      if (!active) return;
      active = false;
      await module.allowScreenCaptureAsync(GUARD_KEY);
    },
    isActive(): boolean {
      return active;
    },
  };
}
