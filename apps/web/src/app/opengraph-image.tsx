import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

export const alt = 'Stackr — Cross-chain Web3 portfolio for self-custody';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// The image is built from static content (no request data), so it is always
// statically generated — the web build already prerenders it as a static asset.
// Declaring it explicitly keeps the route static-export-safe
// (`output: 'export'` rejects metadata image routes without static config).
export const dynamic = 'force-static';

function loadFont(): Buffer | null {
  try {
    return readFileSync(join(process.cwd(), 'src/app/LiberationSans-Bold.ttf'));
  } catch (err) {
    console.error('[og] Failed to load LiberationSans-Bold.ttf:', err);
    return null;
  }
}

export default async function OGImage() {
  const fontData = loadFont();

  return new ImageResponse(
    <div
      style={{
        background: '#0d0d0d',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        fontFamily: 'LiberationSans',
      }}
    >
      {/* Wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 32 }}>
          <div style={{ width: 8, height: 16, borderRadius: 2, background: '#849eff' }} />
          <div style={{ width: 8, height: 22, borderRadius: 2, background: '#f7931a' }} />
          <div style={{ width: 8, height: 30, borderRadius: 2, background: '#7f80ff' }} />
          <div style={{ width: 8, height: 20, borderRadius: 2, background: '#b97cff' }} />
        </div>
        <div style={{ color: '#ffffff', fontSize: 36, fontWeight: 700, letterSpacing: '-1px' }}>
          Stackr
        </div>
      </div>

      {/* Headline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div
            style={{
              color: '#ffffff',
              fontSize: 60,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: '-2px',
            }}
          >
            Cross-chain Web3 portfolio
          </div>
          <div
            style={{
              color: '#ffffff',
              fontSize: 60,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: '-2px',
            }}
          >
            for self-custody.
          </div>
        </div>
        <div style={{ color: '#777777', fontSize: 28, letterSpacing: '-0.5px' }}>
          Track BTC · ETH · STX · SOL in one place.
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 48, height: 6, borderRadius: 4, background: '#f7931a' }} />
          <div style={{ width: 48, height: 6, borderRadius: 4, background: '#849eff' }} />
          <div style={{ width: 48, height: 6, borderRadius: 4, background: '#7f80ff' }} />
          <div style={{ width: 48, height: 6, borderRadius: 4, background: '#b97cff' }} />
        </div>
        <div style={{ color: '#555555', fontSize: 22, letterSpacing: '0.5px' }}>stackr.ie</div>
      </div>
    </div>,
    {
      ...size,
      fonts: fontData
        ? [
            {
              name: 'LiberationSans',
              data: fontData,
              style: 'normal' as const,
              weight: 700 as const,
            },
          ]
        : [],
    },
  );
}
