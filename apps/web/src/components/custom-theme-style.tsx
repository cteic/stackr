'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { applyCustomTheme, clearCustomTheme, CUSTOM_THEME_VALUE } from '@/lib/custom-theme';
import { useAtomValue } from 'jotai';
import { customThemeAtom } from '@/lib/settings-store';

/**
 * Applies the user's custom palette as inline CSS custom properties on the
 * document root whenever the `custom` theme is active, and tears them down when
 * the user switches away. Renders nothing — all work happens in an effect, so
 * the server and first client render agree (next-themes already guards the root
 * with `suppressHydrationWarning`).
 */
export function CustomThemeStyle() {
  const { theme } = useTheme();
  const customTheme = useAtomValue(customThemeAtom);

  useEffect(() => {
    if (theme !== CUSTOM_THEME_VALUE) return;
    const root = document.documentElement;
    applyCustomTheme(root, customTheme);
    return () => clearCustomTheme(root, customTheme.base);
  }, [theme, customTheme]);

  return null;
}
