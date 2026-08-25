/**
 * Media content-type detection — ports Leather's `sip9-media` technique (MIT).
 *
 * The content type is what the renderer dispatches on (image → `<img>`,
 * `video/*` → `<video>`, `audio/*` → `<audio>`, `model/gltf*` → model-viewer).
 * Vendors don't always report it, so we resolve it in two steps: a cheap HEAD
 * request asking for a single byte (`Range: bytes=0-0`) to read the server's
 * `Content-Type`, falling back to sniffing the URL's file extension when the
 * request is unavailable, blocked by CORS, or returns nothing useful.
 */

/** The MIME types the NFT media renderer knows how to play (issue #93). */
export const SUPPORTED_NFT_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/aac',
  'audio/flac',
  'model/gltf+json',
  'model/gltf-binary',
] as const;

const extensionToContentType: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  flac: 'audio/flac',
  gltf: 'model/gltf+json',
  glb: 'model/gltf-binary',
};

/**
 * Best-effort content type from a URL's file extension. Pure — no network — so
 * it is both the fallback for `detectContentType` and independently testable.
 * Query strings and fragments are stripped before reading the extension.
 */
export function contentTypeFromExtension(url: string): string | undefined {
  const path = url.split(/[?#]/)[0] ?? '';
  const lastDot = path.lastIndexOf('.');
  if (lastDot === -1) return undefined;
  const ext = path.slice(lastDot + 1).toLowerCase();
  return extensionToContentType[ext];
}

/** Strip any `; charset=…` parameter so callers compare against a bare type. */
function normalizeHeader(value: string): string {
  const base = value.split(';')[0]?.trim().toLowerCase();
  return base ?? '';
}

/**
 * Resolve a media URL's content type: a one-byte HEAD-style read for the
 * server's `Content-Type` header, falling back to the file extension. `fetchImpl`
 * is injectable so the detection is unit-testable without a network. Returns
 * `undefined` when neither source yields a type — the renderer then degrades to
 * a generic fallback rather than guessing.
 */
export async function detectContentType(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  try {
    const res = await fetchImpl(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
    const header = res.headers.get('content-type');
    if (header) {
      const normalized = normalizeHeader(header);
      // Generic octet-stream tells us nothing; prefer the extension guess.
      if (normalized && normalized !== 'application/octet-stream') {
        return normalized;
      }
    }
  } catch {
    // Network error / CORS / no such host — fall through to the extension.
  }

  return contentTypeFromExtension(url);
}
