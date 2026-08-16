import { describe as feature, it as scenario, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TooltipProvider } from '@stackr/ui';
import type { ReactNode } from 'react';
import { bdd } from '../lib/bdd';
import { useWalletStore } from '../lib/wallet-store';
import { ChainStatusIndicators } from './chain-status-indicators';

const { given, when, then } = bdd;

function renderWithProviders(ui: ReactNode) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

beforeEach(() => {
  useWalletStore.setState({ wallets: [], connectedAddresses: {} });
});
afterEach(cleanup);

feature('chain status indicators', () => {
  scenario('renders a dot for every supported chain', () => {
    when('the header status row renders', () => renderWithProviders(<ChainStatusIndicators />));
    then('all four chain icons are present', () => {
      expect(screen.getByLabelText('ETH icon')).toBeTruthy();
      expect(screen.getByLabelText('SOL icon')).toBeTruthy();
      expect(screen.getByLabelText('STX icon')).toBeTruthy();
      expect(screen.getByLabelText('BTC icon')).toBeTruthy();
    });
  });

  scenario('a connected chain is lit and others are dimmed', () => {
    given('a connected Ethereum address', () =>
      useWalletStore.getState().setConnectedAddresses('eth', ['0xabc']),
    );
    when('the status row renders', () => renderWithProviders(<ChainStatusIndicators />));
    then('the Ethereum dot is at full opacity', () => {
      const ethDot = screen.getByLabelText('ETH icon').parentElement;
      expect(ethDot?.className).toContain('opacity-100');
    });
    then('an unconnected chain is dimmed', () => {
      const solDot = screen.getByLabelText('SOL icon').parentElement;
      expect(solDot?.className).toContain('opacity-50');
    });
  });
});
