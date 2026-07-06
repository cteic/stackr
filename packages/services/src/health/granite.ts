import type { HealthPosition, HealthPositionNative } from '@stackr/models';
import { assertValidAddress } from '../address-guard.js';
import { HealthPositionSchema } from '@stackr/models';
import type { HealthAdapter } from '../ports.js';
import { parseOrThrow } from '../validate.js';
import { formatBaseUnits } from '../base-units.js';
import { callReadOnly, type CallReadDeps } from './hiro-call-read.js';
import { expectOk, tupleUint, unwrapOptional, type ClarityValue } from './clarity.js';

/**
 * Granite (Stacks) liquidation-health adapter — step 5 of the ADR 0016 build
 * plan. Granite is sBTC-collateral stablecoin borrowing with **soft (partial)
 * liquidations**: rather than seizing 50-100% of collateral, it liquidates only
 * the minimum needed to bring a position back below its Liquidation LTV. So the
 * meaningful signal is the same LTV-style ratio as Kamino/Zest:
 *
 *   liquidationRisk = current-ltv / liquidation-ltv
 *
 * where 1.0 sits at the soft-liquidation threshold and `>= 1` is being (softly)
 * liquidated. Granite has no single "account data" read, so we compose three
 * Hiro read-only calls: the oracle-priced collateral value, the borrow
 * position's debt, and the collateral's liquidation-LTV parameter.
 */

/**
 * Pinned mainnet contract identifiers (pinned at build, 2026-06; verify against
 * the live contracts once `api.hiro.so` is on the egress allowlist — see PR):
 *   - `state-v1` (deployer `SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA`) holds the
 *     borrow positions and collateral parameters; `get-user-position` and
 *     `get-collateral` signatures are pinned from its deployed mainnet source.
 *   - `borrower-v1` (deployer `SP26NGV9AFZBX7XBDBS2C7EC7FCPSAV9PKREQNMVS`) exposes
 *     the oracle-priced total collateral value via `get-user-collaterals-value`.
 */
const GRANITE_STATE_DEPLOYER = 'SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA';
const GRANITE_STATE = 'state-v1';
const GRANITE_BORROWER_DEPLOYER = 'SP26NGV9AFZBX7XBDBS2C7EC7FCPSAV9PKREQNMVS';
const GRANITE_BORROWER = 'borrower-v1';

/** Pyth is the oracle Granite liquidates against (Pyth on Stacks). */
const GRANITE_ORACLE = 'pyth';

/**
 * Fixed-point scales for Granite's three figures. These are *assumptions* to
 * verify against the live contracts: unlike Zest (whose risk is a scale-free
 * ratio of two same-scale LTVs), Granite's current LTV is `debtUSD /
 * collateralUSD` across two differently-scaled figures, so these decimals do
 * affect `liquidationRisk`. Isolated here as named constants so re-verification
 * is a one-line change.
 *   - collateral value: Pyth USD price scale (8 dp).
 *   - debt: the borrow asset is a USD stablecoin (aeUSDC, 6 dp); USD ≈ amount.
 *   - liquidation-ltv: protocol scaling factor (8 dp).
 */
const GRANITE_COLLATERAL_USD_DECIMALS = 8;
const GRANITE_DEBT_DECIMALS = 6;
const GRANITE_LTV_DECIMALS = 8;

/** Common working precision so the cross-scale LTV math stays integer-exact. */
const RISK_DECIMALS = 18;
const RISK_SCALE = 10n ** BigInt(RISK_DECIMALS);

/** Restate a raw fixed-point figure as a `RISK_DECIMALS`-scaled BigInt (exact). */
function toRiskScale(raw: bigint, decimals: number): bigint {
  return raw * 10n ** BigInt(RISK_DECIMALS - decimals);
}

/** The raw figures the three reads yield, before normalization. */
export interface GranitePositionInputs {
  /** Oracle-priced total collateral, scaled by `GRANITE_COLLATERAL_USD_DECIMALS`. */
  collateralRaw: bigint;
  /** Outstanding debt, scaled by `GRANITE_DEBT_DECIMALS`. */
  debtRaw: bigint;
  /** Collateral's liquidation LTV, scaled by `GRANITE_LTV_DECIMALS` (0 if none). */
  liquidationLtvRaw: bigint;
}

/**
 * Pure normalization from Granite's raw figures to the domain shape. Extracted
 * from the network calls so the (cross-scale, soft-liquidation) math is
 * unit-testable without a fetch. Returns `null` when the account has neither
 * collateral nor debt (no Granite position), so the hook drops the miss.
 *
 * current-ltv = debtUSD / collateralUSD; liquidationRisk = current-ltv /
 * liquidation-ltv. All values are lifted to a common 1e18 scale first, then
 * divided as scaled-numerator integer division — the raw BigInts are never
 * float-divided.
 */
