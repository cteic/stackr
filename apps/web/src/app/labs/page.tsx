'use client';

import dynamic from 'next/dynamic';

/**
 * The demo's controllers hold live wallet adapters (wagmi and the Solana
 * adapters), so the whole demo loads as its own client chunk instead of
 * adding those libraries to this route's first load.
 */
const LabsDemo = dynamic(() => import('./labs-demo').then(module => module.LabsDemo), {
  ssr: false,
});

export default function LabsPage() {
  return <LabsDemo />;
}
