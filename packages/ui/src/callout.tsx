import type { HTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from './lib/utils.js';

const calloutVariants = cva('flex gap-3 rounded-lg border p-4', {
  variants: {
    variant: {
      info: 'border-ring/30 bg-ring/10 text-ring',
      warning: 'border-warning/30 bg-warning/10 text-warning',
      error: 'border-destructive/30 bg-destructive/10 text-destructive',
      success: 'border-success/30 bg-success/10 text-success',
    },
  },
  defaultVariants: {
    variant: 'info',
  },
});

export type CalloutVariant = 'info' | 'warning' | 'error' | 'success';

export interface CalloutProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof calloutVariants> {
  icon?: ReactNode;
}

const variantIcons: Record<CalloutVariant, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
  success: CheckCircle2,
};

export const Callout = forwardRef<HTMLDivElement, CalloutProps>(
  ({ variant = 'info', icon, className, children, ...props }, ref) => {
    const VariantIcon = variantIcons[variant!];
    return (
      <div
        ref={ref}
        className={cn(calloutVariants({ variant, className }))}
        role="alert"
        {...props}
      >
        <span className="mt-0.5 shrink-0">
          {icon ?? <VariantIcon className="h-4 w-4" aria-hidden="true" />}
        </span>
        <div className="min-w-0">{children}</div>
      </div>
    );
  },
);

Callout.displayName = 'Callout';
