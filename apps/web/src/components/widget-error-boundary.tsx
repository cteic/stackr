'use client';

import { Component, type ReactNode } from 'react';
import { Card } from '@stackr/ui';

interface WidgetErrorBoundaryProps {
  /** Widget name shown in the fallback so the user knows what degraded. */
  label: string;
  children: ReactNode;
}

interface WidgetErrorBoundaryState {
  hasError: boolean;
}

/**
 * Isolates one dashboard widget's render failure to an inline card instead of
 * blanking the whole page. Class component because error boundaries have no
 * hook equivalent. Data-layer errors are already handled per-query; this
 * catches the render-time bugs those can't.
 */
export class WidgetErrorBoundary extends Component<
  WidgetErrorBoundaryProps,
  WidgetErrorBoundaryState
> {
  state: WidgetErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): WidgetErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-dashed p-4">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {this.props.label} unavailable
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            This section hit an error and was paused. The rest of your portfolio is unaffected —
            reload to retry.
          </p>
        </Card>
      );
    }

    return this.props.children;
  }
}
