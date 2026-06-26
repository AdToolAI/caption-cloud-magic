/**
 * HormoziCaption — word-by-word pop-in caption renderer (Hormozi / MrBeast
 * short-form style). Self-contained Remotion component used by
 * `UniversalVideo` when `subtitleStyle.animation === 'hormozi'`.
 *
 * Renders max 3 words on screen at a time. The currently-spoken word
 * pops in (scale 0.6 → 1.05 spring) and a configurable HIGHLIGHT box wraps
 * any word that matches the segment's `highlightKeywords` list.
 *
 * Word timing comes from the existing `words[]` on each subtitle segment
 * (ElevenLabs/Whisper). When word-level timing is missing, the parent
 * caller is expected to interpolate it before calling this layer.
 */
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export interface HormoziWord {
  text: string;
  startTime: number;
  endTime: number;
}

export interface HormoziSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  words: HormoziWord[];
  /** 1–3 power-words to visually highlight inside this segment. Case-insensitive match against `words[].text`. */
  highlightKeywords?: string[];
}

export interface HormoziStyle {
  position: 'top' | 'center' | 'bottom';
  font: string;
  fontSize: number;
  color: string;
  /** Highlight pill color (default gold). */
  highlightColor: string;
  /** Outline color of the white words (default black). */
  outlineColor: string;
  outlineWidth: number;
}

const DEFAULT_HIGHLIGHT = '#F5C76A';

function strokeShadow(color: string, w: number): string {
  const shadows: string[] = [];
  for (let x = -w; x <= w; x++) {
    for (let y = -w; y <= w; y++) {
      if (x !== 0 || y !== 0) shadows.push(`${x}px ${y}px 0 ${color}`);
    }
  }
  return shadows.join(', ');
}

function chunkWords(words: HormoziWord[], maxPerChunk = 3): HormoziWord[][] {
  if (!words.length) return [];
  const chunks: HormoziWord[][] = [];
  for (let i = 0; i < words.length; i += maxPerChunk) {
    chunks.push(words.slice(i, i + maxPerChunk));
  }
  return chunks;
}

export const HormoziCaption: React.FC<{
  segments: HormoziSegment[];
  style: HormoziStyle;
}> = ({ segments, style }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const t = frame / fps;
  const scale = (width / 1080) * 1.6;

  const segment = segments.find((s) => t >= s.startTime && t <= s.endTime);
  if (!segment || !segment.words?.length) return null;

  const chunks = chunkWords(segment.words, 3);
  // Active chunk = whichever chunk contains the currently-spoken word.
  const activeChunkIdx = chunks.findIndex((c) => {
    const first = c[0];
    const last = c[c.length - 1];
    return t >= first.startTime && t <= last.endTime + 0.05;
  });
  const chunk = chunks[Math.max(0, activeChunkIdx)] ?? chunks[0];

  const highlightSet = new Set(
    (segment.highlightKeywords ?? []).map((k) => k.toLowerCase().replace(/[.,!?;:'"`]/g, '').trim()).filter(Boolean),
  );

  const isHighlight = (w: string) => {
    const norm = w.toLowerCase().replace(/[.,!?;:'"`]/g, '').trim();
    return highlightSet.has(norm);
  };

  const justify =
    style.position === 'top' ? 'flex-start' : style.position === 'center' ? 'center' : 'flex-end';
  const padY =
    style.position === 'top' ? { paddingTop: '8%' } : style.position === 'bottom' ? { paddingBottom: '14%' } : {};

  const baseFont = (style.fontSize || 56) * scale;
  const highlightColor = style.highlightColor || DEFAULT_HIGHLIGHT;

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: justify,
        ...padY,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: `${0.25 * baseFont}px`,
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: '88%',
          fontFamily: style.font || 'Inter, system-ui, sans-serif',
          fontWeight: 900,
          fontSize: baseFont,
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
          textTransform: 'uppercase',
        }}
      >
        {chunk.map((w, i) => {
          const wordStartFrame = Math.max(0, Math.round(w.startTime * fps));
          const localFrame = frame - wordStartFrame;
          const popIn = spring({
            frame: localFrame,
            fps,
            config: { damping: 12, stiffness: 180, mass: 0.7 },
          });
          const scaleAnim = interpolate(popIn, [0, 1], [0.55, 1.05], { extrapolateRight: 'clamp' });
          const opacityAnim = interpolate(popIn, [0, 1], [0, 1], { extrapolateRight: 'clamp' });
          const highlighted = isHighlight(w.text);

          const pillStyle: React.CSSProperties = highlighted
            ? {
                background: highlightColor,
                color: '#0a0a0a',
                padding: `${0.05 * baseFont}px ${0.18 * baseFont}px`,
                borderRadius: `${0.18 * baseFont}px`,
                textShadow: 'none',
                boxShadow: `0 ${0.04 * baseFont}px 0 rgba(0,0,0,0.35)`,
              }
            : {
                color: style.color || '#ffffff',
                textShadow: strokeShadow(style.outlineColor || '#000000', Math.max(1, style.outlineWidth || 4)),
              };

          return (
            <span
              key={`${segment.id}-${i}-${w.text}`}
              style={{
                display: 'inline-block',
                transform: `scale(${scaleAnim})`,
                transformOrigin: 'center',
                opacity: opacityAnim,
                ...pillStyle,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Build word-level timing by linear interpolation when only sentence-level
 * timing is available. Pure helper; safe to call client-side before render.
 */
export function interpolateWordTimings(
  text: string,
  startTime: number,
  endTime: number,
): HormoziWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const total = Math.max(0.1, endTime - startTime);
  const per = total / words.length;
  return words.map((w, i) => ({
    text: w,
    startTime: startTime + i * per,
    endTime: startTime + (i + 1) * per,
  }));
}
