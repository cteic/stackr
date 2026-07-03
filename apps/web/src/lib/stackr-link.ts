'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { validateAddress, type Chain } from '@stackr/models';
import { AnnouncedAddressSchema, type AnnouncedAddress } from '@stackr/wallet-link/messages';
import type { WebLinkSession } from '@stackr/wallet-link';
import { useWalletStore } from '@/lib/wallet-store';

/**
 * Stackr Link: pair the Stackr Wallet mobile signer with the web portfolio.
 *
 * Mirrors the Leather/Slush split: this module owns the session lifecycle and
 * address persistence, the connect modal owns the UI. The heavy pieces (the
 * link protocol, its crypto, and the realtime client) load only when the user
 * actually starts a pairing — the modal itself stays light.
 *
 * The pairing relay carries only end-to-end encrypted envelopes; addresses are
 * validated (schema + per-chain format) before they touch the wallet store,
 * and persist locally so the link survives a refresh, exactly like the other
 * remembered wallet sessions.
 */

const STORAGE_KEY = 'stackr-link-addresses';
const StoredAddressesSchema = AnnouncedAddressSchema.array();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Whether pairing is configured for this deployment. */
export function isStackrLinkAvailable(): boolean {
  return Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);
}

/** Validated addresses from a previous pairing, or `[]` for junk/absence. */
export function readStoredLinkAddresses(): AnnouncedAddress[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  const parsed = StoredAddressesSchema.safeParse(json);
  if (!parsed.success) return [];
  return parsed.data.filter(entry => validateAddress(entry.chain, entry.address).valid);
}

function writeStoredLinkAddresses(addresses: AnnouncedAddress[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
}

function clearStoredLinkAddresses(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Group announced addresses into the wallet store's per-chain shape. */
export function groupAddressesByChain(
  addresses: AnnouncedAddress[],
): Partial<Record<Chain, string[]>> {
  const grouped: Partial<Record<Chain, string[]>> = {};
  for (const { chain, address } of addresses) {
    const bucket = grouped[chain] ?? [];
    if (!bucket.includes(address)) bucket.push(address);
    grouped[chain] = bucket;
  }
  return grouped;
}

export interface StackrLinkConnection {
  /** Pairing needs the realtime relay configured at build time. */
  available: boolean;
  connected: boolean;
  /** Chains the linked wallet contributes. */
  chains: Chain[];
  /** Write a fresh announcement into the store and remember it. */
  applyAnnouncedAddresses: (addresses: AnnouncedAddress[]) => void;
  disconnect: () => void;
}

/**
 * Connected state + restore for the linked Stackr Wallet. Mount this where the
 * connect UI lives (the modal is always mounted in the header), so a
 * remembered link repopulates the store after a refresh like Leather/Slush do.
 */
export function useStackrLinkConnection(): StackrLinkConnection {
  const setConnectedAddresses = useWalletStore(s => s.setConnectedAddresses);
  const clearConnectedAddresses = useWalletStore(s => s.clearConnectedAddresses);
  const [chains, setChains] = useState<Chain[]>([]);

  const applyGrouped = useCallback(
    (grouped: Partial<Record<Chain, string[]>>) => {
      const linkedChains: Chain[] = [];
      for (const [chain, addresses] of Object.entries(grouped)) {
        const parsedChain = AnnouncedAddressSchema.shape.chain.safeParse(chain);
        if (!parsedChain.success || addresses === undefined || addresses.length === 0) continue;
        setConnectedAddresses(parsedChain.data, addresses);
        linkedChains.push(parsedChain.data);
      }
      setChains(linkedChains);
    },
    [setConnectedAddresses],
  );

  // Restore a remembered link on mount.
  useEffect(() => {
    const stored = readStoredLinkAddresses();
    if (stored.length === 0) return;
    applyGrouped(groupAddressesByChain(stored));
  }, [applyGrouped]);

  const applyAnnouncedAddresses = useCallback(
    (addresses: AnnouncedAddress[]) => {
      writeStoredLinkAddresses(addresses);
      applyGrouped(groupAddressesByChain(addresses));
    },
    [applyGrouped],
  );

  const disconnect = useCallback(() => {
    clearStoredLinkAddresses();
    for (const chain of chains) clearConnectedAddresses(chain);
    setChains([]);
  }, [chains, clearConnectedAddresses]);

  return {
    available: isStackrLinkAvailable(),
    connected: chains.length > 0,
    chains,
    applyAnnouncedAddresses,
    disconnect,
  };
}

export type StackrLinkPairingStatus = 'idle' | 'starting' | 'waiting' | 'paired' | 'error';

export interface StackrLinkPairing {
  status: StackrLinkPairingStatus;
  /** The QR payload to render while `status === 'waiting'`. */
  qrText: string | null;
  start: () => void;
  cancel: () => void;
}

/**
 * Drives one pairing attempt: create the session, show the QR, wait for the
 * wallet's announcement, then close the channel — the addresses are persisted
 * and the realtime relay has no further job in a read-only portfolio.
 */
export function useStackrLinkPairing(
  onAddresses: (addresses: AnnouncedAddress[]) => void,
): StackrLinkPairing {
  const [status, setStatus] = useState<StackrLinkPairingStatus>('idle');
  const [qrText, setQrText] = useState<string | null>(null);
  const sessionRef = useRef<WebLinkSession | null>(null);
  const onAddressesRef = useRef(onAddresses);
  onAddressesRef.current = onAddresses;

  const teardown = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) void session.disconnect().catch(() => undefined);
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(() => {
    if (sessionRef.current || SUPABASE_URL === undefined || SUPABASE_ANON_KEY === undefined) {
      return;
    }
    setStatus('starting');
    void Promise.all([import('@stackr/wallet-link'), import('@stackr/wallet-link/supabase')])
      .then(([link, supabase]) => {
        const transport = supabase.createSupabaseLinkTransport({
          url: SUPABASE_URL,
          anonKey: SUPABASE_ANON_KEY,
        });
        const session = link.WebLinkSession.create(transport);
        session.onAddresses = addresses => {
          onAddressesRef.current(addresses);
          setStatus('paired');
          teardown();
        };
        session.onPeerDisconnect = () => {
          sessionRef.current = null;
          setStatus(current => (current === 'paired' ? current : 'idle'));
        };
        sessionRef.current = session;
        setQrText(session.qrPayload());
        setStatus('waiting');
      })
      .catch(() => {
        setStatus('error');
      });
  }, [teardown]);

  const cancel = useCallback(() => {
    teardown();
    setQrText(null);
    setStatus('idle');
  }, [teardown]);

  return { status, qrText, start, cancel };
}
