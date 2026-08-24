import type { HTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { cn } from './lib/utils.js';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
}

// `bg-muted` sits within a shade of `bg-card` in every theme, so a flat
// fill (or opacity-only `animate-pulse`) is invisible on the card surfaces
// skeletons actually render on. A moving highlight band reads as "loading"
// regardless of how close those two tokens are.
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ width, height = '1em', borderRadius, className, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'animate-shimmer rounded-md border border-border bg-muted bg-linear-to-r from-muted via-accent to-muted bg-[length:200%_100%]',
        className,
      )}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    />
  ),
);

Skeleton.displayName = 'Skeleton';
