/**
 * The app-side seam for `@stackr/signer`. The package landed, so the former
 * stub is gone — this module re-exports the real surface and stays the single
 * import point, exactly as the stub's swap note promised. Screens and libs
 * keep importing from here so a future signer change touches one file.
 */
export {
  createSigner,
  generateMnemonic,
  isSignerError,
  MNEMONIC_STORAGE_KEY,
  signerErrorCodes,
  validateMnemonic,
} from '@stackr/signer';
export type {
  DerivedAccount as SignerAccount,
  SecureStorage,
  SignerChain,
  StackrSigner as Signer,
} from '@stackr/signer';
