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
  }
}

export {};
