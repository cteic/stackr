/**
 * Typed error surface for the signer. Every failure path throws a
 * `SignerError` with a stable `code`, so callers (the mobile app's
 * sign-request sheet) can branch on failure kind without string-matching.
 *
 * Security invariant: no error message may ever interpolate key material,
 * mnemonics, seeds, or signatures — messages are static strings plus
 * non-secret context (chain names, paths, indexes).
 */

export const signerErrorCodes = {
  notInitialized: 'not_initialized',
  alreadyInitialized: 'already_initialized',
  invalidMnemonic: 'invalid_mnemonic',
  invalidPayload: 'invalid_payload',
  invalidMessage: 'invalid_message',
  unsupportedChain: 'unsupported_chain',
  invalidAccountIndex: 'invalid_account_index',
  derivationFailed: 'derivation_failed',
  signingFailed: 'signing_failed',
} as const;

export type SignerErrorCode = (typeof signerErrorCodes)[keyof typeof signerErrorCodes];

export class SignerError extends Error {
  readonly code: SignerErrorCode;

  constructor(code: SignerErrorCode, message: string) {
    super(message);
    this.name = 'SignerError';
    this.code = code;
  }
}

/** Narrow an unknown thrown value to `SignerError`. */
export function isSignerError(error: unknown): error is SignerError {
  return error instanceof SignerError;
}
