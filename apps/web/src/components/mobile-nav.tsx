'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@stackr/ui';
import { isNavLinkActive, NAV_LINK_CLASS } from '@/lib/nav-active';

const LINKS: { href: string; label: string; primary?: boolean }[] = [
  { href: '/wallet/add', label: 'Add Wallet', primary: true },
  { href: '/holdings', label: 'Holdings' },
  { href: '/market', label: 'Markets' },
  { href: '/collectibles', label: 'Collectibles' },
  { href: '/account', label: 'Account' },
  { href: '/settings', label: 'Settings' },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu">
          <Menu className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {LINKS.map(link => (
          <DropdownMenuItem key={link.href} asChild>
            <Link
              href={link.href}
              aria-current={isNavLinkActive(pathname, link.href) ? 'page' : undefined}
              className={
                link.primary
                  ? 'text-xs font-medium uppercase tracking-widest text-primary'
                  : NAV_LINK_CLASS(isNavLinkActive(pathname, link.href))
              }
            >
              {link.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
