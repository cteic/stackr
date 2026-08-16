import type { HTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { cn } from './lib/utils.js';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ width, height = '1em', borderRadius, className, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('animate-pulse rounded-md border border-border bg-muted', className)}
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
