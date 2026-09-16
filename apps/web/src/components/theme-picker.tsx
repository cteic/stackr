'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Palette, SlidersHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Button,
} from '@stackr/ui';
import { CustomThemeEditor } from '@/components/custom-theme-editor';
import { CUSTOM_THEME_VALUE } from '@/lib/custom-theme';
import { useAtomValue } from 'jotai';
import { customThemeAtom } from '@/lib/settings-store';

const THEMES = [
  { id: 'terminal', label: 'Terminal', swatch: ['#000000', '#00d68f', '#ff5247'] },
  { id: 'kraken', label: 'Kraken Pro', swatch: ['#0a0c12', '#6d5efc', '#2fd18a'] },
  { id: 'leather', label: 'Leather Warm', swatch: ['#15110b', '#f7931a', '#6cc296'] },
  { id: 'onyx', label: 'Onyx Ledger', swatch: ['#08090b', '#e3b23c', '#58b58a'] },
] as const;

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const customTheme = useAtomValue(customThemeAtom);
  useEffect(() => setMounted(true), []);

  const openCustom = () => {
    setTheme(CUSTOM_THEME_VALUE);
    setEditorOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Choose theme">
            <Palette className="h-[1.2rem] w-[1.2rem]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {THEMES.map(t => (
            <DropdownMenuItem key={t.id} onClick={() => setTheme(t.id)} className="gap-3">
              <span className="flex items-center">
                {t.swatch.map((c, i) => (
                  <span
                    key={c}
                    className="h-3.5 w-3.5 rounded-full border border-border"
                    style={{ backgroundColor: c, marginLeft: i === 0 ? 0 : -5 }}
                  />
                ))}
              </span>
              <span className="flex-1">{t.label}</span>
              {mounted && theme === t.id && (
                <span className="text-primary" aria-hidden>
                  ●
                </span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={openCustom} className="gap-3">
            <span className="flex items-center">
              {[
                customTheme.tokens.background,
                customTheme.tokens.primary,
                customTheme.tokens.foreground,
              ].map((c, i) => (
                <span
                  key={c + i}
                  className="h-3.5 w-3.5 rounded-full border border-border"
                  style={{ backgroundColor: c, marginLeft: i === 0 ? 0 : -5 }}
                />
              ))}
            </span>
            <span className="flex-1">Custom</span>
            {mounted && theme === CUSTOM_THEME_VALUE ? (
              <span className="text-primary" aria-hidden>
                ●
              </span>
            ) : (
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CustomThemeEditor open={editorOpen} onOpenChange={setEditorOpen} />
    </>
  );
}
