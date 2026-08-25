import { describe, expect, it } from 'vitest';
import { toIpfsGatewayUrl, DEFAULT_IPFS_GATEWAY } from './ipfs-url.js';

describe('toIpfsGatewayUrl', () => {
  it('routes ipfs://<cid>/<path> through the default gateway', () => {
    expect(toIpfsGatewayUrl('ipfs://QmHash/3413.png')).toBe(
      `${DEFAULT_IPFS_GATEWAY}QmHash/3413.png`,
    );
  });

  it('strips the redundant ipfs/ prefix in ipfs://ipfs/<cid>', () => {
    expect(toIpfsGatewayUrl('ipfs://ipfs/QmHash/art.png')).toBe(
      `${DEFAULT_IPFS_GATEWAY}QmHash/art.png`,
    );
  });

  it('re-routes an existing http gateway URL through the configured gateway', () => {
    expect(
      toIpfsGatewayUrl(
        'https://cloudflare-ipfs.com/ipfs/QmHash/art.png',
        'https://my.gateway/ipfs/',
      ),
    ).toBe('https://my.gateway/ipfs/QmHash/art.png');
  });

  it('URL-encodes path segments with spaces and unicode', () => {
    expect(toIpfsGatewayUrl('ipfs://QmHash/cool art.png')).toBe(
      `${DEFAULT_IPFS_GATEWAY}QmHash/cool%20art.png`,
    );
  });

  it('handles a bare CID with no path', () => {
    expect(toIpfsGatewayUrl('ipfs://QmHash')).toBe(`${DEFAULT_IPFS_GATEWAY}QmHash`);
  });

  it('respects a custom gateway without a trailing slash', () => {
    expect(toIpfsGatewayUrl('ipfs://QmHash/a.png', 'https://g.io/ipfs')).toBe(
      'https://g.io/ipfs/QmHash/a.png',
    );
  });

  it('leaves non-IPFS https and data URLs untouched', () => {
    expect(toIpfsGatewayUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(toIpfsGatewayUrl('data:image/svg+xml,<svg/>')).toBe('data:image/svg+xml,<svg/>');
  });
});
