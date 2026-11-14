// Generates the store and launcher assets for Stackr Wallet from the brand
// mark, so `apps/mobile/assets/*.png` is reproducible output rather than
// hand-placed binaries. Run `pnpm --filter @stackr/mobile assets` after any
// change here and commit both the script and the regenerated PNGs.
//
// The mark is the web app's own icon: four vertical bars in the chain brand
// colours on the dark terminal background. Its proportions are lifted straight
// from `apps/web/public/icons/icon-512.svg` (the WEB_* constants below), so the
// phone icon and the browser tab stay the same logo rather than two drawings
// that drift apart.
//
// The "STACKR" wordmark on the web icon is deliberately dropped here. At the
// 60px the iOS home screen and the Android launcher actually render, 52px-tall
// lettering scaled to ~6px is noise; the bar silhouette still reads.
//
// No image library: shapes are supersampled into an RGBA raster and written as
// PNG with node:zlib. That keeps a committed generator runnable on a clean
// checkout with nothing but the repo's own toolchain.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Dark terminal background, matching the `background` Tamagui token. */
export const BACKGROUND_COLOR = '#0b0d10';

/**
 * One bar per chain, left to right, in each chain's own brand colour. The
 * heights are the SVG's, in its 512-unit space.
 */
export const BARS = [
  { chain: 'eth', color: '#627eea', height: 140 },
  { chain: 'btc', color: '#f7931a', height: 212 },
  { chain: 'stx', color: '#5546ff', height: 252 },
  { chain: 'sol', color: '#9945ff', height: 180 },
];

// The web icon's grid: 64-wide bars on an 84 pitch, tallest bar 252.
const WEB_BAR_WIDTH = 64;
const WEB_BAR_PITCH = 84;
const WEB_BAR_RADIUS = 8;

/** Width of the whole mark in the web icon's units: three pitches plus a bar. */
export const MARK_SPAN = WEB_BAR_PITCH * (BARS.length - 1) + WEB_BAR_WIDTH;

/** Height of the mark over its width. The mark is wider than it is tall. */
export const MARK_ASPECT = Math.max(...BARS.map(bar => bar.height)) / MARK_SPAN;

/** Length of the mark's bounding-box diagonal, as a multiple of its width. */
export const MARK_DIAGONAL_RATIO = Math.sqrt(1 + MARK_ASPECT ** 2);

/**
 * Android masks an adaptive icon's layers to a shape inscribed in a circle of
 * 66% of the layer width; anything outside that circle can be clipped on some
 * launchers. Sizing the mark so its whole bounding box fits in that circle,
 * with 3% to spare, makes the safe zone a property of the geometry instead of
 * a number someone has to remember.
 */
export const ANDROID_SAFE_DIAMETER_RATIO = 0.66;

export const ADAPTIVE_MARK_RATIO = (ANDROID_SAFE_DIAMETER_RATIO / MARK_DIAGONAL_RATIO) * 0.97;

/**
 * What gets written, and why each one is shaped the way it is.
 *
 * - `markRatio` is the mark's width as a fraction of the canvas width.
 * - `alpha: false` writes a PNG with no alpha channel at all. App Store Connect
 *   rejects an icon that has one, so the iOS icon is encoded as truecolour RGB
 *   rather than merely being opaque.
 * - `backgroundRadius` is 0 on the iOS icon on purpose: iOS applies its own
 *   corner mask, and pre-rounded corners show as a dark halo inside it.
 */
export const ASSET_SPECS = [
  {
    file: 'icon.png',
    size: 1024,
    alpha: false,
    background: BACKGROUND_COLOR,
    backgroundRadius: 0,
    markRatio: 0.62,
  },
  {
    file: 'adaptive-icon.png',
    size: 1024,
    alpha: true,
    background: null,
    backgroundRadius: 0,
    markRatio: ADAPTIVE_MARK_RATIO,
  },
  {
    file: 'splash.png',
    size: 1024,
    alpha: true,
    background: null,
    backgroundRadius: 0,
    markRatio: 0.44,
  },
  {
    file: 'favicon.png',
    size: 64,
    alpha: false,
    background: BACKGROUND_COLOR,
    backgroundRadius: 0.1875,
    markRatio: 0.78,
  },
];

/** `#rrggbb` to a `[r, g, b]` triple. */
export function parseColor(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match === null) throw new Error(`Expected a #rrggbb colour, got "${hex}"`);
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * The mark as rounded rectangles in canvas pixels, centred on the canvas.
 * Bars share a baseline, so the silhouette reads as a chart rather than as
 * four floating blocks.
 */
export function buildMark({ size, markRatio }) {
  const width = size * markRatio;
  const scale = width / MARK_SPAN;
  const height = width * MARK_ASPECT;
  const left = (size - width) / 2;
  const baseline = (size + height) / 2;
  const barWidth = WEB_BAR_WIDTH * scale;
  return BARS.map((bar, index) => {
    const barHeight = bar.height * scale;
    return {
      chain: bar.chain,
      color: bar.color,
      x: left + index * WEB_BAR_PITCH * scale,
      y: baseline - barHeight,
      width: barWidth,
      height: barHeight,
      radius: WEB_BAR_RADIUS * scale,
    };
  });
}

