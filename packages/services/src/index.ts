import type { Balance, Chain } from '@stackr/models';
import { btcBalanceAdapter } from './btc.js';
import { stxBalanceAdapter } from './stx.js';
import { ethBalanceAdapter } from './eth.js';
import { solBalanceAdapter } from './sol.js';
import { suiBalanceAdapter } from './sui.js';
import type { BalanceAdapter } from './ports.js';

// Provider ports (the contracts the app depends on) and the concrete adapters.
export type {
  BalanceAdapter,
  PriceAdapter,
  TransactionAdapter,
  StockAdapter,
  OrderBookAdapter,
  HealthAdapter,
  NftAdapter,
} from './ports.js';

export { fetchBtcBalance, btcBalanceAdapter } from './btc.js';
export { fetchStxBalance, lookupStacksBnsName, stxBalanceAdapter } from './stx.js';
export { fetchEthBalance, ethBalanceAdapter } from './eth.js';
export { fetchSolBalance, solBalanceAdapter } from './sol.js';
export { fetchSuiBalance, suiBalanceAdapter } from './sui.js';
export {
  fetchPrices,
  fetchPriceHistory,
  normalizeCoinGeckoPrices,
  normalizeMarketChart,
  coinGeckoPriceAdapter,
} from './prices.js';
export { fetchGoldPrice, normalizeGoldPrice, type GoldPrice } from './gold.js';
export { ETH_PROXY_PATH, ethPublicRpcUrl, resolveEthRpcUrl } from './eth-rpc.js';
export {
  ETHERSCAN_PROXY_PATH,
  etherscanPublicBase,
  resolveEtherscanBase,
} from './etherscan-config.js';
export { STOCKS_PROXY_PATH, stocksPublicBase, resolveStocksBase } from './stocks-config.js';
export { assertValidAddress } from './address-guard.js';
export { parseOrThrow } from './validate.js';
export { ServiceException, isServiceException, type ServiceError } from './service-error.js';
export { safeFetch } from './fetch-wrapper.js';
export { formatBaseUnits } from './base-units.js';
export { formatFiat, formatUsd, formatCrypto, formatChange, maskFiat } from './format.js';
export {
  serializeOrderBook,
  generateMockOrderBook,
  createKrakenOrderBookWs,
  createBookState,
  applyBookFrame,
  bookStateToLadders,
  orderBookAdapter,
  type KrakenWebSocketMessage,
  type KrakenBookLevel,
  type BookState,
} from './orderbook.js';
export {
  parseTickerFrame,
  createKrakenTickerWs,
  type Tick,
  type KrakenTickerMessage,
} from './ticker.js';
export {
  fetchTransactions,
  transactionAdapter,
  normalizeBtcTransactions,
  normalizeEthTransactions,
  normalizeStxTransactions,
  normalizeSolTransactions,
  normalizeSuiTransactions,
} from './transactions.js';
export { getExplorerUrl } from './explorers.js';
export {
  searchStocks,
  fetchStockQuote,
  fetchStockQuotes,
  fetchStockPriceHistory,
  parseDailyCloses,
  alphaVantageStockAdapter,
  type StockSearchResult,
  type StockQuote,
} from './stocks.js';

export {
  fetchAavePosition,
  normalizeAaveAccountData,
  aaveHealthAdapter,
  type AaveAccountData,
} from './health/aave.js';
export {
  fetchKaminoPosition,
  normalizeKaminoObligations,
  kaminoHealthAdapter,
  type KaminoObligation,
} from './health/kamino.js';
export { fetchZestPosition, normalizeZestGlobalData, zestHealthAdapter } from './health/zest.js';
export {
  fetchGranitePosition,
  normalizeGranitePosition,
  graniteHealthAdapter,
  type GranitePositionInputs,
} from './health/granite.js';
import { aaveHealthAdapter } from './health/aave.js';
import { kaminoHealthAdapter } from './health/kamino.js';
import { zestHealthAdapter } from './health/zest.js';
import { graniteHealthAdapter } from './health/granite.js';
import type { HealthAdapter, NftAdapter } from './ports.js';

export { toIpfsGatewayUrl, DEFAULT_IPFS_GATEWAY } from './nft/ipfs-url.js';
export {
  detectContentType,
  contentTypeFromExtension,
  SUPPORTED_NFT_CONTENT_TYPES,
} from './nft/content-type.js';
export {
  fetchStacksNfts,
  buildStacksNftAsset,
  parseAssetIdentifier,
  tokenIdFromRepr,
  normalizeStxFloor,
  parseHiroMetadata,
  parseGammaMetadata,
  mergeTokenMetadata,
  stacksNftAdapter,
  type StacksNftDeps,
} from './nft/stacks.js';
import { stacksNftAdapter } from './nft/stacks.js';

/**
 * All NFT adapters, one per chain × protocol. The `useNftHoldings` hook fans
 * out across these (filtered to the adapters whose chain it has addresses for)
 * and concatenates the results. Ships the Stacks SIP-9 adapter; the EVM
 * (Alchemy), Bitcoin ordinals/runes/stamps and Solana (Helius) adapters
 * register here in later phases of #93.
 */
export const nftAdapters: readonly NftAdapter[] = [stacksNftAdapter];

/**
 * All liquidation-health adapters, one per protocol. The `useHealthPositions`
 * hook fans out across these (filtered to the adapters whose chain it has
 * addresses for) and merges the non-null results. Ships Aave v3 (EVM), Kamino
 * (SOL) and the Stacks moat — Zest and Granite (STX).
 */
export const healthAdapters: readonly HealthAdapter[] = [
  aaveHealthAdapter,
  kaminoHealthAdapter,
  zestHealthAdapter,
  graniteHealthAdapter,
];

/**
 * Registry of per-chain balance adapters, keyed by chain. Replaces the old
 * hand-written `switch` with a single lookup; `satisfies` guarantees at
 * compile time that every `Chain` has exactly one adapter, so adding a chain
 * is a type error until its adapter is registered here.
 */
const balanceAdapters = {
  btc: btcBalanceAdapter,
  stx: stxBalanceAdapter,
  eth: ethBalanceAdapter,
  sol: solBalanceAdapter,
  sui: suiBalanceAdapter,
} satisfies Record<Chain, BalanceAdapter>;

export async function fetchBalance(chain: Chain, address: string): Promise<Balance> {
  // The ETH adapter's Etherscan key is now app-owned and applied server-side by
  // the `/api/etherscan` proxy, so no per-call key is threaded through.
  return balanceAdapters[chain].fetchBalance(address);
}
