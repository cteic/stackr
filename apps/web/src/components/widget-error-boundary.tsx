'use client';

import type { ReactNode } from 'react';
import { Button, Card, ErrorBoundary } from '@stackr/ui';

interface WidgetErrorBoundaryProps {
  /** Human-readable label for the section, used in the fallback copy. */
  title: string;
  children: ReactNode;
}

/**
 * Per-widget error boundary for the dashboard. Wraps a single section so a
 * render-time crash in one widget (e.g. a malformed position or activity item)
 * shows a compact inline fallback with a retry, instead of taking down the
 * whole page. Reusable across widgets via the `title` label — distinct from the
 * route-level `error.tsx`/`global-error.tsx`, which catch whole-page failures.
 */
export function WidgetErrorBoundary({ title, children }: WidgetErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={({ reset }) => (
        <Card className="mt-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Couldn&rsquo;t load {title}.</p>
            <Button variant="outline" size="sm" onClick={reset}>
              Retry
            </Button>
          </div>
        </Card>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
