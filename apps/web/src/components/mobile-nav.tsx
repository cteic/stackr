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
        {LINKS.map(link => {
          const active = pathname === link.href;
          return (
            <DropdownMenuItem key={link.href} asChild>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`text-xs font-medium uppercase tracking-widest ${
                  link.primary
                    ? 'text-primary'
                    : active
                      ? 'text-foreground font-semibold'
                      : 'text-muted-foreground'
                }`}
              >
                {link.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
