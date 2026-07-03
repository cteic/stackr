import { isSignerError, signerErrorCodes, type Signer } from './contracts/signer';

export type EnsureSeedResult = 'created' | 'existing';

/**
 * Silent-seed bootstrap (ADR 0020 onboarding: no mnemonic ceremony). Called
 * after Privy auth succeeds: if the device already holds a seed this is a
 * no-op; otherwise a fresh mnemonic is generated straight into secure storage
 * with nothing displayed. Idempotent under the re-login race — if another
 * caller initialized between our check and write, the signer's
 * `already_initialized` guard is treated as `existing`, never a failure and
 * never a regeneration.
 */
export async function ensureLocalSeed(
  signer: Signer,
  generate: () => string,
): Promise<EnsureSeedResult> {
  if (await signer.isInitialized()) {
    return 'existing';
  }
  try {
    await signer.initialize(generate());
  } catch (error) {
    if (isSignerError(error) && error.code === signerErrorCodes.alreadyInitialized) {
      return 'existing';
    }
    throw error;
  }
  return 'created';
}
