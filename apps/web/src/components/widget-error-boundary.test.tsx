import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WidgetErrorBoundary } from './widget-error-boundary';

function Bomb(): never {
  throw new Error('render exploded');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WidgetErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <WidgetErrorBoundary label="Liquidation health">
        <p>healthy content</p>
      </WidgetErrorBoundary>,
    );

    expect(screen.getByText('healthy content')).toBeDefined();
    expect(screen.queryByText(/unavailable/)).toBeNull();
  });

  it('degrades a throwing child to the labelled inline card', () => {
    // React logs caught boundary errors; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <WidgetErrorBoundary label="Liquidation health">
        <Bomb />
      </WidgetErrorBoundary>,
    );

    expect(screen.getByText('Liquidation health unavailable')).toBeDefined();
    expect(screen.getByText(/rest of your portfolio is unaffected/)).toBeDefined();
  });

  it('contains the failure — siblings outside the boundary still render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <>
        <WidgetErrorBoundary label="Collectibles">
          <Bomb />
        </WidgetErrorBoundary>
        <p>sibling widget</p>
      </>,
    );

    expect(screen.getByText('Collectibles unavailable')).toBeDefined();
    expect(screen.getByText('sibling widget')).toBeDefined();
  });
});
