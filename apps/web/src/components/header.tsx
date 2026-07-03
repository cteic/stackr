'use client';

import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@stackr/ui';
import { ChainStatusIndicators } from '@/components/chain-status-indicators';
import { WalletConnectModal } from '@/components/wallet-connect-modal';
import { ThemePicker } from '@/components/theme-picker';
import { useSettingsStore } from '@/lib/settings-store';

export function Header() {
  const hideBalance = useSettingsStore(s => s.hideBalance);
  const toggleHideBalance = useSettingsStore(s => s.toggleHideBalance);

  return (
    <header className="flex items-center justify-between border-b px-5 py-3">
      <Link href="/" className="flex items-center text-lg font-bold tracking-tight text-foreground">
        STACKR<span className="font-medium text-primary">{'////'}</span>
      </Link>
      <nav className="flex items-center gap-5">
        <Link
          href="/wallet/add"
          className="text-xs font-medium uppercase tracking-widest text-primary transition-colors"
        >
          Add Wallet
        </Link>
        <Link
          href="/holdings"
          className="text-xs font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          Holdings
        </Link>
        <Link
          href="/market"
          className="text-xs font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          Markets
        </Link>
        <Link
          href="/collectibles"
          className="text-xs font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          Collectibles
        </Link>
        <Link
          href="/settings"
          className="text-xs font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          Settings
        </Link>
        <ChainStatusIndicators />
        <WalletConnectModal />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleHideBalance}
          aria-label={hideBalance ? 'Show balances' : 'Hide balances'}
        >
          {hideBalance ? (
            <EyeOff className="h-[1.2rem] w-[1.2rem]" />
          ) : (
            <Eye className="h-[1.2rem] w-[1.2rem]" />
          )}
        </Button>
        <ThemePicker />
      </nav>
    </header>
  );
}
