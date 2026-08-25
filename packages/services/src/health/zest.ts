import type { HealthPosition, HealthPositionNative } from '@stackr/models';
import { assertValidAddress } from '../address-guard.js';
import { HealthPositionSchema } from '@stackr/models';
import type { HealthAdapter } from '../ports.js';
import { parseOrThrow } from '../validate.js';
import { formatBaseUnits } from '../base-units.js';
import { callReadOnly, type CallReadDeps } from './hiro-call-read.js';
import { expectOk, tupleUint, type ClarityArg, type ClarityValue } from './clarity.js';

/**
 * Zest (Stacks) liquidation-health adapter — step 4 of the ADR 0016 build plan,
 * the bespoke moat. Zest is an Aave-v2-style lending market written in Clarity,
 * so unlike Aave (one EVM read) we read it the only way Stacks exposes: a Hiro
 * read-only contract call, decoded from hex Clarity (see `clarity.ts`).
 *
 * Zest's `pool-0-reserve` aggregates a user's whole position in one call,
 * `calculate-user-global-data`, returning collateral/debt in USD plus the
 * current LTV, the liquidation-threshold LTV, and a 1-100 health factor (>100 ≈
 * ∞, <1 liquidatable). We normalize on the LTVs rather than the health factor:
 *
 *   liquidationRisk = current-ltv / current-liquidation-threshold
 *
 * 1.0 sits exactly at the threshold, `>= 1` is liquidatable — the same
 * LTV-style normalization as Kamino and Granite. Crucially this is a *ratio* of
 * two figures the contract returns in the same fixed-point scale, so it is
 * exact regardless of what that scale is; the health factor and the raw LTV
 * fractions are preserved in `native` for audit (their display scale is the one
 * assumption below, and a wrong scale there never mis-states the pill).
 */

/**
 * Pinned mainnet contract identifiers and the reserve set passed to
 * `calculate-user-global-data`.
 *
 * Sources (pinned at build, 2026-06; verify against the live contract once
 * `api.hiro.so` is on the egress allowlist — see PR body):
 *   - Deployer `SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N` and the
 *     `pool-0-reserve-v2-0` / `calculate-user-global-data` signature are pinned
 *     from Zest's deployed mainnet source (boomcrypto/clarity-deployed-contracts
 *     mirror) and the Zest contract repo (github.com/Zest-Protocol/zest-v2-contracts).
 *   - The reserve token / lp-token / oracle identifiers are pinned from Zest's
 *     published mainnet constants.
 *
 * `calculate-user-global-data(user, (list 100 {asset, lp-token, oracle}))`
 * iterates the passed reserves and sums the user's collateral/debt across them,
 * so the list must enumerate the protocol's reserves. Only reserves for which
 * the full {asset, lp-token, oracle} triple could be confirmed at build are
 * included here (the sBTC reserve — the headline BTC-collateral surface — plus
 * the stablecoins and governance assets). A position held *solely* in an
 * omitted reserve would under-report until the set is completed against the
 * live reserve registry; see the PR's verification section.
 */
const ZEST_DEPLOYER = 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N';
const ZEST_POOL_RESERVE = 'pool-0-reserve-v2-0';
const ZEST_GLOBAL_DATA_FN = 'calculate-user-global-data';

interface ZestReserve {
  readonly asset: string;
  readonly lpToken: string;
  readonly oracle: string;
}

const ZEST_RESERVES: readonly ZestReserve[] = [
  {
    asset: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
    lpToken: `${ZEST_DEPLOYER}.zsbtc-v2-0`,
    oracle: `${ZEST_DEPLOYER}.stx-btc-oracle-v1-4`,
  },
  {
    asset: 'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc',
    lpToken: `${ZEST_DEPLOYER}.zaeusdc-v2-0`,
    oracle: `${ZEST_DEPLOYER}.aeusdc-oracle-v1-0`,
  },
  {
    asset: 'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt',
    lpToken: `${ZEST_DEPLOYER}.zsusdt-v2-0`,
    oracle: `${ZEST_DEPLOYER}.susdt-oracle-v1-0`,
  },
  {
    asset: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token',
    lpToken: `${ZEST_DEPLOYER}.zusda-v2-0`,
    oracle: `${ZEST_DEPLOYER}.usda-oracle-v1-1`,
  },
  {
    asset: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token',
    lpToken: `${ZEST_DEPLOYER}.zdiko-v2-0`,
    oracle: `${ZEST_DEPLOYER}.diko-oracle-v1-1`,
  },
  {
    asset: 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex',
    lpToken: `${ZEST_DEPLOYER}.zalex-v2-0`,
    oracle: `${ZEST_DEPLOYER}.alex-oracle-v1-1`,
  },
  {
    asset: 'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1',
    lpToken: `${ZEST_DEPLOYER}.zusdh-v2-0`,
    oracle: `${ZEST_DEPLOYER}.usdh-oracle-v1-0`,
  },
];

