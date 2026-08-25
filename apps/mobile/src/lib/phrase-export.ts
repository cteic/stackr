/**
 * Guarded "save to password manager" paths for the recovery phrase (issue
 * #152 follow-on). Neither path touches the network; both are only reachable
 * behind the same device-auth gate as the manual reveal.
 *
 * iOS has no sanctioned push-into-manager API, so the share sheet (password
 * managers register as share targets) and an auto-expiring clipboard copy are
 * the honest options. Android's one-click Credential Manager flow needs a
 * native module and is tracked as a follow-up, not shipped here.
 */

/** Share-sheet payload: a label line so the manager entry is identifiable. */
export function buildShareMessage(phrase: string): string {
  return `Stackr Wallet recovery phrase\n\n${phrase}`;
}

export interface ClipboardModule {
  setStringAsync(value: string): Promise<boolean>;
}

/** Injected timer so expiry is testable: returns a cancel function. */
export type Scheduler = (fn: () => void, ms: number) => () => void;

export const CLIPBOARD_CLEAR_MS = 60_000;

export interface ExpiringClipboard {
  /** Copy the phrase and schedule the clipboard to be overwritten. */
  copy(value: string): Promise<void>;
  /** Overwrite now and cancel any pending expiry (call on screen exit). */
  clearNow(): Promise<void>;
}

export function createExpiringClipboard(
  module: ClipboardModule,
  schedule: Scheduler,
  clearAfterMs: number = CLIPBOARD_CLEAR_MS,
): ExpiringClipboard {
  let cancel: (() => void) | null = null;

  async function clear(): Promise<void> {
    if (cancel !== null) {
      cancel();
      cancel = null;
    }
    await module.setStringAsync('');
  }

  return {
    async copy(value: string): Promise<void> {
      if (cancel !== null) {
        cancel();
        cancel = null;
      }
      await module.setStringAsync(value);
      cancel = schedule(() => {
        cancel = null;
        void module.setStringAsync('');
      }, clearAfterMs);
    },
    clearNow: clear,
  };
}
