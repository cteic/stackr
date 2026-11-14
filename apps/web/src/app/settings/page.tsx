'use client';

import { CurrencySchema, currencyMeta } from '@stackr/models';
import type { Currency } from '@stackr/models';
import { Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@stackr/ui';
import { useSettingsStore } from '@/lib/settings-store';
import { Header } from '@/components/header';

const currencies = CurrencySchema.options;

export default function SettingsPage() {
  const currency = useSettingsStore(s => s.currency);
  const setCurrency = useSettingsStore(s => s.setCurrency);

  return (
    <>
      <Header />
      <main className="w-full mx-auto max-w-lg px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">Display</h2>
          <div className="space-y-1.5">
            <label htmlFor="currency" className="text-sm font-medium text-muted-foreground">
              Currency
            </label>
            <Select value={currency} onValueChange={value => setCurrency(value as Currency)}>
              <SelectTrigger id="currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map(c => (
                  <SelectItem key={c} value={c}>
                    {currencyMeta[c].symbol} {currencyMeta[c].name} ({c.toUpperCase()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>
      </main>
    </>
  );
}
