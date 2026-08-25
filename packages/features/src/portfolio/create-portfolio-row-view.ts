import type { Balance, Chain, Currency, Price, Wallet } from '@stackr/models';
import { chainMeta } from '@stackr/models';
import { formatChange, formatFiat, maskFiat } from '@stackr/services';

export type ChangeDirection = 'positive' | 'negative';

export interface PortfolioRowSettings {
  /** Display currency the fiat value should be formatted in. */
  currency: Currency;
  /** When true, fiat amounts are masked rather than shown. */
  hideBalance: boolean;
}

export interface PortfolioRowInput {
  wallet: Wallet;
  balance?: Balance;
  price?: Price;
  settings: PortfolioRowSettings;
}

/**
 * Render-ready shape for a single portfolio row. Every field is a primitive
 * the UI paints directly — no further formatting or branching in the view.
 */
export interface PortfolioRowView {
  /** Wallet label. */
  title: string;
  /** Full chain name, e.g. "Bitcoin". */
  chainName: string;
  /** Address truncated for display, e.g. "bc1qab…f4k2". */
  truncatedAddress: string;
  /** Human balance with ticker, e.g. "0.5 BTC". Null when no balance yet. */
  symbolText: string | null;
  /** Masked/formatted fiat value, e.g. "$1,234.56" or "••••". Null when unpriced. */
  fiatText: string | null;
  /** 24h change, e.g. "+1.20%". Null when no price. */
  changeText: string | null;
  /** Direction of the 24h change, for colouring. Null when no price. */
  changeDirection: ChangeDirection | null;
  /** Brand colour for the chain, for accents/legends. */
  chainColor: string;
}

// Brand colours per chain. Kept here (rather than in the UI) so any platform
// rendering a portfolio row gets the same accent without redefining the map.
const chainColors: Record<Chain, string> = {
  btc: '#F7931A',
  eth: '#627EEA',
  stx: '#5546FF',
  sol: '#9945FF',
  sui: '#4DA2FF',
};

/**
 * Transforms a wallet plus its (optional) balance and price into a
 * platform-independent view model. Pure: same input always yields the same
 * output, no DOM or platform access. Consumed in a React Query `select` or a
 * controller selector; each platform supplies its own rendering.
 */
export function createPortfolioRowView(input: PortfolioRowInput): PortfolioRowView {
  const { wallet, balance, price, settings } = input;
  const meta = chainMeta[wallet.chain];

  const truncatedAddress = `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`;

  const symbolText = balance ? `${balance.balance} ${meta.symbol}` : null;

  const fiatValue = balance && price ? parseFloat(balance.balance) * price.fiatPrice : undefined;
  const fiatText =
    fiatValue !== undefined
      ? maskFiat(formatFiat(fiatValue, settings.currency), settings.hideBalance)
      : null;

  const changeText = price ? formatChange(price.change24h) : null;
  const changeDirection: ChangeDirection | null = price
    ? price.change24h >= 0
      ? 'positive'
      : 'negative'
    : null;

  return {
    title: wallet.label,
    chainName: meta.name,
    truncatedAddress,
    symbolText,
    fiatText,
    changeText,
    changeDirection,
    chainColor: chainColors[wallet.chain],
  };
}
