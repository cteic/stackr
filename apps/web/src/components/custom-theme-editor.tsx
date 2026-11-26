'use client';

import { RotateCcw } from 'lucide-react';
import {
  Button,
  Callout,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@stackr/ui';
import {
  BASE_THEMES,
  CUSTOM_THEME_TOKENS,
  MIN_BODY_CONTRAST,
  contrastRatio,
  isBaseThemeId,
} from '@/lib/custom-theme';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  customThemeAtom,
  resetCustomThemeAtom,
  setCustomThemeBaseAtom,
  setCustomThemeTokenAtom,
} from '@/lib/settings-store';

interface CustomThemeEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomThemeEditor({ open, onOpenChange }: CustomThemeEditorProps) {
  const customTheme = useAtomValue(customThemeAtom);
  const setCustomThemeBase = useSetAtom(setCustomThemeBaseAtom);
  const setCustomThemeToken = useSetAtom(setCustomThemeTokenAtom);
  const resetCustomTheme = useSetAtom(resetCustomThemeAtom);

  const { tokens } = customTheme;
  const ratio = contrastRatio(tokens.background, tokens.foreground);
  const lowContrast = ratio !== null && ratio < MIN_BODY_CONTRAST;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogTitle>Custom theme</DialogTitle>
        <DialogDescription>
          Pick a base theme as a starting point, then tune each colour. Changes preview live across
          the app.
        </DialogDescription>

        <div className="mt-2 flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Base theme
          </span>
          <Select
            value={customTheme.base}
            onValueChange={value => {
              if (isBaseThemeId(value)) setCustomThemeBase(value);
            }}
          >
            <SelectTrigger aria-label="Base theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BASE_THEMES.map(theme => (
                <SelectItem key={theme.id} value={theme.id}>
                  {theme.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            Radii, fonts, and derived colours are inherited from the base.
          </span>
        </div>

        {lowContrast && (
          <Callout variant="warning" className="mt-3 text-xs">
            Background and foreground contrast is {ratio.toFixed(1)}:1 — below the WCAG AA target of{' '}
            {MIN_BODY_CONTRAST}:1. Text may be hard to read.
          </Callout>
        )}

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          {CUSTOM_THEME_TOKENS.map(token => (
            <label key={token.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{token.label}</span>
              <input
                type="color"
                aria-label={token.label}
                value={tokens[token.key]}
                onChange={event => setCustomThemeToken(token.key, event.target.value)}
                className="h-7 w-9 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
              />
            </label>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={resetCustomTheme} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset to base
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
