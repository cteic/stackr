'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Chain } from '@stackr/models';
import { ChainSchema, chainMeta, validateAddress } from '@stackr/models';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@stackr/ui';
import { track } from '@stackr/analytics';
import { useWalletStore } from '@/lib/wallet-store';
import { Header } from '@/components/header';

const chains = ChainSchema.options;

export default function AddWalletPage() {
  const router = useRouter();
  const addWallet = useWalletStore(s => s.addWallet);
  const [label, setLabel] = useState('');
  const [chain, setChain] = useState<Chain>('btc');
  const [address, setAddress] = useState('');
  const [addressError, setAddressError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label || !address) return;

    const result = validateAddress(chain, address);
    if (!result.valid) {
      setAddressError(result.error ?? 'Invalid address');
      return;
    }

    setAddressError('');
    addWallet({ label, chain, address });
    // Coarse, PII-free signal: which chain gained a wallet — never the address.
    track('wallet_added', { chain });
    router.push('/');
  };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Add Wallet</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Label"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. My Bitcoin Wallet"
            required
          />

          <div className="space-y-1.5">
            <label htmlFor="chain" className="text-sm font-medium text-muted-foreground">
              Chain
            </label>
            <Select
              value={chain}
              onValueChange={value => {
                setChain(value as Chain);
                setAddressError('');
              }}
            >
              <SelectTrigger id="chain">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {chains.map(c => (
                  <SelectItem key={c} value={c}>
                    {chainMeta[c].name} ({chainMeta[c].symbol})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Input
            label="Address"
            value={address}
            onChange={e => {
              setAddress(e.target.value);
              setAddressError('');
            }}
            placeholder="Enter wallet address"
            required
            error={addressError}
            className="font-mono"
          />

          <Button type="submit" className="mt-2">
            Add Wallet
          </Button>
        </form>
      </main>
    </>
  );
}
