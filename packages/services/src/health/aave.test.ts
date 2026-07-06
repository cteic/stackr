import { describe, expect, it, vi } from 'vitest';
import { maxUint256 } from 'viem';
import { fetchAavePosition, normalizeAaveAccountData, type AaveAccountData } from './aave.js';

/**
 * Build a `getUserAccountData` tuple. Base (USD) figures are `1e8`-scaled,
 * `ltv` / `liquidationThreshold` are bps, `healthFactor` is `1e18`-scaled —
 * exactly what the contract returns.
 */
function accountData(overrides: {
  collateralBase?: bigint;
  debtBase?: bigint;
  liqThresholdBps?: bigint;
  ltvBps?: bigint;
  healthFactor?: bigint;
}): AaveAccountData {
  return [
    overrides.collateralBase ?? 0n,
    overrides.debtBase ?? 0n,
    0n, // availableBorrowsBase — unused by the adapter
    overrides.liqThresholdBps ?? 0n,
    overrides.ltvBps ?? 0n,
    overrides.healthFactor ?? maxUint256,
  ];
}

describe('normalizeAaveAccountData', () => {
  it('normalizes a borrowing position (USD 8-dec, bps, 1e18 HF)', () => {
    const position = normalizeAaveAccountData(
      '0x00000000219ab540356cBB839Cbe05303d7705Fa',
      accountData({
        collateralBase: 10_000n * 10n ** 8n, // $10,000
        debtBase: 4_000n * 10n ** 8n, // $4,000
        liqThresholdBps: 8_000n, // 0.80
        ltvBps: 7_500n, // 0.75
        healthFactor: (15n * 10n ** 18n) / 10n, // HF 1.5
      }),
    );

    expect(position).not.toBeNull();
    expect(position).toMatchObject({
      chain: 'eth',
      protocol: 'aave-v3',
      address: '0x00000000219ab540356cBB839Cbe05303d7705Fa',
      collateralValueUsd: 10_000,
      debtValueUsd: 4_000,
      oracle: 'aave-oracle',
      native: { healthFactor: 1.5, ltv: 0.75, liquidationLtv: 0.8 },
    });
    // 1 / 1.5 = 0.6666…
    expect(position?.liquidationRisk).toBeCloseTo(0.6666666, 6);
  });

  it('maps a 1e18 health factor (HF 1.0) to risk exactly 1 (liquidatable boundary)', () => {
    const position = normalizeAaveAccountData(
      '0x00000000219ab540356cBB839Cbe05303d7705Fa',
      accountData({
        collateralBase: 1_000n * 10n ** 8n,
        debtBase: 800n * 10n ** 8n,
        liqThresholdBps: 8_000n,
        ltvBps: 7_500n,
        healthFactor: 10n ** 18n, // HF exactly 1.0
      }),
    );

    expect(position?.liquidationRisk).toBe(1);
    expect(position?.native.healthFactor).toBe(1);
  });

  it('maps a MaxUint256 health factor (no debt) to risk 0 with HF omitted', () => {
    const position = normalizeAaveAccountData(
      '0x00000000219ab540356cBB839Cbe05303d7705Fa',
      accountData({
        collateralBase: 5_000n * 10n ** 8n, // supply-only: collateral but no debt
        debtBase: 0n,
        liqThresholdBps: 8_000n,
        ltvBps: 7_500n,
        healthFactor: maxUint256,
      }),
    );

    expect(position).not.toBeNull();
    expect(position?.debtValueUsd).toBe(0);
    expect(position?.liquidationRisk).toBe(0);
    expect(position?.native.healthFactor).toBeUndefined();
  });

  it('returns null when the account has no collateral and no debt', () => {
    const position = normalizeAaveAccountData('0x00000000219ab540356cBB839Cbe05303d7705Fa', accountData({}));
    expect(position).toBeNull();
  });
});

describe('fetchAavePosition', () => {
  it('reads through the injected viem read and normalizes the result', async () => {
    const read = vi.fn(
      async (): Promise<AaveAccountData> =>
        accountData({
          collateralBase: 2_000n * 10n ** 8n,
          debtBase: 1_000n * 10n ** 8n,
          liqThresholdBps: 8_000n,
          ltvBps: 7_000n,
          healthFactor: 2n * 10n ** 18n, // HF 2.0
        }),
    );

    const position = await fetchAavePosition('0x00000000219ab540356cBB839Cbe05303d7705Fa', read);

    expect(read).toHaveBeenCalledWith('0x00000000219ab540356cBB839Cbe05303d7705Fa');
    expect(position?.liquidationRisk).toBe(0.5); // 1 / 2.0
    expect(position?.collateralValueUsd).toBe(2_000);
  });
});
