import { base } from './base.js';

// The @stackr/features package holds platform-independent view-model
// transforms (domain model in → render-ready view model out). It must stay
// portable so the same logic can drive the Next.js web app and the future
// Capacitor mobile target. These rules are the guardrail that keeps it pure:
// no platform/framework imports and no DOM-only globals. Ported from the
// open-source Leather wallet's `@leather.io/features` README rules (MIT).
const platformImportMessage =
  '@stackr/features must stay platform-independent: no framework, native, or chain-SDK imports. Keep transforms pure (domain model in → view model out).';

const domGlobalMessage =
  '@stackr/features must not touch DOM-only globals: keep transforms pure and platform-independent.';

/** @type {import("eslint").Linter.Config[]} */
export const features = [
  ...base,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react-native',
                'react-native/*',
                'expo',
                'expo-*',
                'expo-*/*',
                'next',
                'next/*',
                'wagmi',
                'wagmi/*',
                '@solana/*',
              ],
              message: platformImportMessage,
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: domGlobalMessage },
        { name: 'document', message: domGlobalMessage },
        { name: 'localStorage', message: domGlobalMessage },
        { name: 'sessionStorage', message: domGlobalMessage },
        { name: 'navigator', message: domGlobalMessage },
      ],
    },
  },
];

export default features;