/** The oracle Zest liquidates against (its own Pyth-fed price oracles). */
const ZEST_ORACLE = 'zest-oracle';

/**
 * Zest reports USD values, LTV fractions and the health factor in fixed point.
 * These decimals are an *assumption* (Zest's `ONE_8` convention) to verify
 * against the live contract; they affect only the `native`/USD display, never
 * `liquidationRisk`, which is a scale-independent ratio of two same-scale LTVs.
 */
const ZEST_USD_DECIMALS = 8;
const ZEST_RATIO_DECIMALS = 8;
const ZEST_HF_DECIMALS = 8;

/** Working precision for the decimal-safe BigInt ratio (mirrors Kamino/Aave). */
const RISK_DECIMALS = 18;
const RISK_SCALE = 10n ** BigInt(RISK_DECIMALS);

/** Build the `(list {asset, lp-token, oracle})` argument from the reserve set. */
function reservesArg(): ClarityArg {
  return {
    kind: 'list',
    values: ZEST_RESERVES.map(reserve => ({
      kind: 'tuple' as const,
      data: {
        asset: { kind: 'contract-principal' as const, contractId: reserve.asset },
        'lp-token': { kind: 'contract-principal' as const, contractId: reserve.lpToken },
        oracle: { kind: 'contract-principal' as const, contractId: reserve.oracle },
      },
    })),
  };
}

/**
 * Pure normalization from Zest's decoded `calculate-user-global-data` tuple to
 * the domain shape. Extracted from the network call so the mapping is testable
 * against a captured/decoded fixture without a fetch. Returns `null` when the
 * account has neither collateral nor debt (no Zest position), so the hook drops
 * the miss. `result` is the value already unwrapped from the `(ok …)` response.
 */
export function normalizeZestGlobalData(
  address: string,
  result: ClarityValue,
): HealthPosition | null {
  const collateral = tupleUint(result, 'total-collateral-balanceUSD');
  const debt = tupleUint(result, 'total-borrow-balanceUSD');

  if (collateral === 0n && debt === 0n) {
    return null;
  }

  const ltv = tupleUint(result, 'current-ltv');
  const liquidationThreshold = tupleUint(result, 'current-liquidation-threshold');
  const healthFactor = tupleUint(result, 'health-factor');

  // risk = current-ltv / current-liquidation-threshold, scaled-numerator then
  // integer-divide so the raw BigInts are never float-divided. No debt (or no
  // threshold) → not liquidatable → 0 risk.
  const liquidationRisk =
    debt > 0n && liquidationThreshold > 0n
      ? parseFloat(formatBaseUnits((ltv * RISK_SCALE) / liquidationThreshold, RISK_DECIMALS))
      : 0;

  const native: HealthPositionNative = {
    ltv: parseFloat(formatBaseUnits(ltv, ZEST_RATIO_DECIMALS)),
    liquidationLtv: parseFloat(formatBaseUnits(liquidationThreshold, ZEST_RATIO_DECIMALS)),
    healthFactor: parseFloat(formatBaseUnits(healthFactor, ZEST_HF_DECIMALS)),
  };

  return parseOrThrow(
    HealthPositionSchema,
    {
      chain: 'stx',
      protocol: 'zest',
      address,
      collateralValueUsd: parseFloat(formatBaseUnits(collateral, ZEST_USD_DECIMALS)),
      debtValueUsd: parseFloat(formatBaseUnits(debt, ZEST_USD_DECIMALS)),
      liquidationRisk,
      native,
      oracle: ZEST_ORACLE,
      updatedAt: new Date().toISOString(),
    },
    'zest.fetchPosition(egress)',
  );
}

/**
 * Read and normalize one account's Zest position via a single Hiro read-only
 * call to `calculate-user-global-data`. `deps` (fetch + api key) is injectable
 * so the call path is testable without a network.
 */
export async function fetchZestPosition(
  address: string,
  deps: CallReadDeps = {},
): Promise<HealthPosition | null> {
  assertValidAddress('stx', address);
  const result = await callReadOnly(
    {
      contractAddress: ZEST_DEPLOYER,
      contractName: ZEST_POOL_RESERVE,
      functionName: ZEST_GLOBAL_DATA_FN,
      functionArgs: [{ kind: 'standard-principal', address }, reservesArg()],
      sender: address,
    },
    deps,
  );
  return normalizeZestGlobalData(address, expectOk(result));
}

/** Zest implementation of the `HealthAdapter` port. */
export const zestHealthAdapter: HealthAdapter = {
  protocol: 'zest',
  chain: 'stx',
  fetchPosition: (address: string) => fetchZestPosition(address),
};
