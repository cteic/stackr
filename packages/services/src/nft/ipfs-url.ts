/**
 * IPFS URL normalization — ports Leather's `toLeatherIpfsUrl` technique (MIT).
 *
 * NFT metadata points media at content-addressed IPFS in a handful of shapes
 * (`ipfs://<cid>/<path>`, `ipfs://ipfs/<cid>/...`, or an HTTP gateway URL that
 * already contains `/ipfs/<cid>/...`). Browsers can't fetch `ipfs://`, and the
 * gateway a deployment trusts is a config choice, so every media URL is routed
 * through one configurable gateway base here before it leaves the adapter. The
 * path segments are URL-encoded so spaces / unicode in filenames survive.
 */

/**
 * Default public gateway. Overridable per call (and per deployment) so the
 * choice of gateway never hard-codes into the adapters.
 */
export const DEFAULT_IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

/** A CID followed by an optional path is what we route through the gateway. */
function toGateway(cidAndPath: string, gateway: string): string {
  const base = gateway.endsWith('/') ? gateway : `${gateway}/`;
  const [cid, ...rest] = cidAndPath.split('/');
  const path = rest
    .filter(segment => segment.length > 0)
    .map(segment => encodeURIComponent(segment))
    .join('/');
  return path.length > 0 ? `${base}${cid}/${path}` : `${base}${cid}`;
}

/**
 * Resolve any IPFS-flavoured URL to an HTTP(S) gateway URL. Non-IPFS URLs
 * (`https://…`, `data:…`) are returned untouched, so an adapter can pass every
 * media URL through this unconditionally.
 */
export function toIpfsGatewayUrl(url: string, gateway: string = DEFAULT_IPFS_GATEWAY): string {
  const trimmed = url.trim();

  // ipfs://<cid>/<path> and the ipfs://ipfs/<cid>/<path> variant.
  if (trimmed.startsWith('ipfs://')) {
    const withoutScheme = trimmed.slice('ipfs://'.length);
    const cidAndPath = withoutScheme.startsWith('ipfs/')
      ? withoutScheme.slice('ipfs/'.length)
      : withoutScheme;
    return toGateway(cidAndPath, gateway);
  }

  // An HTTP gateway URL that already embeds /ipfs/<cid>/<path> — re-route it
  // through the configured gateway so every asset shares one host.
  const ipfsMarker = trimmed.indexOf('/ipfs/');
  if (ipfsMarker !== -1 && /^https?:\/\//.test(trimmed)) {
    return toGateway(trimmed.slice(ipfsMarker + '/ipfs/'.length), gateway);
  }

  return trimmed;
}
