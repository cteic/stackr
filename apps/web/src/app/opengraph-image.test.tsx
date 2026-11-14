// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
  readFileSync: () => {
    throw new Error('fs.readFileSync is not implemented yet');
  },
}));

import OGImage from './opengraph-image';

/**
 * Cloudflare Workers has no fs.readFileSync, so the bundled font fails to
 * load there. The image must still render with the default font instead of
 * throwing "No fonts are loaded".
 */
describe('opengraph image', () => {
  it('renders a PNG when the custom font cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await OGImage();
    const body = new Uint8Array(await response.arrayBuffer());
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(Array.from(body.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]);
  });
});
