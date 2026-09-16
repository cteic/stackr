import { describe, expect, it } from 'vitest';
import {
  normalizeBtcTransactions,
  normalizeEthTransactions,
  normalizeStxTransactions,
  normalizeSolTransactions,
  normalizeSolTransactionDetail,
  normalizeSuiTransactions,
} from './transactions';

const ME = 'bc1qme';

describe('normalizeBtcTransactions', () => {
  it('marks a tx that pays the watched address as a receive and sums those outputs', () => {
    const txs = [
      {
        txid: 'tx1',
        vout: [
          { scriptpubkey_address: ME, value: 50_000_000 },
          { scriptpubkey_address: 'bc1qother', value: 10_000_000 },
        ],
        vin: [{ prevout: { scriptpubkey_address: 'bc1qsender' } }],
        status: { confirmed: true, block_time: 1_700_000_000 },
      },
    ];

    expect(normalizeBtcTransactions(txs, ME)).toEqual([
      {
        hash: 'tx1',
        chain: 'btc',
        type: 'receive',
        amount: '0.50000000',
        counterparty: 'bc1qsender',
        timestamp: new Date(1_700_000_000 * 1000).toISOString(),
        confirmed: true,
      },
    ]);
  });

  it('treats a tx with no output to the address as a send and falls back to now for pending', () => {
    const txs = [
      {
        txid: 'tx2',
        vout: [{ scriptpubkey_address: 'bc1qdest', value: 20_000_000 }],
        vin: [{ prevout: { scriptpubkey_address: ME } }],
        status: undefined,
      },
    ];

    const [tx] = normalizeBtcTransactions(txs, ME);
    expect(tx).toMatchObject({ type: 'send', counterparty: 'bc1qdest', confirmed: false });
  });
});

describe('normalizeEthTransactions', () => {
  it('uses case-insensitive to/from matching to assign direction', () => {
    const txs = [
      {
        hash: '0x1',
        from: '0xSENDER',
        to: ME.toUpperCase(),
        value: '1000000000000000000',
        timeStamp: '1700000000',
        txreceipt_status: '1',
      },
    ];

    expect(normalizeEthTransactions(txs, ME)).toEqual([
      {
        hash: '0x1',
        chain: 'eth',
        type: 'receive',
        amount: '1.00000000',
        counterparty: '0xSENDER',
        timestamp: new Date(1_700_000_000 * 1000).toISOString(),
        confirmed: true,
      },
    ]);
  });
});

describe('normalizeStxTransactions', () => {
  it('keeps only token_transfers and normalizes micro-STX amounts', () => {
    const txs = [
      {
        tx_id: 'st1',
        tx_type: 'token_transfer',
        tx_status: 'success',
        sender_address: 'SPsender',
        burn_block_time_iso: '2026-01-01T00:00:00.000Z',
        token_transfer: { recipient_address: 'SPme', amount: '2000000' },
      },
      { tx_id: 'st2', tx_type: 'contract_call', tx_status: 'success' },
    ];

    expect(normalizeStxTransactions(txs, 'SPme')).toEqual([
      {
        hash: 'st1',
        chain: 'stx',
        type: 'receive',
        amount: '2.000000',
        counterparty: 'SPsender',
        timestamp: '2026-01-01T00:00:00.000Z',
        confirmed: true,
      },
    ]);
  });
});

describe('normalizeSolTransactions', () => {
  it('placeholders direction/amount and derives confirmed from err === null', () => {
    const sigs = [
      { signature: 'sig1', blockTime: 1_700_000_000, err: null },
      { signature: 'sig2', blockTime: null, err: { InstructionError: [] } },
    ];

    const result = normalizeSolTransactions(sigs);

    expect(result[0]).toMatchObject({
      hash: 'sig1',
      type: 'receive',
      amount: '0',
      confirmed: true,
    });
    expect(result[1]).toMatchObject({ hash: 'sig2', confirmed: false });
  });
});

