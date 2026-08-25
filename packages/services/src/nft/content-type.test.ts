import { describe, expect, it, vi } from 'vitest';
import { contentTypeFromExtension, detectContentType } from './content-type.js';

describe('contentTypeFromExtension', () => {
  it('maps common media extensions', () => {
    expect(contentTypeFromExtension('a/b/art.png')).toBe('image/png');
    expect(contentTypeFromExtension('clip.MP4')).toBe('video/mp4');
    expect(contentTypeFromExtension('song.flac')).toBe('audio/flac');
    expect(contentTypeFromExtension('model.glb')).toBe('model/gltf-binary');
  });

  it('strips query strings and fragments before reading the extension', () => {
    expect(contentTypeFromExtension('https://g/art.gif?token=1#x')).toBe('image/gif');
  });

  it('returns undefined for unknown or extensionless URLs', () => {
    expect(contentTypeFromExtension('https://g/art.xyz')).toBeUndefined();
    expect(contentTypeFromExtension('https://g/noext')).toBeUndefined();
  });
});

describe('detectContentType', () => {
  function fetchReturning(contentType: string | null): typeof fetch {
    return vi.fn(async () => ({
      headers: { get: (name: string) => (name === 'content-type' ? contentType : null) },
    })) as unknown as typeof fetch;
  }

  it('reads the server Content-Type header (charset stripped)', async () => {
    const result = await detectContentType(
      'https://g/x',
      fetchReturning('image/png; charset=binary'),
    );
    expect(result).toBe('image/png');
  });

  it('issues a single-byte ranged request', async () => {
    const fetchImpl = fetchReturning('video/mp4');
    await detectContentType('https://g/x.bin', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('https://g/x.bin', {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    });
  });

  it('falls back to the extension on a generic octet-stream header', async () => {
    const result = await detectContentType(
      'https://g/art.png',
      fetchReturning('application/octet-stream'),
    );
    expect(result).toBe('image/png');
  });

  it('falls back to the extension when the request throws', async () => {
    const throwing = vi.fn(async () => {
      throw new Error('CORS');
    }) as unknown as typeof fetch;
    expect(await detectContentType('https://g/clip.webm', throwing)).toBe('video/webm');
  });

  it('returns undefined when neither header nor extension resolves', async () => {
    expect(await detectContentType('https://g/mystery', fetchReturning(null))).toBeUndefined();
  });
});
