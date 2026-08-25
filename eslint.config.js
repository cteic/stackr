import { base } from '@stackr/eslint-config';

export default [
  ...base,
  {
    ignores: ['**/metro.config.*', '**/postcss.config.*', '**/babel.config.*'],
  },
];
