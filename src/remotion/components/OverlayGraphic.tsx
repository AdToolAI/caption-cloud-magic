/**
 * OverlayGraphic — der eine Renderer für alle Overlay-Bausteine (v407).
 *
 * Bewusst frei von Remotion- und Browser-spezifischen Hooks: dieselbe
 * Komponente zeichnet die Studio-Vorschau (DOM) und den Lambda-Export,
 * damit WYSIWYG-Parität garantiert ist. Alle Maße sind relativ zur
 * Canvas-Breite, die Aufrufer als `canvasWidth` (px) hereinreichen.
 */
import React from 'react';
import type { TextOverlay } from '@/types/directors-cut';
import { DEFAULT_OVERLAY_BOX, overlayFontRel } from '@/lib/directors-cut/overlayModel';
import { computeOverlayVisual } from './overlayAnim';

interface OverlayGraphicProps {
  overlay: TextOverlay;
  /** Sekunden seit Overlay-Start */
  t: number;
  /** Standzeit in Sekunden (Infinity = bis Ende) */
  duration: number;
  /** Breite der Zeichenfläche in px */
  canvasWidth: number;
}

const pct = (v: number) => `${v * 100}%`;

function textContent(overlay: TextOverlay, visibleChars: number): string {
  const full = overlay.text ?? '';
  return Number.isFinite(visibleChars) ? full.slice(0, Math.max(0, visibleChars)) : full;
}

