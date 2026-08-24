import { z } from 'zod';
import { checkProxyRateLimit } from '../api/proxy-limit';
import { callTool, TOOLS } from '@/lib/mcp/tools';
import { absoluteUrl, resolveSiteUrl } from '@/lib/site';

/**
 * Model Context Protocol endpoint — a remote MCP server over Streamable HTTP.
 *
 * One POST speaking JSON-RPC 2.0, implementing `initialize`, `tools/list` and
 * `tools/call`. This is the half of the agent story that works today: any MCP
 * client can be pointed at https://stackr.ie/mcp and immediately read a public
 * address's balance. The in-page `document.modelContext` registration
 * (components/web-mcp-registrar.tsx) is the speculative half.
 *
 * The tool itself, and its security posture, live in `lib/mcp/tools.ts`. What
 * this file adds is transport: the JSON-RPC envelope, and a rate limit. The
 * route is metered by the same limiter as the `/api/*` proxies
 * (`PROXY_RATE_LIMITER`), because it fans out to the same paid upstreams.
 * Unlike those proxies it is deliberately cross-origin — an MCP client is not a
 * first-party browser fetch — so the same-origin check those routes apply is
 * replaced by the rate limit alone.
 */

/** The MCP spec revision this endpoint implements. */
const PROTOCOL_VERSION = '2026-07-28';

/** Requests larger than this are refused; the largest valid call is ~200 bytes. */
const MAX_BODY_BYTES = 8_192;

const JSONRPC_PARSE_ERROR = -32700;
const JSONRPC_INVALID_REQUEST = -32600;
const JSONRPC_METHOD_NOT_FOUND = -32601;
const JSONRPC_INVALID_PARAMS = -32602;
const JSONRPC_INTERNAL_ERROR = -32603;

const CORS_HEADERS: Record<string, string> = {
  // Public, unauthenticated, read-only data, and no cookie or credential is
  // ever read, so a wildcard origin grants a caller nothing it could not fetch
  // for itself.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400',
};

/** A JSON-RPC id is a string, a number, or null — never an object. */
const RequestIdSchema = z.union([z.string(), z.number(), z.null()]);

const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: RequestIdSchema.optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

const ToolCallParamsSchema = z.object({
  name: z.string(),
  arguments: z.unknown().optional(),
});

type JsonRpcId = z.infer<typeof RequestIdSchema>;

interface JsonRpcErrorBody {
  code: number;
  message: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...CORS_HEADERS,
    },
  });
}

function rpcResult(id: JsonRpcId, result: unknown): Response {
  return jsonResponse({ jsonrpc: '2.0', id, result }, 200);
}

/**
 * JSON-RPC carries errors in the envelope, not the HTTP status, so protocol
 * errors answer 200. Transport-level refusals (unparseable body, rate limit)
 * keep their real HTTP status so a plain HTTP client still sees them.
 */
function rpcError(id: JsonRpcId, error: JsonRpcErrorBody, status: number = 200): Response {
  return jsonResponse({ jsonrpc: '2.0', id, error }, status);
}

async function dispatch(method: string, params: unknown, id: JsonRpcId): Promise<Response> {
  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'stackr', title: 'Stackr', version: '1.0.0' },
      instructions:
        'Stackr is a watch-only multi-chain portfolio tracker. Use get_wallet_summary to read the public balance of an address on Bitcoin, Stacks, Ethereum, Solana or Sui.',
    });
  }

  if (method === 'tools/list') {
    return rpcResult(id, { tools: TOOLS });
  }

  if (method === 'tools/call') {
    const parsed = ToolCallParamsSchema.safeParse(params);
    if (!parsed.success) {
      return rpcError(id, {
        code: JSONRPC_INVALID_PARAMS,
        message: 'params must include a tool name',
      });
    }
    return rpcResult(id, await callTool(parsed.data.name, parsed.data.arguments));
  }

  return rpcError(id, { code: JSONRPC_METHOD_NOT_FOUND, message: `Method not found: ${method}` });
}

export async function POST(request: Request): Promise<Response> {
  // Same limiter as the /api/* proxies: this route fans out to the same metered
  // upstreams, and an unauthenticated public endpoint in front of them is an
  // open relay without it. `unidentified` fails closed, as it does there.
  if ((await checkProxyRateLimit(request, 'mcp')) !== 'allowed') {
    return rpcError(null, { code: JSONRPC_INTERNAL_ERROR, message: 'rate limit exceeded' }, 429);
  }

  const declaredLength = Number.parseInt(request.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return rpcError(
      null,
      { code: JSONRPC_INVALID_REQUEST, message: 'request body too large' },
      413,
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return rpcError(
      null,
      { code: JSONRPC_INVALID_REQUEST, message: 'request body too large' },
      413,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return rpcError(null, { code: JSONRPC_PARSE_ERROR, message: 'Parse error' }, 400);
  }

  const envelope = JsonRpcRequestSchema.safeParse(payload);
  if (!envelope.success) {
    return rpcError(null, { code: JSONRPC_INVALID_REQUEST, message: 'Invalid Request' }, 400);
  }

  const { method, params } = envelope.data;

  // A JSON-RPC notification carries no id and must produce no response body.
  if (envelope.data.id === undefined) {
    if (method.startsWith('notifications/')) {
      return new Response(null, { status: 202, headers: CORS_HEADERS });
    }
    return rpcError(null, { code: JSONRPC_INVALID_REQUEST, message: 'Invalid Request' }, 400);
  }

  return dispatch(method, params, envelope.data.id);
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Discovery convenience: a GET says what this endpoint is instead of 405-ing. */
export function GET(): Response {
  return jsonResponse(
    {
      name: 'stackr',
      transport: 'streamable-http',
      protocolVersion: PROTOCOL_VERSION,
      method: 'POST',
      tools: TOOLS.map(tool => tool.name),
      documentation: absoluteUrl('/llms.txt', resolveSiteUrl()),
    },
    200,
  );
}
