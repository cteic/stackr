import type { HealthPosition, HealthPositionNative } from '@stackr/models';
import { assertValidAddress } from '../address-guard.js';
import { HealthPositionSchema } from '@stackr/models';
import type { HealthAdapter } from '../ports.js';
import { parseOrThrow } from '../validate.js';
import { formatBaseUnits } from '../base-units.js';
import { callReadOnly, type CallReadDeps } from './hiro-call-read.js';
import { expectOk, tupleString, tupleUint, type ClarityArg, type ClarityValue } from './clarity.js';

/**
 * Arkadiko (Stacks) liquidation-health adapter — the third Stacks protocol and
 * the Q3 roadmap item. Arkadiko is a CDP protocol: users lock collateral (STX,
 * stSTX, xBTC, sBTC) in per-token vaults and mint the USDA stablecoin against
 * it. A vault is liquidatable when its collateral-to-debt ratio falls under the
 * token's liquidation ratio, so the normalization inverts the CDP ratio:
 *
 *   liquidationRisk = liquidation-ratio / collateral-to-debt-ratio
 *
 * 1.0 sits exactly at the threshold, `>= 1` is liquidatable — consistent with
 * the LTV-style adapters (an LTV is just the reciprocal view of a CDP ratio).
 *
 * The ratio itself replicates `arkadiko-vaults-helpers-v1-1.get-collateral-to-debt`
 * verbatim (it is a `define-public`, which Hiro's read-only endpoint refuses to
 * evaluate, so the math must live here):
 *
 *   stability-fee = ((fee-bps * debt) / 10000) * vault-blocks / (144 * 365)
 *   ratio-bps     = ((collateral * last-price * 100) / (debt + stability-fee))
 *                     / (price-scale / 100)
 *
 * with the same integer-division order, so this adapter agrees with the
 * protocol's own accounting to the unit.
 */

/**
 * Pinned mainnet identifiers — all verified against the LIVE chain on
 * 2026-07-08 via Hiro (`/v2/contracts/interface` for the signatures,
 * `/v2/contracts/call-read` for real responses):
 *   - `arkadiko-vaults-data-v1-1.get-vault(owner, token)` →
 *     `(ok {collateral, debt, last-block, status})`
 *   - `arkadiko-vaults-tokens-v1-1.get-token-list()` → the four collateral
 *     tokens (wSTX, stSTX, xBTC, sBTC); `get-token(token)` →
 *     `(ok {token-name, liquidation-ratio, stability-fee, …})` (140% / bps)
 *   - `arkadiko-oracle-v2-3.get-price(token-name)` →
 *     `{last-price, decimals, last-block}` where `decimals` is the SCALE
 *     (1e6 for STX/stSTX, 1e8 for xBTC/sBTC), not a decimal count.
 *
 * The token set is read live from `get-token-list` on every fetch rather than
 * pinned, so newly listed collateral types are covered without a code change.
 */
const ARKADIKO_DEPLOYER = 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR';
const ARKADIKO_VAULTS_DATA = 'arkadiko-vaults-data-v1-1';
const ARKADIKO_VAULTS_TOKENS = 'arkadiko-vaults-tokens-v1-1';
const ARKADIKO_ORACLE = 'arkadiko-oracle-v2-3';

/** Arkadiko liquidates against its own multi-signer price oracle. */
const ARKADIKO_ORACLE_LABEL = 'arkadiko-oracle';

/** Protocol fixed-point conventions, from the deployed contract source. */
const BPS = 10_000n;
/** Stability fees accrue per Bitcoin block, normalized over a 144×365 year. */
const BLOCKS_PER_YEAR = 144n * 365n;
/** Debt (USDA) carries 6 decimals — `vault-min-debt` u500000000 = 500 USDA. */
const USDA_DECIMALS = 6;

/** Working precision for the decimal-safe BigInt risk ratio (mirrors peers). */
const RISK_DECIMALS = 18;
const RISK_SCALE = 10n ** BigInt(RISK_DECIMALS);

