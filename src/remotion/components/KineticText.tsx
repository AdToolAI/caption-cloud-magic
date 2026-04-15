import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from 'remotion';
import type { TextAnimation, TextPosition } from '@/types/video-composer';

interface KineticTextProps {
  text: string;
  position: TextPosition;
  animation: TextAnimation;
  fontSize: number;
  color: string;
  fontFamily?: string;
  delay?: number;
}

const getPositionStyle = (position: TextPosition): React.CSSProperties => {
  const base: React.CSSProperties = { position: 'absolute', width: '100%', padding: '0 40px', textAlign: 'center' };
  switch (position) {
    case 'top': return { ...base, top: '10%' };
    case 'center': return { ...base, top: '50%', transform: 'translateY(-50%)' };
    case 'bottom': return { ...base, bottom: '10%' };
    case 'top-left': return { ...base, top: '10%', textAlign: 'left' };
    case 'top-right': return { ...base, top: '10%', textAlign: 'right' };
    case 'bottom-left': return { ...base, bottom: '10%', textAlign: 'left' };
    case 'bottom-right': return { ...base, bottom: '10%', textAlign: 'right' };
    default: return { ...base, bottom: '10%' };
  }
};

export const KineticText: React.FC<KineticTextProps> = ({
  text, position, animation, fontSize, color, fontFamily = 'Inter, sans-serif', delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = Math.max(0, frame - delay);

  let style: React.CSSProperties = {
    fontSize, color, fontFamily, fontWeight: 700, lineHeight: 1.2,
    textShadow: '0 2px 12px rgba(0,0,0,0.6)',
  };

  switch (animation) {
    case 'fade-in': {
      const opacity = interpolate(f, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
      style = { ...style, opacity };
      break;
    }
    case 'scale-bounce': {
      const s = spring({ frame: f, fps, config: { damping: 8, stiffness: 200 } });
      style = { ...style, transform: `scale(${s})`, opacity: Math.min(1, f / 3) };
      break;
    }
    case 'slide-left': {
      const s = spring({ frame: f, fps, config: { damping: 20, stiffness: 180 } });
      const x = interpolate(s, [0, 1], [200, 0]);
      const opacity = interpolate(f, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
      style = { ...style, transform: `translateX(${x}px)`, opacity };
      break;
    }
    case 'slide-right': {
      const s = spring({ frame: f, fps, config: { damping: 20, stiffness: 180 } });
      const x = interpolate(s, [0, 1], [-200, 0]);
      const opacity = interpolate(f, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
      style = { ...style, transform: `translateX(${x}px)`, opacity };
      break;
    }
    case 'word-by-word': {
      const words = text.split(' ');
      const posStyle = getPositionStyle(position);
      return (
        <div style={posStyle}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: posStyle.textAlign === 'center' ? 'center' : 'flex-start', gap: `${fontSize * 0.3}px` }}>
            {words.map((word, i) => {
              const wordDelay = i * 4;
              const s = spring({ frame: Math.max(0, f - wordDelay), fps, config: { damping: 12, stiffness: 200 } });
              const opacity = interpolate(s, [0, 1], [0, 1]);
              const y = interpolate(s, [0, 1], [30, 0]);
              return (
                <span key={i} style={{ ...style, opacity, transform: `translateY(${y}px)`, display: 'inline-block' }}>
                  {word}
                </span>
              );
            })}
          </div>
        </div>
      );
    }
    case 'glow-pulse': {
      const opacity = interpolate(f, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
      const glowIntensity = interpolate(Math.sin(f * 0.15), [-1, 1], [8, 24]);
      style = {
        ...style, opacity,
        textShadow: `0 0 ${glowIntensity}px ${color}, 0 0 ${glowIntensity * 2}px ${color}40, 0 2px 12px rgba(0,0,0,0.6)`,
      };
      break;
    }
    default: break;
  }

  const posStyle = getPositionStyle(position);
  return (
    <div style={posStyle}>
      <span style={style}>{text}</span>
    </div>
  );
};
