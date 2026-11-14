import { describe as feature, it as scenario, expect } from 'vitest';
import { bdd } from './bdd';
const { then } = bdd;
import { detectInstalledWallets } from './wallet-detect';

feature('wallet detection — which extensions are installed', () => {
  scenario('detects MetaMask from an injected ethereum provider', () => {
    const result = detectInstalledWallets({ ethereum: {} });
    then('only MetaMask is reported installed', () => {
      expect(result.metamask).toBe(true);
      expect(result.phantom).toBe(false);
      expect(result.leather).toBe(false);
    });
  });

  scenario('detects Solflare from its provider global', () => {
    const result = detectInstalledWallets({ solflare: {} });
    then('only Solflare is reported installed', () => {
      expect(result.solflare).toBe(true);
      expect(result.phantom).toBe(false);
      expect(result.metamask).toBe(false);
    });
  });

  scenario('detects Phantom and Leather from their provider globals', () => {
    const result = detectInstalledWallets({ phantom: {}, LeatherProvider: {} });
    then('both Phantom and Leather are installed, MetaMask is not', () => {
      expect(result.phantom).toBe(true);
      expect(result.leather).toBe(true);
      expect(result.metamask).toBe(false);
    });
  });

  scenario('reports nothing installed on a bare window', () => {
    const result = detectInstalledWallets({});
    then('no wallet is detected', () => {
      expect(result.metamask).toBe(false);
      expect(result.phantom).toBe(false);
      expect(result.solflare).toBe(false);
      expect(result.leather).toBe(false);
    });
  });
});