/** Tight bounding box around a set of shapes. */
export function markBounds(shapes) {
  const minX = Math.min(...shapes.map(shape => shape.x));
  const minY = Math.min(...shapes.map(shape => shape.y));
  const maxX = Math.max(...shapes.map(shape => shape.x + shape.width));
  const maxY = Math.max(...shapes.map(shape => shape.y + shape.height));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Is the point inside the rounded rectangle? Clamping the point into the
 * rectangle inset by the corner radius gives the nearest point of the shape's
 * straight core, so only true corners end up further away than the radius.
 */
function insideRoundedRect(shape, px, py) {
  const { x, y, width, height } = shape;
  if (px < x || px > x + width || py < y || py > y + height) return false;
  const radius = Math.min(shape.radius, width / 2, height / 2);
  if (radius <= 0) return true;
  const coreX = Math.min(Math.max(px, x + radius), x + width - radius);
  const coreY = Math.min(Math.max(py, y + radius), y + height - radius);
  const dx = px - coreX;
  const dy = py - coreY;
  return dx * dx + dy * dy <= radius * radius;
}

/** Fraction of a pixel covered by a shape, from an n-by-n subsample grid. */
function coverage(shape, px, py, samples) {
  let hits = 0;
  for (let sy = 0; sy < samples; sy += 1) {
    const y = py + (sy + 0.5) / samples;
    for (let sx = 0; sx < samples; sx += 1) {
      if (insideRoundedRect(shape, px + (sx + 0.5) / samples, y)) hits += 1;
    }
  }
  return hits / (samples * samples);
}

/**
 * Paint the background and then the mark into a straight-alpha RGBA raster.
 * Edges are antialiased by supersampling, which is what keeps the bars from
 * looking ragged at launcher size.
 */
export function rasterise({ size, background, backgroundRadius, markRatio, samples = 4 }) {
  const pixels = new Uint8Array(size * size * 4);
  const shapes = [];
  if (background !== null) {
    shapes.push({
      color: background,
      x: 0,
      y: 0,
      width: size,
      height: size,
      radius: size * backgroundRadius,
    });
  }
  shapes.push(...buildMark({ size, markRatio }));

  for (const shape of shapes) {
    const [r, g, b] = parseColor(shape.color);
    const startY = Math.max(0, Math.floor(shape.y));
    const endY = Math.min(size, Math.ceil(shape.y + shape.height));
    const startX = Math.max(0, Math.floor(shape.x));
    const endX = Math.min(size, Math.ceil(shape.x + shape.width));
    for (let py = startY; py < endY; py += 1) {
      for (let px = startX; px < endX; px += 1) {
        const alpha = coverage(shape, px, py, samples);
        if (alpha === 0) continue;
        compositeOver(pixels, (py * size + px) * 4, r, g, b, alpha);
      }
    }
  }

  return { width: size, height: size, pixels };
}

/** Source-over compositing of one opaque colour at `alpha` onto the raster. */
function compositeOver(pixels, offset, r, g, b, alpha) {
  const dstAlpha = pixels[offset + 3] / 255;
  const outAlpha = alpha + dstAlpha * (1 - alpha);
  if (outAlpha === 0) return;
  for (const [channel, value] of [r, g, b].entries()) {
    const dst = pixels[offset + channel];
    pixels[offset + channel] = Math.round(
      (value * alpha + dst * dstAlpha * (1 - alpha)) / outAlpha,
    );
  }
  pixels[offset + 3] = Math.round(outAlpha * 255);
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_unused, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, tail]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG colour type 6 is truecolour with alpha; type 2 is truecolour without. */
export const COLOR_TYPE_RGBA = 6;
export const COLOR_TYPE_RGB = 2;

/**
 * Encode a raster as a PNG. With `alpha: false` the alpha channel is dropped
 * from the file rather than filled with 255, because that is what App Store
 * Connect checks for.
 */
export function encodePng({ width, height, pixels, alpha }) {
  const channels = alpha ? 4 : 3;
  const colorType = alpha ? COLOR_TYPE_RGBA : COLOR_TYPE_RGB;

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(colorType, 9);
  header.writeUInt8(0, 10); // deflate
  header.writeUInt8(0, 11); // adaptive filtering
  header.writeUInt8(0, 12); // no interlace

  // One filter byte (0 = None) per scanline, then the raw samples.
  const raw = Buffer.alloc(height * (1 + width * channels));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * channels);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const target = rowStart + 1 + x * channels;
      for (let channel = 0; channel < channels; channel += 1) {
        raw[target + channel] = pixels[source + channel];
      }
    }
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Render one spec to PNG bytes. */
export function renderAsset(spec) {
  const raster = rasterise(spec);
  return encodePng({ ...raster, alpha: spec.alpha });
}

function main() {
  const outputDir = fileURLToPath(new URL('../assets/', import.meta.url));
  mkdirSync(outputDir, { recursive: true });
  for (const spec of ASSET_SPECS) {
    const png = renderAsset(spec);
    writeFileSync(join(outputDir, spec.file), png);
    console.log(`  ${spec.file}  ${spec.size}x${spec.size}  ${(png.length / 1024).toFixed(1)} kB`);
  }
  console.log(`✓ brand assets written to apps/mobile/assets/`);
}

// Run only when invoked directly, so the geometry stays importable for tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
