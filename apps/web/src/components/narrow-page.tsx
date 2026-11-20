'use client';

import type { ReactNode } from 'react';
import { Header } from '@/components/header';

/**
 * Shared shell for narrow, single-column utility pages (settings, login,
 * account, add wallet, add holding, auth callback). These all carry little
 * content, so centering it in the space below the header reads as a
 * composed screen instead of leaving it stranded at the top with a dead
 * gap above the footer.
 */
export function NarrowPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-6">
        {children}
      </main>
    </div>
  );
}