export const OverlayGraphic: React.FC<OverlayGraphicProps> = ({ overlay, t, duration, canvasWidth }) => {
  const kind = overlay.kind ?? 'text';
  const box = overlay.box ?? DEFAULT_OVERLAY_BOX[kind];
  const s = overlay.style;
  const W = canvasWidth || 1080;

  const vis = computeOverlayVisual({
    animation: overlay.enter ?? overlay.animation,
    exit: overlay.exit,
    t,
    duration,
    textLength: (overlay.text ?? '').length,
  });

  const font = overlayFontRel(overlay) * W;
  const pad = (s.padding ?? 0.018) * W;
  const radius = (s.radius ?? 0.014) * W;
  const accent = s.accentColor || '#F5C76A';
  const fill = s.fill ?? (s.backgroundColor && s.backgroundColor !== 'transparent' ? s.backgroundColor : 'rgba(0,0,0,0.72)');
  const color = s.color || '#ffffff';
  const align = s.align ?? 'center';
  const shadow = s.shadow !== false ? '0 2px 12px rgba(0,0,0,0.55)' : undefined;
  const textShadow = s.shadow !== false ? '0 2px 8px rgba(0,0,0,0.85)' : undefined;
  const weight = s.fontWeight ?? 700;
  const upper = s.uppercase ?? false;
  const background = s.gradient ? `linear-gradient(135deg, ${s.gradient[0]}, ${s.gradient[1]})` : fill;

  const label = textContent(overlay, vis.visibleChars);
  const title = overlay.slots?.title ?? overlay.text ?? '';
  const subtitle = overlay.slots?.subtitle ?? '';

  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: pct(box.x),
    top: pct(box.y),
    width: pct(box.w),
    height: kind === 'text' || kind === 'quote' ? undefined : pct(box.h),
    minHeight: kind === 'text' || kind === 'quote' ? pct(box.h) : undefined,
    opacity: vis.opacity * (s.opacity ?? 1),
    transform: `${vis.transform} rotate(${s.rotation ?? 0}deg)`.trim(),
    filter: vis.filter,
    transformOrigin: 'center center',
    pointerEvents: 'none',
    display: 'flex',
    fontFamily: s.fontFamily || 'Inter, sans-serif',
  };

  const baseText: React.CSSProperties = {
    fontSize: font,
    fontWeight: weight,
    color,
    lineHeight: s.lineHeight ?? 1.2,
    letterSpacing: s.letterSpacing ? s.letterSpacing * font : undefined,
    textTransform: upper ? 'uppercase' : undefined,
    textAlign: align,
    textShadow,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
  };

  const panel: React.CSSProperties = {
    background,
    borderRadius: radius,
    border: s.borderWidth ? `${s.borderWidth * W}px solid ${s.borderColor || accent}` : undefined,
    boxShadow: shadow,
  };

  const wipeClip = vis.reveal < 1 ? { clipPath: `inset(0 ${(1 - vis.reveal) * 100}% 0 0)` } : undefined;

  const renderStaggered = (text: string, style: React.CSSProperties) => {
    if (!vis.staggerStep) return <span style={style}>{text}</span>;
    const words = text.split(' ');
    return (
      <span style={{ ...style, display: 'inline-block' }}>
        {words.map((w, i) => {
          const local = Math.min(1, Math.max(0, (t - i * vis.staggerStep) / 0.35));
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                opacity: local,
                transform: `translateY(${(1 - local) * 0.4 * font}px)`,
                marginRight: font * 0.25,
              }}
            >
              {w}
            </span>
          );
        })}
      </span>
    );
  };

  switch (kind) {
    case 'lowerThird':
      return (
        <div style={{ ...wrapperStyle, alignItems: 'stretch' }}>
          <div style={{ width: Math.max(3, 0.006 * W), background: accent, borderRadius: radius }} />
          <div
            style={{
              ...panel,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: `${pad * 0.7}px ${pad}px`,
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
              ...wipeClip,
            }}
          >
            <div style={{ ...baseText, textAlign: 'left' }}>{title}</div>
            {subtitle && (
              <div
                style={{
                  ...baseText,
                  textAlign: 'left',
                  fontSize: font * 0.55,
                  fontWeight: 500,
                  opacity: 0.85,
                  marginTop: font * 0.12,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
        </div>
      );

    case 'banner':
      return (
        <div style={{ ...wrapperStyle, alignItems: 'center' }}>
          <div
            style={{
              ...panel,
              flex: 1,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
              justifyContent: 'center',
              padding: `0 ${pad}px`,
              ...wipeClip,
            }}
          >
            {renderStaggered(label, baseText)}
            {subtitle && (
              <div style={{ ...baseText, fontSize: font * 0.5, fontWeight: 500, opacity: 0.85 }}>{subtitle}</div>
            )}
          </div>
        </div>
      );

    case 'badge':
      return (
        <div style={{ ...wrapperStyle, alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              ...panel,
              background: s.gradient ? background : s.fill || accent,
              borderRadius: '9999px',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: pad * 0.5,
            }}
          >
            <span style={{ ...baseText, color: s.color || '#0A0A0F', textAlign: 'center' }}>{label}</span>
          </div>
        </div>
      );

    case 'card':
      return (
        <div style={wrapperStyle}>
          <div
            style={{
              ...panel,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: pad * 0.8,
              padding: pad,
              backdropFilter: 'blur(6px)',
              ...wipeClip,
            }}
          >
            {overlay.slots?.imageUrl && (
              <img
                src={overlay.slots.imageUrl}
                alt=""
                style={{ height: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: radius * 0.7 }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...baseText, textAlign: 'left' }}>{title}</div>
              {subtitle && (
                <div
                  style={{
                    ...baseText,
                    textAlign: 'left',
                    fontSize: font * 0.55,
                    fontWeight: 500,
                    opacity: 0.85,
                    marginTop: font * 0.1,
                  }}
                >
                  {subtitle}
                </div>
              )}
            </div>
          </div>
        </div>
      );

    case 'cta':
      return (
        <div style={{ ...wrapperStyle, alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              ...panel,
              background: s.gradient ? background : s.fill || accent,
              borderRadius: '9999px',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: font * 0.4,
              padding: `0 ${pad}px`,
            }}
          >
            <span style={{ ...baseText, color: s.color || '#0A0A0F' }}>{label}</span>
            <span style={{ ...baseText, color: s.color || '#0A0A0F', fontSize: font * 0.9 }}>→</span>
          </div>
        </div>
      );

    case 'ticker':
      return (
        <div style={{ ...wrapperStyle, overflow: 'hidden' }}>
          <div
            style={{
              ...panel,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
              borderRadius: s.radius != null ? radius : 0,
            }}
          >
            <div
              style={{
                whiteSpace: 'nowrap',
                transform: `translateX(${vis.tickerOffset}%)`,
                ...baseText,
                textAlign: 'left',
              }}
            >
              {`${label}   •   ${label}   •   ${label}`}
            </div>
          </div>
        </div>
      );

    case 'logo':
      return (
        <div style={{ ...wrapperStyle, alignItems: 'center', justifyContent: 'center' }}>
          {overlay.slots?.imageUrl ? (
            <img
              src={overlay.slots.imageUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'contain', filter: shadow ? 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))' : undefined }}
            />
          ) : (
            <span style={{ ...baseText, opacity: 0.85 }}>{label}</span>
          )}
        </div>
      );

    case 'callout':
      return (
        <div style={{ ...wrapperStyle, alignItems: 'center' }}>
          <div style={{ width: Math.max(2, 0.004 * W), height: '100%', background: accent, marginRight: pad * 0.5 }} />
          <div
            style={{
              ...panel,
              padding: `${pad * 0.5}px ${pad * 0.8}px`,
              display: 'flex',
              alignItems: 'center',
              ...wipeClip,
            }}
          >
            <span style={{ ...baseText, textAlign: 'left' }}>{label}</span>
          </div>
        </div>
      );

    case 'quote':
      return (
        <div style={{ ...wrapperStyle, flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...baseText, fontSize: font * 2, color: accent, lineHeight: 1, textAlign: align }}>“</div>
          {renderStaggered(label, { ...baseText, fontStyle: 'italic' })}
          {subtitle && (
            <div style={{ ...baseText, fontSize: font * 0.5, fontWeight: 500, opacity: 0.8, marginTop: font * 0.4 }}>
              — {subtitle}
            </div>
          )}
        </div>
      );

    case 'progress':
      return (
        <div style={{ ...wrapperStyle, alignItems: 'center' }}>
          <div style={{ width: '100%', height: '100%', background: fill, borderRadius: radius, overflow: 'hidden' }}>
            <div
              style={{
                width: `${(Number.isFinite(duration) ? vis.lifeProgress : 1) * 100}%`,
                height: '100%',
                background: s.gradient ? background : accent,
              }}
            />
          </div>
        </div>
      );

    case 'text':
    default:
      return (
        <div style={{ ...wrapperStyle, alignItems: 'center', justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center' }}>
          <div
            style={{
              ...(s.backgroundColor && s.backgroundColor !== 'transparent' ? { ...panel, padding: `${pad * 0.6}px ${pad}px` } : {}),
              maxWidth: '100%',
              ...wipeClip,
              ...(vis.reveal < 1 && (overlay.enter ?? overlay.animation) === 'highlight'
                ? {
                    clipPath: undefined,
                    backgroundImage: `linear-gradient(transparent 60%, ${accent}80 60%)`,
                    backgroundSize: `${vis.reveal * 100}% 100%`,
                    backgroundRepeat: 'no-repeat',
                  }
                : {}),
            }}
          >
            {renderStaggered(label, baseText)}
          </div>
        </div>
      );
  }
};
