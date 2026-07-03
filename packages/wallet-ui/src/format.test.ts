import { describe, expect, it } from 'vitest';
import { formatRelativeTime, formatSignedAmount, truncateAddress } from './format.js';

describe('truncateAddress', () => {
  it('middle-truncates a long address keeping both ends recognisable', () => {
    expect(truncateAddress('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBe('bc1qxy2k…0wlh');
  });

  it('returns a short address unchanged instead of mangling it', () => {
    expect(truncateAddress('0xabc123')).toBe('0xabc123');
  });

  it('respects a custom visible-length', () => {
    expect(truncateAddress('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF', 6)).toBe(
      '7u3HeHxYDLhn…Av5PfF',
    );
  });
});

describe('formatSignedAmount', () => {
  it('prefixes receives with + and sends with -', () => {
    expect(formatSignedAmount('receive', '0.5', 'SOL')).toBe('+0.5 SOL');
    expect(formatSignedAmount('send', '0.5', 'SOL')).toBe('-0.5 SOL');
  });

  it('never re-parses the amount string (precision stays with the caller)', () => {
    expect(formatSignedAmount('receive', '123456789.123456789123456789', 'ETH')).toBe(
      '+123456789.123456789123456789 ETH',
    );
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-03T12:00:00Z');

  it('maps ages to compact buckets', () => {
    expect(formatRelativeTime('2026-07-03T11:59:40Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-07-03T11:45:00Z', now)).toBe('15m ago');
    expect(formatRelativeTime('2026-07-03T07:00:00Z', now)).toBe('5h ago');
    expect(formatRelativeTime('2026-07-01T12:00:00Z', now)).toBe('2d ago');
  });

  it('falls back to a date once older than a week', () => {
    expect(formatRelativeTime('2026-06-20T12:00:00Z', now)).toBe(
      new Date('2026-06-20T12:00:00Z').toLocaleDateString(),
    );
  });

  it('returns empty for an invalid timestamp instead of NaN output', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('');
  });
});
