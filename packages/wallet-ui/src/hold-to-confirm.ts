/**
 * Hold-to-confirm state machine for the sign-request approve action. A tap
 * cannot approve a signature — the user must hold for `holdMs` while a
 * progress affordance fills. Pure timer logic, extracted from the component
 * so it is unit-testable with fake timers; the component wires `start` to
 * press-in and `cancel` to press-out.
 */
export interface HoldToConfirmOptions {
  holdMs: number;
  /** Called once when the hold completes. */
  onConfirm: () => void;
  /** Called on every progress change with a 0..1 fraction. */
  onProgress: (fraction: number) => void;
  /** Progress update interval; defaults to ~60fps-ish coarse ticks. */
  tickMs?: number;
}

export interface HoldToConfirmController {
  start: () => void;
  cancel: () => void;
  /** Stop timers without emitting; for component unmount. */
  dispose: () => void;
}

export function createHoldToConfirm(options: HoldToConfirmOptions): HoldToConfirmController {
  const tickMs = options.tickMs ?? 50;
  let interval: ReturnType<typeof setInterval> | undefined;
  let elapsed = 0;
  let confirmed = false;

  function stop() {
    if (interval !== undefined) {
      clearInterval(interval);
      interval = undefined;
    }
  }

  return {
    start() {
      if (confirmed || interval !== undefined) {
        return;
      }
      elapsed = 0;
      options.onProgress(0);
      interval = setInterval(() => {
        elapsed += tickMs;
        const fraction = Math.min(elapsed / options.holdMs, 1);
        options.onProgress(fraction);
        if (fraction >= 1) {
          stop();
          confirmed = true;
          options.onConfirm();
        }
      }, tickMs);
    },
    cancel() {
      if (confirmed) {
        return;
      }
      stop();
      elapsed = 0;
      options.onProgress(0);
    },
    dispose() {
      stop();
    },
  };
}
