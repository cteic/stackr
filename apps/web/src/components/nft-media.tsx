'use client';

import type { NftCardMedia, NftMediaMode } from '@stackr/features';
import { nftMediaPlayback } from '@stackr/features';

interface NftMediaProps {
  media: NftCardMedia;
  /** Grid cards pass "thumbnail"; a detail view passes "full". */
  mode?: NftMediaMode;
  alt: string;
  className?: string;
}

/**
 * Renders a collectible's media by switching on the kind the `@stackr/features`
 * view model already decided (`classifyNftMediaKind`): image → <img>,
 * video/* → <video>, audio/* → <audio> (an icon in thumbnail mode), model/gltf*
 * → an isolated google model-viewer iframe. The MIME-dispatch technique is a
 * fresh build of Leather's `sip9-media` renderer (MIT). The platform-agnostic
 * decision lives in features; this component is the web half that paints it.
 */
export function NftMedia({ media, mode = 'thumbnail', alt, className }: NftMediaProps) {
  const playback = nftMediaPlayback(media.kind, mode);
  const classes = className ?? 'h-full w-full object-cover';

  switch (media.kind) {
    case 'image':
      // NFT media is served from arbitrary, non-enumerable IPFS gateways, so
      // next/image's domain allowlist can't cover it — a plain <img> is the
      // pragmatic choice (the no-img-element rule is scoped off for this file).
      return <img src={media.url} alt={alt} loading="lazy" className={classes} />;

    case 'video':
      return (
        <video
          src={media.url}
          className={classes}
          controls={playback.controls}
          autoPlay={playback.autoPlay}
          loop={playback.loop}
          muted={playback.muted}
          playsInline={playback.playsInline}
          preload="metadata"
        />
      );

    case 'audio':
      if (mode === 'thumbnail') {
        return <MediaGlyph label="Audio" symbol="♪" className={classes} />;
      }
      return (
        <div className={`flex items-center justify-center ${classes}`}>
          <audio src={media.url} controls className="w-full" preload="metadata" />
        </div>
      );

    case 'model':
      return <ModelViewer url={media.url} className={classes} autoRotate={mode === 'full'} />;

    case 'unsupported':
    default:
      return <MediaGlyph label="No preview" symbol="◊" className={classes} />;
  }
}

interface ModelViewerProps {
  url: string;
  className: string;
  autoRotate: boolean;
}

/**
 * A glTF/GLB model rendered inside an isolated iframe: the google model-viewer
 * web component and its module script live in the iframe's own document, so the
 * custom element never has to be registered (or typed) in the host page and the
 * host CSP stays untouched. The src is escaped before interpolation.
 */
function ModelViewer({ url, className, autoRotate }: ModelViewerProps) {
  const safeUrl = url.replaceAll('"', '%22');
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8" />
<style>html,body{margin:0;height:100%;background:#0a0a0a}model-viewer{width:100%;height:100%}</style>
<script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
</head><body><model-viewer src="${safeUrl}" camera-controls ${autoRotate ? 'auto-rotate' : ''}></model-viewer></body></html>`;

  return (
    <iframe
      srcDoc={srcDoc}
      title="3D model"
      className={className}
      sandbox="allow-scripts"
      loading="lazy"
    />
  );
}

interface MediaGlyphProps {
  label: string;
  symbol: string;
  className: string;
}

/** Placeholder for audio thumbnails and unsupported/unknown media. */
function MediaGlyph({ label, symbol, className }: MediaGlyphProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1 bg-muted text-muted-foreground ${className}`}
    >
      <span className="text-2xl leading-none" aria-hidden>
        {symbol}
      </span>
      <span className="text-xs">{label}</span>
    </div>
  );
}