/** One vault's raw figures after the three reads, before normalization. */
export interface ArkadikoVaultInputs {
  /** Raw collateral amount in the token's own base units. */
  collateralRaw: bigint;
  /** Raw USDA debt (6 decimals). */
  debtRaw: bigint;
  /** Bitcoin block the vault last accrued at (`last-block`). */
  vaultLastBlock: bigint;
  /** Token's liquidation ratio in basis points (14000 = 140%). */
  liquidationRatioBps: bigint;
  /** Token's annual stability fee in basis points. */
  stabilityFeeBps: bigint;
  /** Oracle `last-price` for the token, scaled by `priceScale`. */
  priceRaw: bigint;
  /** Oracle `decimals` field — the price SCALE (1e6 or 1e8), not a count. */
  priceScale: bigint;
  /**
   * Current Bitcoin block height used for fee accrual. Sourced from the
   * oracle read's `last-block` (prices update every few blocks), so the fee
   * can be understated by at most a few blocks' accrual — negligible, and it
   * avoids a second Hiro endpoint on the proxy allow-list.
   */
  burnBlockHeight: bigint;
}

/** The collateral-to-debt ratio in bps, replicating the helpers contract. */
export function arkadikoRatioBps(inputs: ArkadikoVaultInputs): bigint {
  const { collateralRaw, debtRaw, vaultLastBlock, stabilityFeeBps, priceRaw, priceScale } = inputs;
  if (debtRaw === 0n || priceScale < 100n) {
    return 0n;
  }
  const vaultBlocks =
    inputs.burnBlockHeight > vaultLastBlock ? inputs.burnBlockHeight - vaultLastBlock : 0n;
  // Same integer-division order as the deployed contract, term for term.
  const stabilityFee = ((stabilityFeeBps * debtRaw) / BPS / BLOCKS_PER_YEAR) * vaultBlocks;
  return (collateralRaw * priceRaw * 100n) / (debtRaw + stabilityFee) / (priceScale / 100n);
}

/**
 * Pure normalization from one-or-more raw vaults to the domain shape.
 * Extracted from the network calls so the CDP math is unit-testable without a
 * fetch. Returns `null` when the account has no vault with collateral or debt.
 *
 * Aggregation mirrors Kamino: USD figures are summed across vaults and
 * `liquidationRisk` is the WORST vault's `liquidation-ratio / ratio` — the
 * vault closest to liquidation is what the pill must reflect.
 */
export function normalizeArkadikoVaults(
  address: string,
  vaults: ArkadikoVaultInputs[],
): HealthPosition | null {
  let totalCollateralUsd6 = 0n;
  let totalDebtUsd6 = 0n;
  let worstRisk = 0n;
  let worstNative: HealthPositionNative | undefined;

  for (const vault of vaults) {
    if (vault.collateralRaw === 0n && vault.debtRaw === 0n) {
      continue;
    }

    // collateral × price / scale lands on USDA's own 6-decimal USD scale for
    // every token (verified live: 1 STX → 161407 µUSD, 1 sBTC → 58347220000
    // µUSD), because the oracle's per-token scale absorbs the token decimals.
    totalCollateralUsd6 +=
      vault.priceScale > 0n ? (vault.collateralRaw * vault.priceRaw) / vault.priceScale : 0n;
    totalDebtUsd6 += vault.debtRaw;

    const ratioBps = arkadikoRatioBps(vault);
    // No debt → not liquidatable → zero risk; otherwise invert the CDP ratio.
    const risk =
      vault.debtRaw > 0n && ratioBps > 0n
        ? (vault.liquidationRatioBps * RISK_SCALE) / ratioBps
        : 0n;

    if (risk > worstRisk || worstNative === undefined) {
      worstRisk = risk;
      worstNative = {
        collateralRatio: Number(ratioBps) / Number(BPS),
        liquidationRatio: Number(vault.liquidationRatioBps) / Number(BPS),
      };
    }
  }

  if (totalCollateralUsd6 === 0n && totalDebtUsd6 === 0n) {
    return null;
  }

  return parseOrThrow(
    HealthPositionSchema,
    {
      chain: 'stx',
      protocol: 'arkadiko',
      address,
      collateralValueUsd: parseFloat(formatBaseUnits(totalCollateralUsd6, USDA_DECIMALS)),
      debtValueUsd: parseFloat(formatBaseUnits(totalDebtUsd6, USDA_DECIMALS)),
      liquidationRisk: parseFloat(formatBaseUnits(worstRisk, RISK_DECIMALS)),
      native: worstNative ?? {},
      oracle: ARKADIKO_ORACLE_LABEL,
      updatedAt: new Date().toISOString(),
    },
    'arkadiko.fetchPosition(egress)',
  );
}

