import type { HTMLAttributes } from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from './lib/utils.js';

/**
 * The one sentence every wallet surface must state: keys stay on the device
 * and Stackr never holds them (App Review 3.1.5 wallet requirements). Exported
 * so pages and tests quote the same wording rather than a paraphrase of it.
 */
export const NON_CUSTODIAL_STATEMENT =
  'Your keys are generated on your device and never leave it. Stackr cannot access, move or recover your funds.';

export interface NonCustodialNoticeProps extends HTMLAttributes<HTMLDivElement> {
  /** Short heading above the statement; doubles as the accessible name. */
  heading?: string;
}

/**
 * A static, non-interruptive notice — `role="note"` rather than the Callout's
 * `role="alert"`, because nothing has happened that a screen reader should
 * announce over the page.
 */
export function NonCustodialNotice({
  heading = 'Non-custodial',
  className,
  ...props
}: NonCustodialNoticeProps) {
  return (
    <div
      role="note"
      aria-label={heading}
      className={cn(
        'flex gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm',
        className,
      )}
      {...props}
    >
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold text-foreground">{heading}</p>
        <p className="text-muted-foreground">{NON_CUSTODIAL_STATEMENT}</p>
      </div>
    </div>
  );
}
