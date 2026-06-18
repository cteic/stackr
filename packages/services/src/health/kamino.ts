import { parseUnits } from 'viem';
import { z } from 'zod';
import type { HealthPosition, HealthPositionNative } from '@stackr/models';
import { HealthPositionSchema } from '@stackr/models';
import type { HealthAdapter } from '../ports.js';
import { parseOrThrow } from '../validate.js';
import { formatBaseUnits } from '../base-units.js';
import { safeFetch } from '../fetch-wrapper.js';

/**
 * Kamino (Solana) liquidation-health adapter (step 3 of the ADR 0016 build
 * plan). Keyless GET against Kamino's public API — the moat stays on data we
 * read and math we control (the normalization), never an aggregator.
 *
 * Unlike Aave (whose oracle-computed health factor comes back in one read),
 * Kamino exposes the raw per-obligation LTV and liquidation LTV, so we derive
 * `liquidationRisk = currentLtv / liquidationLtv` ourselves (the plan's
 * normalization for the LTV-style protocols): `1.0` sits exactly at the
 * liquidation threshold, `>= 1` is liquidatable.
 */

/**
 * Kamino public API.
 *
 * Base + the Main lending market are pinned from the Kamino Lending SDK
 * (`@kamino-finance/klend-sdk`), the authoritative published source:
 *   - base `…/v2/kamino-market` — `getApiEndpoint()` in `src/utils/constants.ts`
 *   - Main Market `7u3HeHxY…GAv5PfF` — the SDK README's `KaminoMarket.load` example
 *   - the per-obligation stat field names below (`loanToValue`, `liquidationLtv`,
 *     `userTotalDeposit`, `userTotalBorrow`) — the SDK's `ObligationStats`
 *     (`src/classes/obligation.ts`).
 *
 * NOTE — the build plan calls for pinning the exact obligations path from the
 * live Swagger at https://api.kamino.finance/documentation/. That host (and
 * every Kamino docs/API host) is outside this build environment's network
 * egress allowlist, so the path/response shape below is pinned from the SDK
 * base above + the documented public-API route shape and MUST be re-verified
 * against the live Swagger once `api.kamino.finance` is allowlisted. The
 * adapter is built so that re-verification touches only the constants here and
 * `KaminoObligationSchema`: a wrong shape fails loud at the ingress boundary
 * (`parseOrThrow`) rather than leaking a bad position into the app.
 */
const KAMINO_API_BASE = 'https://api.kamino.finance/v2/kamino-market';
const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';

/** Which oracle Kamino liquidates against (Scope, its Pyth/Switchboard aggregator). */
const KAMINO_ORACLE = 'kamino-scope';

/**
 * Working precision for the decimal-safe BigInt math. Kamino's stats come back
 * as decimal strings (LTV fractions, USD values); we parse them to `1e18`-scaled
 * BigInts and never float-divide, mirroring the Aave adapter's `1/HF` approach.
 */
const SCALE_DECIMALS = 18;
const SCALE = 10n ** BigInt(SCALE_DECIMALS);

function obligationsUrl(address: string): string {
  return `${KAMINO_API_BASE}/${KAMINO_MAIN_MARKET}/users/${encodeURIComponent(address)}/obligations`;
}

/**
 * Ingress schema for one Kamino obligation. Values are decimal strings (the
 * SDK serializes these `ObligationStats` figures from `Decimal`): `loanToValue`
 * / `liquidationLtv` are fractions (0..1), `userTotalDeposit` / `userTotalBorrow`
 * are USD. Only the fields the adapter reads are modeled — Zod drops the rest,
 * but a missing/renamed field still trips `parseOrThrow` at the boundary.
 */
const KaminoObligationSchema = z.object({
  loanToValue: z.string(),
  liquidationLtv: z.string(),
  userTotalDeposit: z.string(),
  userTotalBorrow: z.string(),
});

/** A wallet's obligations under the market — empty when it has no position. */
const KaminoObligationsResponseSchema = z.array(KaminoObligationSchema);

