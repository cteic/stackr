import { describe, expect, it } from 'vitest';
import {
  ANDROID_SAFE_DIAMETER_RATIO,
  ASSET_SPECS,
  BARS,
  COLOR_TYPE_RGB,
  COLOR_TYPE_RGBA,
  buildMark,
  encodePng,
  markBounds,
  parseColor,
  rasterise,
  renderAsset,
} from './generate-brand-assets.mjs';

function specFor(file: string) {
  const spec = ASSET_SPECS.find(candidate => candidate.file === file);
  if (spec === undefined) throw new Error(`No spec for ${file}`);
  return spec;
}

function readUInt32BE(png: Buffer, offset: number) {
  return png.readUInt32BE(offset);
}

describe('buildMark', () => {
  it('lays one bar per chain, left to right, with no overlap', () => {
    const shapes = buildMark({ size: 1024, markRatio: 0.62 });
    expect(shapes.map(shape => shape.chain)).toEqual(BARS.map(bar => bar.chain));
    for (let index = 1; index < shapes.length; index += 1) {
      const previous = shapes[index - 1];
      expect(shapes[index].x).toBeGreaterThan(previous.x + previous.width);
    }
  });

  it('shares one baseline so the bars read as a chart', () => {
    const shapes = buildMark({ size: 1024, markRatio: 0.62 });
    const baselines = shapes.map(shape => shape.y + shape.height);
    for (const baseline of baselines) {
      expect(baseline).toBeCloseTo(baselines[0], 6);
    }
  });

  it('centres the mark and fills the requested width', () => {
    const size = 1024;
    const bounds = markBounds(buildMark({ size, markRatio: 0.5 }));
    expect(bounds.width).toBeCloseTo(size * 0.5, 6);
    expect(bounds.minX + bounds.maxX).toBeCloseTo(size, 6);
    expect(bounds.minY + bounds.maxY).toBeCloseTo(size, 6);
  });
});

describe('adaptive icon safe zone', () => {
  it('keeps every corner of every bar inside the Android mask circle', () => {
    const spec = specFor('adaptive-icon.png');
    const centre = spec.size / 2;
    const safeRadius = (spec.size * ANDROID_SAFE_DIAMETER_RATIO) / 2;
    for (const shape of buildMark(spec)) {
      const corners = [
        [shape.x, shape.y],
        [shape.x + shape.width, shape.y],
        [shape.x, shape.y + shape.height],
        [shape.x + shape.width, shape.y + shape.height],
      ];
      for (const [x, y] of corners) {
        expect(Math.hypot(x - centre, y - centre)).toBeLessThanOrEqual(safeRadius);
      }
    }
  });
});

describe('rasterise', () => {
  it('leaves no transparent pixel when a background is painted', () => {
    const spec = specFor('icon.png');
    const { pixels } = rasterise({ ...spec, size: 128, samples: 2 });
    for (let offset = 3; offset < pixels.length; offset += 4) {
      expect(pixels[offset]).toBe(255);
    }
  });

  it('leaves the area outside the mark transparent on the foreground layer', () => {
    const spec = specFor('adaptive-icon.png');
    const size = 128;
    const { pixels } = rasterise({ ...spec, size, samples: 2 });
    // Top-left corner: outside the mark, so fully transparent.
    expect(pixels[3]).toBe(0);
    // Middle of the first bar: opaque. The canvas centre is not a useful probe
    // because it falls in the gap between the second and third bars.
    const [firstBar] = buildMark({ size, markRatio: spec.markRatio });
    const x = Math.round(firstBar.x + firstBar.width / 2);
    const y = Math.round(firstBar.y + firstBar.height / 2);
    expect(pixels[(y * size + x) * 4 + 3]).toBe(255);
  });

  it('paints each bar in its own chain colour', () => {
    const spec = specFor('icon.png');
    const size = 256;
    const { pixels } = rasterise({ ...spec, size, samples: 2 });
    for (const shape of buildMark({ size, markRatio: spec.markRatio })) {
      const x = Math.round(shape.x + shape.width / 2);
      const y = Math.round(shape.y + shape.height / 2);
      const offset = (y * size + x) * 4;
      const [r, g, b] = parseColor(shape.color);
      expect([pixels[offset], pixels[offset + 1], pixels[offset + 2]]).toEqual([r, g, b]);
    }
  });
});

describe('encodePng', () => {
  it('writes a PNG signature and the requested dimensions', () => {
    const png = encodePng({
      width: 4,
      height: 2,
      pixels: new Uint8Array(4 * 2 * 4),
      alpha: true,
    });
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(readUInt32BE(png, 16)).toBe(4);
    expect(readUInt32BE(png, 20)).toBe(2);
    expect(png.readUInt8(25)).toBe(COLOR_TYPE_RGBA);
  });

  it('drops the alpha channel entirely when alpha is false', () => {
    const png = encodePng({
      width: 4,
      height: 2,
      pixels: new Uint8Array(4 * 2 * 4),
      alpha: false,
    });
    expect(png.readUInt8(25)).toBe(COLOR_TYPE_RGB);
  });
});

describe('ASSET_SPECS', () => {
  it('encodes the iOS icon with no alpha channel, because App Store Connect rejects one', () => {
    const spec = specFor('icon.png');
    expect(spec.alpha).toBe(false);
    expect(spec.size).toBe(1024);
    const png = renderAsset({ ...spec, size: 64, samples: 1 });
    expect(png.readUInt8(25)).toBe(COLOR_TYPE_RGB);
  });

  it('leaves the iOS icon corners square, because iOS applies its own mask', () => {
    expect(specFor('icon.png').backgroundRadius).toBe(0);
  });

  it('names every asset app.json references', () => {
    expect(ASSET_SPECS.map(spec => spec.file).sort()).toEqual([
      'adaptive-icon.png',
      'favicon.png',
      'icon.png',
      'splash.png',
    ]);
  });
});
