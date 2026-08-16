'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@stackr/ui';
import { ChainStatusIndicators } from '@/components/chain-status-indicators';
import { WalletConnectModal } from '@/components/wallet-connect-modal';
import { ThemePicker } from '@/components/theme-picker';
import { MobileNav } from '@/components/mobile-nav';
import { useSettingsStore } from '@/lib/settings-store';
import { isNavLinkActive, NAV_LINK_CLASS } from '@/lib/nav-active';

const DESTINATIONS = [
  { href: '/holdings', label: 'Holdings' },
  { href: '/market', label: 'Markets' },
  { href: '/collectibles', label: 'Collectibles' },
  { href: '/account', label: 'Account' },
  { href: '/settings', label: 'Settings' },
] as const;

export function Header() {
  const pathname = usePathname();
  const hideBalance = useSettingsStore(s => s.hideBalance);
  const toggleHideBalance = useSettingsStore(s => s.toggleHideBalance);

  return (
    <header className="flex items-center justify-between border-b px-4 py-3 md:px-5">
      <Link href="/" className="flex items-center text-lg font-bold tracking-tight text-foreground">
        STACKR<span className="font-medium text-primary">{'////'}</span>
      </Link>
      <nav className="flex items-center gap-3 md:gap-5">
        <div className="hidden items-center gap-5 md:flex">
          <Link
            href="/wallet/add"
            className="text-xs font-medium uppercase tracking-widest text-primary transition-colors"
          >
            Add Wallet
          </Link>
          {DESTINATIONS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={isNavLinkActive(pathname, href) ? 'page' : undefined}
              className={NAV_LINK_CLASS(isNavLinkActive(pathname, href))}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="md:hidden">
          <MobileNav />
        </div>
        <div className="hidden sm:flex">
          <ChainStatusIndicators />
        </div>
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
