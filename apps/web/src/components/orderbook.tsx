'use client';

import { useState } from 'react';
import type { OrderBook } from '@stackr/models';
import { formatUsd } from '@stackr/services';
import { Card } from '@stackr/ui';

interface OrderbookProps {
  orderbook: OrderBook;
}

export function Orderbook({ orderbook }: OrderbookProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoveredSide, setHoveredSide] = useState<'bid' | 'ask' | null>(null);

  const maxCumulative = Math.max(
    orderbook.bids[orderbook.bids.length - 1]?.cumulativeAmount ?? 0,
    orderbook.asks[orderbook.asks.length - 1]?.cumulativeAmount ?? 0,
  );

  const displayBids = orderbook.bids.slice(0, 15);
  const displayAsks = orderbook.asks.slice(0, 15);

  return (
    <Card className="overflow-hidden">
      <div className="p-3 text-sm font-semibold border-b">Order Book — {orderbook.pair}</div>

      {/* Asks (reversed so lowest ask is at bottom) */}
      <div>
        <div className="grid grid-cols-3 px-3 py-1 text-xs text-muted-foreground border-b">
          <span>Price</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Total</span>
        </div>
        {[...displayAsks].reverse().map((order, i) => {
          const fillPct = (order.cumulativeAmount / maxCumulative) * 100;
          const isHovered = hoveredSide === 'ask' && hoveredIndex === i;
          return (
            <div
              key={`ask-${i}`}
              className={`grid grid-cols-3 px-3 py-0.5 relative cursor-pointer font-mono text-xs transition-colors ${isHovered ? 'bg-destructive/8' : ''}`}
              onMouseEnter={() => {
                setHoveredIndex(i);
                setHoveredSide('ask');
              }}
              onMouseLeave={() => {
                setHoveredIndex(null);
                setHoveredSide(null);
              }}
            >
              <div
                className="absolute right-0 top-0 bottom-0 pointer-events-none bg-destructive/6"
                style={{ width: `${fillPct}%` }}
              />
              <span className="text-destructive">{formatUsd(order.price)}</span>
              <span className="text-right">{order.amount.toFixed(4)}</span>
              <span className="text-right">{order.cumulativeAmount.toFixed(4)}</span>
            </div>
          );
        })}
      </div>

      {/* Spread indicator */}
      {orderbook.bids.length > 0 && orderbook.asks.length > 0 && (
        <div className="text-center py-1 text-xs text-muted-foreground border-y bg-muted/30">
          Spread: {formatUsd(orderbook.asks[0].price - orderbook.bids[0].price)} (
          {(
            ((orderbook.asks[0].price - orderbook.bids[0].price) / orderbook.asks[0].price) *
            100
          ).toFixed(3)}
          %)
        </div>
      )}

      {/* Bids */}
      <div>
        {displayBids.map((order, i) => {
          const fillPct = (order.cumulativeAmount / maxCumulative) * 100;
          const isHovered = hoveredSide === 'bid' && hoveredIndex === i;
          return (
            <div
              key={`bid-${i}`}
              className={`grid grid-cols-3 px-3 py-0.5 relative cursor-pointer font-mono text-xs transition-colors ${isHovered ? 'bg-success/8' : ''}`}
              onMouseEnter={() => {
                setHoveredIndex(i);
                setHoveredSide('bid');
              }}
              onMouseLeave={() => {
                setHoveredIndex(null);
                setHoveredSide(null);
              }}
            >
              <div
                className="absolute right-0 top-0 bottom-0 pointer-events-none bg-success/6"
                style={{ width: `${fillPct}%` }}
              />
              <span className="text-success">{formatUsd(order.price)}</span>
              <span className="text-right">{order.amount.toFixed(4)}</span>
              <span className="text-right">{order.cumulativeAmount.toFixed(4)}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
