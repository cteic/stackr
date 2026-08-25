'use client';

import { Button, Callout, Card, Skeleton } from '@stackr/ui';
import { useNftHoldings, type NftAddressesByChain } from '@stackr/queries';
import { createNftCardView } from '@stackr/features';
import { NftMedia } from './nft-media';

interface CollectiblesProps {
  /**
   * Watched + connected addresses to read collectibles for, grouped by chain.
   * Ships Stacks SIP-9 (STX addresses); EVM / ordinals / Solana plug in here
   * as their adapters land (#93).
   */
  addressesByChain: NftAddressesByChain;
  hideBalance?: boolean;
}

export function Collectibles({ addressesByChain, hideBalance = false }: CollectiblesProps) {
  const { assets, isLoading, isFetching, isError, refresh } = useNftHoldings(addressesByChain);
  const cards = assets.map(asset => createNftCardView(asset, { hideBalance }));

  return (
    <Card className="mt-4 p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Collectibles</h2>
        <Button variant="outline" size="sm" onClick={refresh} disabled={isFetching}>
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Floor values are estimates and aren&apos;t included in your portfolio total.
      </p>

      {isError && (
        <Callout variant="error" className="mb-3">
          {cards.length === 0
            ? "Couldn't load collectibles — one or more chain reads failed."
            : 'Some chain reads failed — collectibles below may be incomplete.'}
        </Callout>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          <Skeleton height="11em" />
          <Skeleton height="11em" />
          <Skeleton height="11em" />
          <Skeleton height="11em" />
        </div>
      ) : cards.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {isError ? 'No collectibles confirmed.' : 'No collectibles found'}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {cards.map(card => (
            <li key={card.key}>
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="aspect-square overflow-hidden bg-muted">
                  <NftMedia media={card.media} mode="thumbnail" alt={card.name} />
                </div>
                <div className="p-2">
                  <div className="truncate text-xs font-medium text-foreground" title={card.name}>
                    {card.name}
                  </div>
                  {card.collectionName && (
                    <div
                      className="truncate text-xs text-muted-foreground"
                      title={card.collectionName}
                    >
                      {card.collectionName}
                    </div>
                  )}
                  {card.floorText && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {card.floorLabel}{' '}
                      <span className="font-mono text-foreground">{card.floorText}</span>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
