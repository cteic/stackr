'use client';

import { useEffect } from 'react';

/**
 * WebMCP registration — progressive enhancement, nothing more.
 *
 * WebMCP is a W3C *Community Group* draft (Web Machine Learning CG), not a
 * standards-track spec, and no browser has confirmed shipping it. So this
 * component feature-detects and does nothing at all when unsupported, which is
 * currently every browser.
 *
 * The namespace is `document.modelContext`. The earlier proposal used
 * `navigator.modelContext` and most tutorials and polyfills still show that
 * name; it was superseded by the August 2026 Community Group Report.
 *
 * The tool it registers is a thin client for `POST /mcp` — the server endpoint
 * is the source of truth for behaviour, and an in-page agent gets exactly what
 * a remote MCP client gets.
 */

const TOOL_NAME = 'get_wallet_summary';

interface ToolExecuteResult {
  content: { type: 'text'; text: string }[];
}

interface ModelContextToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(args: unknown, options?: { signal?: AbortSignal }): Promise<ToolExecuteResult>;
}

interface ModelContextRegistrationOptions {
  signal?: AbortSignal;
}

interface ModelContext {
  registerTool(
    tool: ModelContextToolDefinition,
    options?: ModelContextRegistrationOptions,
  ): unknown;
}

/**
 * Narrow `document.modelContext` without a cast. The draft is unshipped and the
 * shape may move, so anything that is not an object exposing a callable
 * `registerTool` is treated as absent.
 */
function resolveModelContext(host: Document): ModelContext | null {
  if (!('modelContext' in host)) return null;

  const candidate: unknown = Reflect.get(host, 'modelContext');
  if (typeof candidate !== 'object' || candidate === null) return null;
  if (!('registerTool' in candidate)) return null;

  const registerTool: unknown = Reflect.get(candidate, 'registerTool');
  if (typeof registerTool !== 'function') return null;

  return {
    registerTool: (tool, options) => Reflect.apply(registerTool, candidate, [tool, options]),
  };
}

const INPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    chain: {
      type: 'string',
      enum: ['btc', 'stx', 'eth', 'sol', 'sui'],
      description: 'Which chain the address belongs to.',
    },
    address: {
      type: 'string',
      description: 'The public receiving address to look up. Never a private key or seed phrase.',
    },
    currency: {
      type: 'string',
      enum: ['usd', 'eur', 'gbp', 'jpy', 'cad', 'aud'],
      description: 'Fiat currency to value the balance in. Defaults to usd.',
    },
  },
  required: ['chain', 'address'],
  additionalProperties: false,
};

async function callWalletSummary(
  args: unknown,
  signal: AbortSignal | undefined,
): Promise<ToolExecuteResult> {
  const response = await fetch('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: TOOL_NAME, arguments: args },
    }),
    signal,
  });

  const text = await response.text();
  return { content: [{ type: 'text', text }] };
}

export function WebMcpRegistrar() {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const modelContext = resolveModelContext(document);
    if (modelContext === null) return;

    // Unregistering on unmount is what the AbortSignal is for; the browser
    // drops the tool when the controller aborts.
    const controller = new AbortController();

    modelContext.registerTool(
      {
        name: TOOL_NAME,
        description:
          'Read the current balance of a public blockchain address on Bitcoin, Stacks, Ethereum, Solana or Sui, valued at the live spot price. Watch-only public data.',
        inputSchema: INPUT_SCHEMA,
        execute: (args, options) => callWalletSummary(args, options?.signal ?? controller.signal),
      },
      { signal: controller.signal },
    );

    return () => controller.abort();
  }, []);

  return null;
}
