'use client';

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  fallback: (props: { error: Error; reset: () => void }) => ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Reusable React error boundary. Catches render-phase errors from any child
 * subtree and delegates rendering to the `fallback` prop. Call `reset()` from
 * the fallback to clear the error state and re-attempt the render.
 *
 * Must be a class component — the `componentDidCatch` lifecycle has no hook
 * equivalent. Mark the file `'use client'` so Next.js treats it as a Client
 * Component, which is required for error boundaries in the App Router.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error !== null) {
      return this.props.fallback({ error, reset: this.reset });
    }
    return this.props.children;
  }
}