export type KaminoObligation = z.infer<typeof KaminoObligationSchema>;

/** Parse a Kamino decimal string to a `SCALE_DECIMALS`-scaled BigInt (exact). */
function toScaled(value: string): bigint {
  return parseUnits(value, SCALE_DECIMALS);
}

async function fetchKaminoObligations(address: string): Promise<KaminoObligation[]> {
  const res = await safeFetch(obligationsUrl(address));

  // Ingress boundary: validate the upstream array before reading any figure.
  return parseOrThrow(
    KaminoObligationsResponseSchema,
    await res.json(),
    'kamino.fetchPosition(ingress)',
  );
}

/**
 * Pure normalization from a wallet's Kamino obligations to the domain shape.
 * Extracted from the network call so the mapping is unit-testable without a
 * fetch. Returns `null` when the wallet has no obligation with collateral or
 * debt (no position at all), so the hook can drop the miss.
 *
 * A wallet can hold several obligations; the card layer keys one row per
 * (protocol, address), so we aggregate: collateral and debt are summed, and
 * `liquidationRisk` is the **worst** obligation's `currentLtv / liquidationLtv`
 * — the position closest to liquidation is what the pill must reflect. The
 * worst obligation's raw LTVs are preserved in `native` for audit.
 */
export function normalizeKaminoObligations(
  address: string,
  obligations: KaminoObligation[],
): HealthPosition | null {
  let totalDeposit = 0n;
  let totalBorrow = 0n;
  let worstRisk = 0n;
  let worstNative: HealthPositionNative | undefined;

  for (const obligation of obligations) {
    const deposit = toScaled(obligation.userTotalDeposit);
    const borrow = toScaled(obligation.userTotalBorrow);
    totalDeposit += deposit;
    totalBorrow += borrow;

    const ltv = toScaled(obligation.loanToValue);
    const liquidationLtv = toScaled(obligation.liquidationLtv);

    // No debt (or no liquidation threshold) → this obligation can't be
    // liquidated, so it contributes zero risk. Otherwise risk = ltv / liqLtv,
    // scaled-numerator-then-integer-divide so we never float-divide raw values.
    const risk = borrow > 0n && liquidationLtv > 0n ? (ltv * SCALE) / liquidationLtv : 0n;
    if (risk > worstRisk || worstNative === undefined) {
      worstRisk = risk;
      worstNative = {
        ltv: parseFloat(formatBaseUnits(ltv, SCALE_DECIMALS)),
        liquidationLtv: parseFloat(formatBaseUnits(liquidationLtv, SCALE_DECIMALS)),
      };
    }
  }

  if (totalDeposit === 0n && totalBorrow === 0n) {
    return null;
  }

  return parseOrThrow(
    HealthPositionSchema,
    {
      chain: 'sol',
      protocol: 'kamino',
      address,
      collateralValueUsd: parseFloat(formatBaseUnits(totalDeposit, SCALE_DECIMALS)),
      debtValueUsd: parseFloat(formatBaseUnits(totalBorrow, SCALE_DECIMALS)),
      liquidationRisk: parseFloat(formatBaseUnits(worstRisk, SCALE_DECIMALS)),
      native: worstNative ?? {},
      oracle: KAMINO_ORACLE,
      updatedAt: new Date().toISOString(),
    },
    'kamino.fetchPosition(egress)',
  );
}

/**
 * Read and normalize one wallet's Kamino position. `fetch` is injectable so the
 * normalization can be exercised against mocked obligation fixtures in tests.
 */
export async function fetchKaminoPosition(
  address: string,
  fetchObligations: (address: string) => Promise<KaminoObligation[]> = fetchKaminoObligations,
): Promise<HealthPosition | null> {
  return normalizeKaminoObligations(address, await fetchObligations(address));
}

/** Kamino implementation of the `HealthAdapter` port. */
export const kaminoHealthAdapter: HealthAdapter = {
  protocol: 'kamino',
  chain: 'sol',
  fetchPosition: (address: string) => fetchKaminoPosition(address),
};
