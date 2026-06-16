'use client';

import { CurrencySchema, currencyMeta } from '@stackr/models';
import type { Currency } from '@stackr/models';
import { Card } from '@stackr/ui';
import { useSettingsStore } from '@/lib/settings-store';
import { Header } from '@/components/header';

const currencies = CurrencySchema.options;

export default function SettingsPage() {
  const currency = useSettingsStore(s => s.currency);
  const setCurrency = useSettingsStore(s => s.setCurrency);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">Display</h2>
          <div className="space-y-1.5">
            <label htmlFor="currency" className="text-sm font-medium text-muted-foreground">
              Currency
            </label>
            <select
              id="currency"
              value={currency}
              onChange={e => setCurrency(e.target.value as Currency)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {currencies.map(c => (
                <option key={c} value={c}>
                  {currencyMeta[c].symbol} {currencyMeta[c].name} ({c.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        </Card>
      </main>
    </>
  );
}
