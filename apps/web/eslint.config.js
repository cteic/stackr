import { next } from '@stackr/eslint-config';

export default [
  ...next,
  {
    // NFT media is served from arbitrary, non-enumerable IPFS gateways, which
    // next/image's domain allowlist can't cover — the media renderer uses a
    // plain <img> by design, so the perf rule is scoped off for that file only.
    files: ['src/components/nft-media.tsx'],
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
];
