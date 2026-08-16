import type { SVGAttributes } from 'react';
import { forwardRef } from 'react';
import { cn } from './lib/utils.js';

type ChainType = 'btc' | 'stx' | 'eth' | 'sol' | 'sui';
type AvatarSize = 'sm' | 'md' | 'lg';

export interface ChainAvatarProps extends Omit<SVGAttributes<SVGSVGElement>, 'children'> {
  chain: ChainType;
  size?: AvatarSize;
}

// Sourced from the `--color-chain-*` design tokens (globals.css) rather than
// duplicated here, so avatars pick up the same brand colour every consumer
// of the token already renders with (e.g. the 404/500 logo mark) instead of
// silently drifting from it.
const chainColorVars: Record<ChainType, string> = {
  btc: 'var(--color-chain-btc)',
  stx: 'var(--color-chain-stx)',
  eth: 'var(--color-chain-eth)',
  sol: 'var(--color-chain-sol)',
  sui: 'var(--color-chain-sui)',
};

// Full tickers, not initials: BTC/STX/SOL/SUI all start with the same
// letter-ish sound, so a single-character label left Solana, Stacks, and Sui
// visually identical. Every ticker here happens to be three characters.
const chainLabels: Record<ChainType, string> = {
  btc: 'BTC',
  stx: 'STX',
  eth: 'ETH',
  sol: 'SOL',
  sui: 'SUI',
};

const sizeMap: Record<AvatarSize, number> = {
  sm: 24,
  md: 32,
  lg: 40,
};

export const ChainAvatar = forwardRef<SVGSVGElement, ChainAvatarProps>(
  ({ chain, size = 'md', className, ...props }, ref) => {
    const px = sizeMap[size];
    const color = chainColorVars[chain];
    const label = chainLabels[chain];

    return (
      <svg
        ref={ref}
        width={px}
        height={px}
        viewBox="0 0 40 40"
        className={cn('shrink-0', className)}
        aria-label={`${chain.toUpperCase()} icon`}
        {...props}
      >
        <circle cx="20" cy="20" r="20" fill={color} opacity="0.15" />
        <text
          x="20"
          y="20"
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontFamily="ui-monospace, 'IBM Plex Mono', monospace"
          fontWeight="700"
          fontSize="11"
          letterSpacing="-0.3"
        >
          {label}
        </text>
      </svg>
    );
  },
);

ChainAvatar.displayName = 'ChainAvatar';
