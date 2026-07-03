/**
 * Key-material hygiene helpers. JS strings are immutable and cannot be
 * scrubbed, so everything secret is kept as `Uint8Array` for as short a
 * lifetime as possible and wiped on the way out. `withWiped` guarantees the
 * wipe runs on both the success and failure paths.
 */

export function wipe(...buffers: Uint8Array[]): void {
  for (const buffer of buffers) {
    buffer.fill(0);
  }
}

export async function withWiped<T>(buffers: Uint8Array[], run: () => Promise<T> | T): Promise<T> {
  try {
    return await run();
  } finally {
    wipe(...buffers);
  }
}
