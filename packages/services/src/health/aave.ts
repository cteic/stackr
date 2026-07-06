import { createPublicClient, getAddress, http, maxUint256, type PublicClient } from 'viem';
import { assertValidAddress } from '../address-guard.js';
import { mainnet } from 'viem/chains';
import type { HealthPosition, HealthPositionNative } from '@stackr/models';
import { HealthPositionSchema } from '@stackr/models';
import type { HealthAdapter } from '../ports.js';
import { resolveEthRpcUrl } from '../eth-rpc.js';
import { parseOrThrow } from '../validate.js';
import { formatBaseUnits } from '../base-units.js';

/**
 * Aave v3 liquidation-health adapter (Track B of ADR 0016).
 *
 * One read-only `Pool.getUserAccountData(user)` returns the account's
 * oracle-computed health factor directly, so — unlike the Stacks protocols —
 * Aave needs no price stream: the single call gives the live number. This is
 * the lowest-risk adapter (no oracle math), built first.
 */

/**
 * Aave v3 `Pool` on Ethereum mainnet (Core market). Pinned from the verified
 * contract on Etherscan; re-verify against Aave's address dashboard if Aave
 * ships a new Pool revision.
 *   https://etherscan.io/address/0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2
 *   https://aave.com/docs/resources/addresses
 */
const AAVE_V3_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';

/**
 * Aave v3's base currency on mainnet is USD with 8 decimals, so
 * `totalCollateralBase` / `totalDebtBase` are USD scaled by `1e8`.
 */
const BASE_CURRENCY_DECIMALS = 8;
/** `healthFactor` is `1e18`-scaled. */
const HF_DECIMALS = 18;
/** `ltv` and `currentLiquidationThreshold` are basis points (`1e4`). */
const BPS_DECIMALS = 4;

/** `1e18`, the health-factor scale, kept as BigInt for exact `1/HF` math. */
const HF_SCALE = 10n ** BigInt(HF_DECIMALS);

const poolAbi = [
  {
    type: 'function',
    name: 'getUserAccountData',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
  },
] as const;

/** The six `uint256` values `getUserAccountData` returns, in order. */
export type AaveAccountData = readonly [bigint, bigint, bigint, bigint, bigint, bigint];

/**
 * viem public client on mainnet. Targets the same-origin proxy in the browser
 * (where this read runs inside its React Query `queryFn`), so the Alchemy key
 * stays server-side; in SSR/tests it falls back to the public RPC. See
 * `resolveEthRpcUrl`. Without a key the read still works but may be slower /
 * rate-limited.
 */
function getClient(): PublicClient {
  return createPublicClient({
    chain: mainnet,
    transport: http(resolveEthRpcUrl()),
  });
}

async function readUserAccountData(address: string): Promise<AaveAccountData> {
  const client = getClient();
  // `getAddress` checksums + validates, yielding viem's `Address` type without
  // an `as` cast (and rejecting malformed input at the boundary).
  return client.readContract({
    address: AAVE_V3_POOL,
    abi: poolAbi,
    functionName: 'getUserAccountData',
    args: [getAddress(address)],
  });
}

/**
 * Pure normalization from Aave's raw account tuple to the domain shape.
 * Extracted from the network call so the mapping is unit-testable without a
 * client. Returns `null` when the account has neither collateral nor debt
 * (i.e. no Aave position at all), so the hook can drop the miss.
 */
export function normalizeAaveAccountData(
  address: string,
  data: AaveAccountData,
): HealthPosition | null {
  const [totalCollateralBase, totalDebtBase, , currentLiquidationThreshold, ltv, healthFactor] =
    data;

  if (totalCollateralBase === 0n && totalDebtBase === 0n) {
    return null;
  }

  // With no debt Aave returns `healthFactor == type(uint256).max`; that is not
  // a real number to display, and `1/HF` collapses to 0 risk.
  const noDebt = healthFactor === maxUint256;

  const native: HealthPositionNative = {
    ltv: parseFloat(formatBaseUnits(ltv, BPS_DECIMALS)),
    liquidationLtv: parseFloat(formatBaseUnits(currentLiquidationThreshold, BPS_DECIMALS)),
  };
  if (!noDebt) {
    native.healthFactor = parseFloat(formatBaseUnits(healthFactor, HF_DECIMALS));
  }

  // liquidationRisk = 1 / HF, computed entirely in BigInt to stay exact:
  //   1/HF = 1e18 / healthFactorRaw → scale the numerator by 1e18 first, then
  //   format the integer quotient. Never float-divide the raw BigInts.
  const liquidationRisk = noDebt
    ? 0
    : parseFloat(formatBaseUnits((HF_SCALE * HF_SCALE) / healthFactor, HF_DECIMALS));

  return parseOrThrow(
    HealthPositionSchema,
    {
      chain: 'eth',
      protocol: 'aave-v3',
      address,
      collateralValueUsd: parseFloat(formatBaseUnits(totalCollateralBase, BASE_CURRENCY_DECIMALS)),
      debtValueUsd: parseFloat(formatBaseUnits(totalDebtBase, BASE_CURRENCY_DECIMALS)),
      liquidationRisk,
      native,
      oracle: 'aave-oracle',
      updatedAt: new Date().toISOString(),
    },
    'aave.fetchPosition(egress)',
  );
}

/**
 * Read and normalize one account's Aave v3 position. `read` is injectable so
 * the normalization can be exercised against a mocked viem read in tests.
 */
export async function fetchAavePosition(
  address: string,
  read: (address: string) => Promise<AaveAccountData> = readUserAccountData,
): Promise<HealthPosition | null> {
  assertValidAddress('eth', address);
  return normalizeAaveAccountData(address, await read(address));
}

/** Aave v3 implementation of the `HealthAdapter` port. */
export const aaveHealthAdapter: HealthAdapter = {
  protocol: 'aave-v3',
  chain: 'eth',
  fetchPosition: (address: string) => fetchAavePosition(address),
};