describe('normalizeSolTransactionDetail', () => {
  const ME = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
  const THEM = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const BLOCK_TIME = 1_700_000_000;

  function detail(
    accountKeys: string[],
    preBalances: number[],
    postBalances: number[],
    fee = 5_000,
    err: unknown = null,
  ) {
    return {
      transaction: {
        signatures: ['sig1'],
        message: { accountKeys: accountKeys.map(pubkey => ({ pubkey })) },
      },
      meta: { fee, preBalances, postBalances, err },
      blockTime: BLOCK_TIME,
    };
  }

  it('reads a receive from the owner lamport delta', () => {
    // The owner is not the fee payer here, so no fee is added back.
    const tx = normalizeSolTransactionDetail(
      ME,
      detail([THEM, ME], [3_000_000_000, 0], [1_999_995_000, 1_000_000_000]),
    );

    expect(tx).toMatchObject({
      hash: 'sig1',
      chain: 'sol',
      type: 'receive',
      amount: '1.000000000',
      counterparty: THEM,
      confirmed: true,
    });
  });

  it('excludes the fee when the owner paid it, so a send reports the transfer', () => {
    const tx = normalizeSolTransactionDetail(
      ME,
      detail([ME, THEM], [2_000_000_000, 0], [999_995_000, 1_000_000_000]),
    );

    expect(tx).toMatchObject({
      type: 'send',
      // 1.000000000 transferred, not 1.000005000 including the fee.
      amount: '1.000000000',
      counterparty: THEM,
    });
  });

  it('leaves the counterparty unknown when nothing opposes the owner delta', () => {
    // A fee-only transaction: the owner loses the fee and nobody gains.
    const tx = normalizeSolTransactionDetail(ME, detail([ME], [1_000_000_000], [999_995_000]));

    expect(tx).toMatchObject({ counterparty: 'unknown', amount: '0.000000000' });
  });

  it('marks a failed transaction unconfirmed', () => {
    const tx = normalizeSolTransactionDetail(
      ME,
      detail([ME, THEM], [1_000_000_000, 0], [999_995_000, 0], 5_000, { InstructionError: [] }),
    );

    expect(tx?.confirmed).toBe(false);
  });

  it('degrades to a zero-amount row when the address is not an account key', () => {
    const tx = normalizeSolTransactionDetail(ME, detail([THEM], [1_000], [1_000]));

    expect(tx).toMatchObject({ amount: '0', counterparty: 'unknown', type: 'receive' });
  });

  it('degrades to a zero-amount row when balance metadata is missing', () => {
    const tx = normalizeSolTransactionDetail(ME, {
      transaction: { signatures: ['sig1'], message: { accountKeys: [{ pubkey: ME }] } },
      meta: null,
      blockTime: BLOCK_TIME,
    });

    expect(tx).toMatchObject({ amount: '0', confirmed: false });
  });
});

describe('normalizeSuiTransactions', () => {
  const SUI = '0x2::sui::SUI';
  const SUI_ME = `0x${'a'.repeat(64)}`;
  const SUI_OTHER = `0x${'b'.repeat(64)}`;

  it('reads direction and amount from the watched address SUI balance delta', () => {
    const txs = [
      {
        digest: 'd_in',
        timestampMs: '1700000000000',
        transaction: { data: { sender: SUI_OTHER } },
        balanceChanges: [
          { coinType: SUI, amount: '1500000000', owner: { AddressOwner: SUI_ME } },
          { coinType: SUI, amount: '-1500000000', owner: { AddressOwner: SUI_OTHER } },
        ],
      },
    ];

    expect(normalizeSuiTransactions(txs, SUI_ME)).toEqual([
      {
        hash: 'd_in',
        chain: 'sui',
        type: 'receive',
        amount: '1.500000000',
        counterparty: SUI_OTHER,
        timestamp: new Date(1_700_000_000_000).toISOString(),
        confirmed: true,
      },
    ]);
  });

  it('marks a negative delta as a send and reports the recipient as counterparty', () => {
    const txs = [
      {
        digest: 'd_out',
        timestampMs: '1700000001000',
        transaction: { data: { sender: SUI_ME } },
        balanceChanges: [
          { coinType: SUI, amount: '-2000000000', owner: { AddressOwner: SUI_ME } },
          { coinType: SUI, amount: '2000000000', owner: { AddressOwner: SUI_OTHER } },
        ],
      },
    ];

    const [tx] = normalizeSuiTransactions(txs, SUI_ME);
    expect(tx).toMatchObject({ type: 'send', amount: '2.000000000', counterparty: SUI_OTHER });
  });

  it('dedupes overlapping From/To blocks on digest and sorts newest first', () => {
    const base = {
      transaction: { data: { sender: SUI_OTHER } },
      balanceChanges: [{ coinType: SUI, amount: '1000000000', owner: { AddressOwner: SUI_ME } }],
    };
    const txs = [
      { digest: 'old', timestampMs: '1700000000000', ...base },
      { digest: 'new', timestampMs: '1700000005000', ...base },
      { digest: 'old', timestampMs: '1700000000000', ...base },
    ];

    const result = normalizeSuiTransactions(txs, SUI_ME);
    expect(result.map(t => t.hash)).toEqual(['new', 'old']);
  });

  it('falls back to amount 0 and sender-based direction when no SUI moves for the address', () => {
    const txs = [
      {
        digest: 'd_obj',
        timestampMs: '1700000002000',
        transaction: { data: { sender: SUI_ME } },
        balanceChanges: [
          { coinType: '0x2::other::COIN', amount: '5', owner: { AddressOwner: SUI_ME } },
        ],
      },
    ];

    const [tx] = normalizeSuiTransactions(txs, SUI_ME);
    expect(tx).toMatchObject({ type: 'send', amount: '0.000000000', counterparty: 'unknown' });
  });
});
