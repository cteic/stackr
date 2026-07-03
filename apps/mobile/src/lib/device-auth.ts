/**
 * Module surface of `expo-local-authentication` the gate consumes — injected
 * at the composition root so the native module never enters node-run tests.
 */
export interface LocalAuthModule {
  hasHardwareAsync(): Promise<boolean>;
  isEnrolledAsync(): Promise<boolean>;
  authenticateAsync(options?: {
    promptMessage?: string;
    cancelLabel?: string;
    disableDeviceFallback?: boolean;
  }): Promise<{ success: boolean }>;
}

export type RevealAuthResult = 'passed' | 'failed' | 'unavailable';

/**
 * Device re-auth immediately before the phrase reveal: biometric with the OS
 * passcode fallback (`disableDeviceFallback` stays false). `unavailable`
 * means the device cannot gate at all (no hardware or nothing enrolled) —
 * the flow then requires an explicit unprotected-device acknowledgement
 * instead of silently skipping the gate.
 */
export async function authenticateForReveal(module: LocalAuthModule): Promise<RevealAuthResult> {
  if (!(await module.hasHardwareAsync()) || !(await module.isEnrolledAsync())) {
    return 'unavailable';
  }
  const result = await module.authenticateAsync({
    promptMessage: 'Unlock your recovery phrase',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });
  return result.success ? 'passed' : 'failed';
}
