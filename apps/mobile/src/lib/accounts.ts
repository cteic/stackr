import type { Chain, Wallet } from '@stackr/models';
import { validateAddress } from '@stackr/models';

/**
 * The wallet's account list, assembled from the two key sources described in
 * ADR 0020: Privy embedded wallets (Ethereum + Solana) and locally-derived
 * accounts via `@stackr/signer` (BTC / STX / SUI). Local chains surface as
 * `pending` rows only for the moment between login and the silent-seed
 * derivation finishing — visible in the UI, excluded from network reads.
 */
export interface WalletAccount {
  wallet: Wallet;
  source: 'privy' | 'local';
}

export interface PendingChain {
  chain: Chain;
  reason: 'seed-not-ready';
}

export interface LocalAddresses {
  btc: string | null;
  stx: string | null;
  sui: string | null;
}

export interface AccountSources {
  ethereumAddress: string | null;
  solanaAddress: string | null;
  localAddresses: LocalAddresses;
}

export interface AccountsView {
  accounts: WalletAccount[];
  pending: PendingChain[];
}

const LOCAL_CHAINS = ['btc', 'stx', 'sui'] as const;

interface WalletIdentity {
  id: string;
  createdAt: string;
}

/**
 * Pure assembly: id/timestamp generation is injected so the mapping is
 * deterministic under test. Addresses are validated with the models-layer
 * validators before becoming rows — a malformed address from any upstream is
 * dropped rather than queried.
 */
export function buildAccountsView(
  sources: AccountSources,
  makeIdentity: () => WalletIdentity,
): AccountsView {
  const accounts: WalletAccount[] = [];

  const candidates: Array<{
    chain: Chain;
    address: string | null;
    label: string;
    source: WalletAccount['source'];
  }> = [
    { chain: 'eth', address: sources.ethereumAddress, label: 'Ethereum', source: 'privy' },
    { chain: 'sol', address: sources.solanaAddress, label: 'Solana', source: 'privy' },
    { chain: 'btc', address: sources.localAddresses.btc, label: 'Bitcoin', source: 'local' },
    { chain: 'stx', address: sources.localAddresses.stx, label: 'Stacks', source: 'local' },
    { chain: 'sui', address: sources.localAddresses.sui, label: 'Sui', source: 'local' },
  ];

  for (const candidate of candidates) {
    if (candidate.address === null) continue;
    const result = validateAddress(candidate.chain, candidate.address);
    if (!result.valid) continue;
    const identity = makeIdentity();
    accounts.push({
      source: candidate.source,
      wallet: {
        id: identity.id,
        createdAt: identity.createdAt,
        chain: candidate.chain,
        address: candidate.address,
        label: candidate.label,
      },
    });
  }

  const pending: PendingChain[] = LOCAL_CHAINS.filter(
    chain => sources.localAddresses[chain] === null,
  ).map(chain => ({ chain, reason: 'seed-not-ready' }));

  return { accounts, pending };
}
