// Augments the Cloudflare Workers env (declared by @opennextjs/cloudflare) with
// stackr's server-only secrets, so e.g. `getCloudflareContext().env.HELIUS_API_KEY`
// is typed at the proxy routes. These are server-only (no NEXT_PUBLIC_ prefix,
// so never bundled into the client) and are provisioned with
// `wrangler secret put <NAME>`.
declare global {
  interface CloudflareEnv {
    HELIUS_API_KEY?: string;
    ALCHEMY_API_KEY?: string;
    ETHERSCAN_API_KEY?: string;
    ALPHAVANTAGE_API_KEY?: string;
    HIRO_API_KEY?: string;
    /**
     * Workers Rate Limiting binding (wrangler.jsonc `unsafe.bindings`), the
     * fleet-wide layer of the /api/* proxy rate limiting. Optional: absent
     * outside the Workers runtime and on deploys made before the binding
     * existed; `proxy-limit.ts` degrades to its in-isolate window.
     */
    PROXY_RATE_LIMITER?: {
      limit(options: { key: string }): Promise<{ success: boolean }>;
    };
  }
}

export {};
