import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Balance, Chain, Currency, Price } from '@stackr/models';
import type * as StackrServices from '@stackr/services';

// The fleet rate limiter resolves through getCloudflareContext; outside the
// Workers runtime it throws and only the in-isolate window applies.
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => Promise.reject(new Error('not in workers runtime')),
}));

const fetchBalance = vi.fn<(chain: Chain, address: string) => Promise<Balance>>();
const fetchPrices = vi.fn<(chains: Chain[], currency?: Currency) => Promise<Price[]>>();

vi.mock('@stackr/services', async () => {
  const actual = await vi.importActual<typeof StackrServices>('@stackr/services');
  return {
    ...actual,
    fetchBalance: (chain: Chain, address: string) => fetchBalance(chain, address),
    fetchPrices: (chains: Chain[], currency?: Currency) => fetchPrices(chains, currency),
  };
});

const { GET, POST } = await import('./route');

// A real, well-known public address — the same demo wallet the first-run hero
// loads — so the validation path under test is the real one.
const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

// Each case uses a distinct client IP: the in-isolate rate-limit window is
// module state, so distinct keys keep the cases independent.
let lastOctet = 0;
function rpc(body: unknown): Request {
  lastOctet += 1;
  return new Request('https://stackr.ie/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': `198.51.100.${lastOctet}`,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

interface RpcEnvelope {
  jsonrpc?: string;
  id?: string | number | null;
  result?: { tools?: { name: string }[]; content?: { text: string }[]; isError?: boolean };
  error?: { code: number; message: string };
}

async function envelope(response: Response): Promise<RpcEnvelope> {
  const parsed: unknown = await response.json();
  if (typeof parsed !== 'object' || parsed === null) throw new Error('not a JSON-RPC envelope');
  return parsed;
}

function toolText(body: RpcEnvelope): string {
  return body.result?.content?.map(block => block.text).join('') ?? '';
}

beforeEach(() => {
  fetchBalance.mockReset();
  fetchPrices.mockReset();
});

describe('tools/list', () => {
  it('advertises the single wallet-summary tool with a JSON-Schema input', async () => {
    const body = await envelope(await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' })));

    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe(1);
    expect(body.result?.tools?.map(tool => tool.name)).toEqual(['get_wallet_summary']);
  });

  it('closes the input schema so no extra argument is even describable', async () => {
    const body = await envelope(await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' })));
    const [tool] = body.result?.tools ?? [];

    expect(JSON.stringify(tool)).toContain('"additionalProperties":false');
  });
});

describe('initialize', () => {
  it('negotiates the protocol version and declares the tools capability', async () => {
    const response = await POST(rpc({ jsonrpc: '2.0', id: 'init', method: 'initialize' }));
    const text = JSON.stringify(await envelope(response));

    expect(text).toContain('protocolVersion');
    expect(text).toContain('"tools"');
  });
});

describe('tools/call with a valid address', () => {
  it('returns balance, spot price and a fiat valuation', async () => {
    fetchBalance.mockResolvedValue({
      chain: 'eth',
      address: VITALIK,
      rawBalance: '2500000000000000000',
      balance: '2.5',
      updatedAt: '2026-08-18T00:00:00.000Z',
    });
    fetchPrices.mockResolvedValue([
      {
        chain: 'eth',
        usdPrice: 2000,
        fiatPrice: 2000,
        currency: 'usd',
        change24h: 1.5,
        updatedAt: '2026-08-18T00:00:00.000Z',
      },
    ]);

    const body = await envelope(
      await POST(
        rpc({
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: { name: 'get_wallet_summary', arguments: { chain: 'eth', address: VITALIK } },
        }),
      ),
    );

    expect(body.result?.isError).toBeUndefined();
    const summary: unknown = JSON.parse(toolText(body));
    expect(summary).toMatchObject({
      chain: 'eth',
      chainName: 'Ethereum',
      symbol: 'ETH',
      address: VITALIK,
      balance: '2.5',
      value: 5000,
      currency: 'usd',
      explorerUrl: `https://etherscan.io/address/${VITALIK}`,
      stackrUrl: `https://stackr.ie/wallet/eth/${VITALIK}`,
    });
    expect(fetchBalance).toHaveBeenCalledWith('eth', VITALIK);
  });

  it('still answers with the balance when the price lookup fails', async () => {
    fetchBalance.mockResolvedValue({
      chain: 'btc',
      address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      rawBalance: '100000000',
      balance: '1',
      updatedAt: '2026-08-18T00:00:00.000Z',
    });
    fetchPrices.mockRejectedValue(new Error('coingecko down'));

    const body = await envelope(
      await POST(
        rpc({
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/call',
          params: {
            name: 'get_wallet_summary',
            arguments: { chain: 'btc', address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' },
          },
        }),
      ),
    );

    expect(JSON.parse(toolText(body))).toMatchObject({ balance: '1', price: null, value: null });
  });
});

describe('tools/call validation', () => {
  it('rejects an address that fails the chain shape, before any upstream call', async () => {
    const body = await envelope(
      await POST(
        rpc({
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: {
            name: 'get_wallet_summary',
            arguments: { chain: 'eth', address: 'definitely-not-an-address' },
          },
        }),
      ),
    );

    expect(body.result?.isError).toBe(true);
    expect(toolText(body)).toContain('Invalid address for Ethereum');
    expect(fetchBalance).not.toHaveBeenCalled();
  });

  it('rejects an unknown chain', async () => {
    const body = await envelope(
      await POST(
        rpc({
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: {
            name: 'get_wallet_summary',
            arguments: { chain: 'doge', address: VITALIK },
          },
        }),
      ),
    );

    expect(body.result?.isError).toBe(true);
    expect(toolText(body)).toContain('Invalid arguments');
    expect(fetchBalance).not.toHaveBeenCalled();
  });

  it('refuses a secret smuggled in as an extra argument rather than ignoring it', async () => {
    const body = await envelope(
      await POST(
        rpc({
          jsonrpc: '2.0',
          id: 11,
          method: 'tools/call',
          params: {
            name: 'get_wallet_summary',
            arguments: {
              chain: 'eth',
              address: VITALIK,
              privateKey: '0xdeadbeef',
            },
          },
        }),
      ),
    );

    expect(body.result?.isError).toBe(true);
    expect(toolText(body)).toContain('Invalid arguments');
    expect(fetchBalance).not.toHaveBeenCalled();
  });

  it('reports an unknown tool as a tool error, not a protocol error', async () => {
    const body = await envelope(
      await POST(
        rpc({
          jsonrpc: '2.0',
          id: 12,
          method: 'tools/call',
          params: { name: 'drain_wallet', arguments: {} },
        }),
      ),
    );

    expect(body.result?.isError).toBe(true);
    expect(toolText(body)).toContain('Unknown tool: drain_wallet');
  });

  it('never relays upstream error text when a chain read fails', async () => {
    fetchBalance.mockRejectedValue(new Error('https://api.etherscan.io/api?apikey=SUPERSECRET'));

    const body = await envelope(
      await POST(
        rpc({
          jsonrpc: '2.0',
          id: 13,
          method: 'tools/call',
          params: { name: 'get_wallet_summary', arguments: { chain: 'eth', address: VITALIK } },
        }),
      ),
    );

    expect(body.result?.isError).toBe(true);
    expect(toolText(body)).toBe('Could not read the Ethereum balance for that address.');
    expect(toolText(body)).not.toContain('SUPERSECRET');
  });
});

describe('JSON-RPC envelope errors', () => {
  it('answers an unknown method with -32601', async () => {
    const body = await envelope(
      await POST(rpc({ jsonrpc: '2.0', id: 14, method: 'resources/list' })),
    );

    expect(body.error).toEqual({
      code: -32601,
      message: 'Method not found: resources/list',
    });
    expect(body.id).toBe(14);
  });

  it('answers an unparseable body with -32700', async () => {
    const response = await POST(rpc('{not json'));

    expect(response.status).toBe(400);
    expect((await envelope(response)).error?.code).toBe(-32700);
  });

  it('answers a malformed envelope with -32600', async () => {
    const response = await POST(rpc({ id: 1, method: 'tools/list' }));

    expect(response.status).toBe(400);
    expect((await envelope(response)).error?.code).toBe(-32600);
  });

  it('answers tools/call without params with -32602', async () => {
    const body = await envelope(await POST(rpc({ jsonrpc: '2.0', id: 15, method: 'tools/call' })));

    expect(body.error?.code).toBe(-32602);
  });

  it('accepts a notification with no body in reply', async () => {
    const response = await POST(rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }));

    expect(response.status).toBe(202);
  });

  it('fails closed when the caller cannot be identified for rate limiting', async () => {
    const response = await POST(
      new Request('https://stackr.ie/mcp', {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    );

    expect(response.status).toBe(429);
  });

  it('refuses an oversized body', async () => {
    const response = await POST(rpc(JSON.stringify({ padding: 'x'.repeat(9000) })));

    expect(response.status).toBe(413);
  });
});

describe('GET /mcp', () => {
  it('describes the endpoint instead of 405-ing', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(JSON.stringify(await response.json())).toContain('get_wallet_summary');
  });
});
