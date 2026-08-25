// Single source of truth lives in @stackr/services so the platform-independent
// @stackr/features layer can share the same masking convention. Re-exported
// here to keep the existing `@/lib/mask-fiat` import path stable.
export { maskFiat } from '@stackr/services';