/** Read the live collateral-token registry (`get-token-list` → `(ok (list …))`). */
async function readTokenList(sender: string, deps: CallReadDeps): Promise<ClarityValue[]> {
  const result = expectOk(
    await callReadOnly(
      {
        contractAddress: ARKADIKO_DEPLOYER,
        contractName: ARKADIKO_VAULTS_TOKENS,
        functionName: 'get-token-list',
        functionArgs: [],
        sender,
      },
      deps,
    ),
  );
  if (result.kind !== 'list') {
    throw new Error(`arkadiko: get-token-list returned ${result.kind}, expected list`);
  }
  return result.values;
}

/** Read one vault (`get-vault(owner, token)` → `(ok {collateral, debt, …})`). */
async function readVault(
  address: string,
  token: ClarityArg,
  deps: CallReadDeps,
): Promise<{ collateralRaw: bigint; debtRaw: bigint; vaultLastBlock: bigint }> {
  const vault = expectOk(
    await callReadOnly(
      {
        contractAddress: ARKADIKO_DEPLOYER,
        contractName: ARKADIKO_VAULTS_DATA,
        functionName: 'get-vault',
        functionArgs: [{ kind: 'standard-principal', address }, token],
        sender: address,
      },
      deps,
    ),
  );
  return {
    collateralRaw: tupleUint(vault, 'collateral'),
    debtRaw: tupleUint(vault, 'debt'),
    vaultLastBlock: tupleUint(vault, 'last-block'),
  };
}

/** Read a token's parameters (`get-token` → name, liquidation ratio, fee). */
async function readTokenParams(
  address: string,
  token: ClarityArg,
  deps: CallReadDeps,
): Promise<{ tokenName: string; liquidationRatioBps: bigint; stabilityFeeBps: bigint }> {
  const params = expectOk(
    await callReadOnly(
      {
        contractAddress: ARKADIKO_DEPLOYER,
        contractName: ARKADIKO_VAULTS_TOKENS,
        functionName: 'get-token',
        functionArgs: [token],
        sender: address,
      },
      deps,
    ),
  );
  return {
    tokenName: tupleString(params, 'token-name'),
    liquidationRatioBps: tupleUint(params, 'liquidation-ratio'),
    stabilityFeeBps: tupleUint(params, 'stability-fee'),
  };
}

/** Read the oracle price for a token name (`get-price` → bare tuple, no `ok`). */
async function readPrice(
  address: string,
  tokenName: string,
  deps: CallReadDeps,
): Promise<{ priceRaw: bigint; priceScale: bigint; oracleBlock: bigint }> {
  const price = await callReadOnly(
    {
      contractAddress: ARKADIKO_DEPLOYER,
      contractName: ARKADIKO_ORACLE,
      functionName: 'get-price',
      functionArgs: [{ kind: 'string-ascii', value: tokenName }],
      sender: address,
    },
    deps,
  );
  return {
    priceRaw: tupleUint(price, 'last-price'),
    priceScale: tupleUint(price, 'decimals'),
    oracleBlock: tupleUint(price, 'last-block'),
  };
}

/**
 * Read and normalize one account's Arkadiko position: enumerate the live
 * collateral-token registry, read the account's vault per token, and price the
 * non-empty ones. Most accounts have no vaults, so the common path is the
 * token-list read plus one `get-vault` per token and nothing else.
 */
export async function fetchArkadikoPosition(
  address: string,
  deps: CallReadDeps = {},
): Promise<HealthPosition | null> {
  assertValidAddress('stx', address);

  const tokens = await readTokenList(address, deps);
  const vaults: ArkadikoVaultInputs[] = [];

  for (const tokenValue of tokens) {
    if (tokenValue.kind !== 'principal') {
      throw new Error(`arkadiko: token-list entry is ${tokenValue.kind}, expected principal`);
    }
    const token: ClarityArg = { kind: 'raw', serialized: tokenValue.serialized };
    const vault = await readVault(address, token, deps);
    if (vault.collateralRaw === 0n && vault.debtRaw === 0n) {
      continue;
    }
    const params = await readTokenParams(address, token, deps);
    const price = await readPrice(address, params.tokenName, deps);
    vaults.push({
      ...vault,
      liquidationRatioBps: params.liquidationRatioBps,
      stabilityFeeBps: params.stabilityFeeBps,
      priceRaw: price.priceRaw,
      priceScale: price.priceScale,
      burnBlockHeight: price.oracleBlock,
    });
  }

  return normalizeArkadikoVaults(address, vaults);
}

/** Arkadiko implementation of the `HealthAdapter` port. */
export const arkadikoHealthAdapter: HealthAdapter = {
  protocol: 'arkadiko',
  chain: 'stx',
  fetchPosition: (address: string) => fetchArkadikoPosition(address),
};