export function normalizeGranitePosition(
  address: string,
  inputs: GranitePositionInputs,
): HealthPosition | null {
  const { collateralRaw, debtRaw, liquidationLtvRaw } = inputs;

  if (collateralRaw === 0n && debtRaw === 0n) {
    return null;
  }

  const collateral18 = toRiskScale(collateralRaw, GRANITE_COLLATERAL_USD_DECIMALS);
  const debt18 = toRiskScale(debtRaw, GRANITE_DEBT_DECIMALS);
  const liquidationLtv18 = toRiskScale(liquidationLtvRaw, GRANITE_LTV_DECIMALS);

  // current LTV as a 1e18 fraction (0 with no collateral — avoids div-by-zero).
  const currentLtv18 = collateral18 > 0n ? (debt18 * RISK_SCALE) / collateral18 : 0n;

  // No debt or no threshold → not liquidatable → 0 risk.
  const liquidationRisk =
    debtRaw > 0n && liquidationLtv18 > 0n
      ? parseFloat(formatBaseUnits((currentLtv18 * RISK_SCALE) / liquidationLtv18, RISK_DECIMALS))
      : 0;

  const native: HealthPositionNative = {
    ltv: parseFloat(formatBaseUnits(currentLtv18, RISK_DECIMALS)),
    liquidationLtv: parseFloat(formatBaseUnits(liquidationLtv18, RISK_DECIMALS)),
  };

  return parseOrThrow(
    HealthPositionSchema,
    {
      chain: 'stx',
      protocol: 'granite',
      address,
      collateralValueUsd: parseFloat(formatBaseUnits(collateral18, RISK_DECIMALS)),
      debtValueUsd: parseFloat(formatBaseUnits(debt18, RISK_DECIMALS)),
      liquidationRisk,
      native,
      oracle: GRANITE_ORACLE,
      updatedAt: new Date().toISOString(),
    },
    'granite.fetchPosition(egress)',
  );
}

/** Read the oracle-priced total collateral value (`(ok uint)`). */
async function readCollateralValue(address: string, deps: CallReadDeps): Promise<bigint> {
  const result = await callReadOnly(
    {
      contractAddress: GRANITE_BORROWER_DEPLOYER,
      contractName: GRANITE_BORROWER,
      functionName: 'get-user-collaterals-value',
      functionArgs: [{ kind: 'standard-principal', address }],
      sender: address,
    },
    deps,
  );
  const value = expectOk(result);
  if (value.kind !== 'uint') {
    throw new Error(`granite: get-user-collaterals-value returned ${value.kind}, expected uint`);
  }
  return value.value;
}

/**
 * Read the borrow position (`(optional {debt-shares, collaterals, borrowed-amount, …})`).
 * Returns the outstanding debt and the first collateral principal (for the
 * liquidation-LTV lookup), or `null` when the account has no borrow position.
 */
async function readUserPosition(
  address: string,
  deps: CallReadDeps,
): Promise<{ debtRaw: bigint; collateral: ClarityValue | null } | null> {
  const result = await callReadOnly(
    {
      contractAddress: GRANITE_STATE_DEPLOYER,
      contractName: GRANITE_STATE,
      functionName: 'get-user-position',
      functionArgs: [{ kind: 'standard-principal', address }],
      sender: address,
    },
    deps,
  );
  const position = unwrapOptional(result);
  if (position === null) {
    return null;
  }
  const debtRaw = tupleUint(position, 'borrowed-amount');
  if (position.kind !== 'tuple') {
    throw new Error(`granite: get-user-position returned ${position.kind}, expected tuple`);
  }
  const collaterals = position.data.collaterals;
  const collateral =
    collaterals?.kind === 'list' && collaterals.values.length > 0 ? collaterals.values[0] : null;
  return { debtRaw, collateral };
}

/**
 * Read a collateral's liquidation LTV (`get-collateral` → `(optional {…,
 * liquidation-ltv, …})`). With several collaterals Granite uses a blended LTV;
 * we read the first (sBTC dominates today) and leave multi-collateral blending
 * as a follow-up — noted in the PR.
 */
async function readLiquidationLtv(
  address: string,
  collateral: ClarityValue,
  deps: CallReadDeps,
): Promise<bigint> {
  if (collateral.kind !== 'principal') {
    throw new Error(`granite: collateral entry is ${collateral.kind}, expected principal`);
  }
  const result = await callReadOnly(
    {
      contractAddress: GRANITE_STATE_DEPLOYER,
      contractName: GRANITE_STATE,
      functionName: 'get-collateral',
      functionArgs: [{ kind: 'raw', serialized: collateral.serialized }],
      sender: address,
    },
    deps,
  );
  const params = unwrapOptional(result);
  return params === null ? 0n : tupleUint(params, 'liquidation-ltv');
}

/**
 * Read and normalize one account's Granite position. Composes the collateral
 * value, the borrow position and the collateral's liquidation LTV. `deps`
 * (fetch + api key) is injectable so the call path is testable without a network.
 */
export async function fetchGranitePosition(
  address: string,
  deps: CallReadDeps = {},
): Promise<HealthPosition | null> {
  assertValidAddress('stx', address);
  const collateralRaw = await readCollateralValue(address, deps);
  const position = await readUserPosition(address, deps);

  const debtRaw = position?.debtRaw ?? 0n;
  const liquidationLtvRaw =
    position?.collateral != null
      ? await readLiquidationLtv(address, position.collateral, deps)
      : 0n;

  return normalizeGranitePosition(address, { collateralRaw, debtRaw, liquidationLtvRaw });
}

/** Granite implementation of the `HealthAdapter` port. */
export const graniteHealthAdapter: HealthAdapter = {
  protocol: 'granite',
  chain: 'stx',
  fetchPosition: (address: string) => fetchGranitePosition(address),
};
