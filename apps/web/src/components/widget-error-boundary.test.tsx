import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { WidgetErrorBoundary } from './widget-error-boundary';

function Boom(): never {
  throw new Error('widget exploded');
}

// React logs caught render errors via componentDidCatch; silence it so the
// suite output stays clean while the boundary does its job.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WidgetErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <WidgetErrorBoundary title="recent activity">
        <p>healthy content</p>
      </WidgetErrorBoundary>,
    );

    expect(screen.getByText('healthy content')).toBeTruthy();
  });

  it('renders the fallback with the section title when a child throws', () => {
    render(
      <WidgetErrorBoundary title="liquidation health">
        <Boom />
      </WidgetErrorBoundary>,
    );

    expect(screen.getByText(/Couldn.t load liquidation health\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('re-attempts the render when Retry is pressed', () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('still broken');
      return <p>recovered</p>;
    }

    render(
      <WidgetErrorBoundary title="recent activity">
        <Flaky />
      </WidgetErrorBoundary>,
    );

    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.getByText('recovered')).toBeTruthy();
  });
});
