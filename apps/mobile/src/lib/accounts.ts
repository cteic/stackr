import type { Chain, Wallet } from '@stackr/models';
import { validateAddress } from '@stackr/models';

/**
 * The wallet's account list, assembled from the two key sources described in
 * ADR 0020: Privy embedded wallets (Ethereum + Solana) and locally-derived
 * accounts via `@stackr/signer` (BTC / STX / SUI). Until the signer package
 * merges, the local chains surface as `pending` rows — visible in the UI,
 * excluded from network reads.
 */
export interface WalletAccount {
  wallet: Wallet;
  source: 'privy' | 'local';
}

export interface PendingChain {
  chain: Chain;
  reason: 'signer-not-integrated';
}

export interface AccountSources {
  ethereumAddress: string | null;
  solanaAddress: string | null;
}

export interface AccountsView {
  accounts: WalletAccount[];
  pending: PendingChain[];
}

const LOCAL_CHAINS: readonly Chain[] = ['btc', 'stx', 'sui'];

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

  const candidates: Array<{ chain: Chain; address: string | null; label: string }> = [
    { chain: 'eth', address: sources.ethereumAddress, label: 'Ethereum' },
    { chain: 'sol', address: sources.solanaAddress, label: 'Solana' },
  ];

  for (const candidate of candidates) {
    if (candidate.address === null) continue;
    const result = validateAddress(candidate.chain, candidate.address);
    if (!result.valid) continue;
    const identity = makeIdentity();
    accounts.push({
      source: 'privy',
      wallet: {
        id: identity.id,
        createdAt: identity.createdAt,
        chain: candidate.chain,
        address: candidate.address,
        label: candidate.label,
      },
    });
  }

  const pending: PendingChain[] = LOCAL_CHAINS.map(chain => ({
    chain,
    reason: 'signer-not-integrated',
  }));

  return { accounts, pending };
}
