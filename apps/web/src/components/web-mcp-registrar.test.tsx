import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { WebMcpRegistrar } from './web-mcp-registrar';

interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(args: unknown, options?: { signal?: AbortSignal }): Promise<unknown>;
}

function stubModelContext(registerTool: (tool: RegisteredTool) => void): () => void {
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: { registerTool },
  });
  return () => Reflect.deleteProperty(document, 'modelContext');
}

afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext');
  vi.restoreAllMocks();
});

describe('WebMcpRegistrar', () => {
  it('is completely inert where the browser has no modelContext', () => {
    expect('modelContext' in document).toBe(false);

    const { container } = render(<WebMcpRegistrar />);

    expect(container.innerHTML).toBe('');
  });

  it('registers the wallet-summary tool on document.modelContext', () => {
    const tools: RegisteredTool[] = [];
    const cleanup = stubModelContext(tool => tools.push(tool));

    render(<WebMcpRegistrar />);

    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe('get_wallet_summary');
    expect(tools[0]?.inputSchema).toMatchObject({
      type: 'object',
      required: ['chain', 'address'],
      additionalProperties: false,
    });

    cleanup();
  });

  it('proxies execute through the same /mcp endpoint a remote client would call', async () => {
    const tools: RegisteredTool[] = [];
    const cleanup = stubModelContext(tool => tools.push(tool));
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"jsonrpc":"2.0"}'));

    render(<WebMcpRegistrar />);
    await tools[0]?.execute({ chain: 'btc', address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' });

    expect(fetchSpy).toHaveBeenCalledWith('/mcp', expect.objectContaining({ method: 'POST' }));
    const [, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(init?.body)).toContain('"method":"tools/call"');

    cleanup();
  });

  it('ignores a modelContext that does not expose a callable registerTool', () => {
    Object.defineProperty(document, 'modelContext', { configurable: true, value: {} });

    expect(() => render(<WebMcpRegistrar />)).not.toThrow();
  });
});
