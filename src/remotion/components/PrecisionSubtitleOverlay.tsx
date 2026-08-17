/**
 * 🎬 PRECISION SUBTITLE OVERLAY
 * Word-Level Timing with ElevenLabs Timestamps
 * 
 * Karaoke-style word highlighting for 95%+ Loft-Film quality
 */

import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { safeInterpolate, safeSpring as spring } from '../utils/safeInterpolate';
import type { PhonemeTimestamp } from '../utils/phonemeMapping';

export interface PrecisionSubtitleConfig {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  textColor?: string;
  highlightColor?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  position?: 'bottom' | 'top' | 'center';
  padding?: number;
  borderRadius?: number;
  maxWidth?: number;
  showWordHighlight?: boolean;
  animationStyle?: 'karaoke' | 'fade' | 'scale' | 'typewriter';
}

export interface SubtitleSegment {
  text: string;
  startTime: number;
  endTime: number;
  words?: WordTiming[];
}

export interface WordTiming {
  word: string;
  startTime: number;
  endTime: number;
}

interface PrecisionSubtitleOverlayProps {
  subtitles: SubtitleSegment[];
  phonemeTimestamps?: PhonemeTimestamp[];
  config?: PrecisionSubtitleConfig;
}

const DEFAULT_CONFIG: PrecisionSubtitleConfig = {
  fontSize: 42,
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 700,
  textColor: '#FFFFFF',
  highlightColor: '#F5C76A',
  backgroundColor: '#000000',
  backgroundOpacity: 0.75,
  position: 'bottom',
  padding: 16,
  borderRadius: 12,
  maxWidth: 900,
  showWordHighlight: true,
  animationStyle: 'karaoke',
};

/** Applies an opacity (0..1) to a hex or rgb(a)/named color. */
export function withOpacity(color: string, opacity: number): string {
  const a = Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 1));
  const hex = color.trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (m) {
    const full = m[1].length === 3
      ? m[1].split('').map((c) => c + c).join('')
      : m[1];
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(hex);
  if (rgb) {
    const parts = rgb[1].split(',').map((p) => p.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
  }
  return hex;
}


// Build word timings from phoneme timestamps
function buildWordTimingsFromPhonemes(
  text: string, 
  phonemes: PhonemeTimestamp[]
): WordTiming[] {
  if (!phonemes || phonemes.length === 0) {
    // Fallback: distribute words evenly
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const avgDuration = 0.3; // 300ms per word default
    return words.map((word, index) => ({
      word,
      startTime: index * avgDuration,
      endTime: (index + 1) * avgDuration,
    }));
  }

  const words: WordTiming[] = [];
  let currentWord = '';
  let wordStartTime = 0;
  let wordEndTime = 0;
  let isFirstChar = true;

  for (const phoneme of phonemes) {
    const char = phoneme.character;
    
    if (char === ' ' || char === '\n') {
      // Word boundary
      if (currentWord.length > 0) {
        words.push({
          word: currentWord,
          startTime: wordStartTime,
          endTime: wordEndTime,
        });
        currentWord = '';
        isFirstChar = true;
      }
    } else if (/[.!?,;:]/.test(char)) {
      // Punctuation - attach to current word
      currentWord += char;
      wordEndTime = phoneme.end_time;
    } else {
      // Regular character
      if (isFirstChar) {
        wordStartTime = phoneme.start_time;
        isFirstChar = false;
      }
      currentWord += char;
      wordEndTime = phoneme.end_time;
    }
  }

  // Don't forget last word
  if (currentWord.length > 0) {
    words.push({
      word: currentWord,
      startTime: wordStartTime,
      endTime: wordEndTime,
    });
  }

  return words;
}

// Get active subtitle segment
function getActiveSegment(
  subtitles: SubtitleSegment[], 
  currentTime: number
): SubtitleSegment | null {
  return subtitles.find(
    seg => currentTime >= seg.startTime && currentTime <= seg.endTime
  ) || null;
}

// Get word progress within segment
function getWordProgress(
  words: WordTiming[], 
  currentTime: number
): { activeIndex: number; progress: number } {
  for (let i = 0; i < words.length; i++) {
    if (currentTime < words[i].startTime) {
      return { activeIndex: i - 1, progress: 0 };
    }
    if (currentTime >= words[i].startTime && currentTime <= words[i].endTime) {
      const progress = (currentTime - words[i].startTime) / (words[i].endTime - words[i].startTime);
      return { activeIndex: i, progress };
    }
  }
  return { activeIndex: words.length - 1, progress: 1 };
}

export const PrecisionSubtitleOverlay: React.FC<PrecisionSubtitleOverlayProps> = ({
  subtitles,
  phonemeTimestamps,
  config = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // ✅ Defensive: treat invalid subtitles as empty
  const safeSubtitles = (subtitles && Array.isArray(subtitles)) ? subtitles : [];

  // Get current active segment
  const activeSegment = useMemo(
    () => safeSubtitles.length > 0 ? getActiveSegment(safeSubtitles, currentTime) : null,
    [safeSubtitles, currentTime]
  );

  // Build word timings for active segment
  const wordTimings = useMemo(() => {
    if (!activeSegment) return [];
    
    // Use provided word timings or build from phonemes
    if (activeSegment.words && activeSegment.words.length > 0) {
      return activeSegment.words;
    }
    
    // Build from phoneme timestamps if available
    if (phonemeTimestamps && phonemeTimestamps.length > 0) {
      // Filter phonemes for this segment
      const segmentPhonemes = phonemeTimestamps.filter(
        p => p.start_time >= activeSegment.startTime && p.end_time <= activeSegment.endTime
      );
      return buildWordTimingsFromPhonemes(activeSegment.text, segmentPhonemes);
    }
    
    // Fallback: distribute words evenly across segment duration
    const rawText = activeSegment?.text;
    if (!rawText || typeof rawText !== 'string') return [];
    const words = rawText.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return [];
    const segDuration = (activeSegment?.endTime || 0) - (activeSegment?.startTime || 0);
    const safeDuration = Math.max(0.1, segDuration);
    const wordDuration = safeDuration / words.length;
    
    return words.map((word, index) => ({
      word,
      startTime: (activeSegment?.startTime || 0) + index * wordDuration,
      endTime: (activeSegment?.startTime || 0) + (index + 1) * wordDuration,
    }));
  }, [activeSegment, phonemeTimestamps]);

  // Get word progress
  const { activeIndex, progress } = useMemo(
    () => getWordProgress(wordTimings, currentTime),
    [wordTimings, currentTime]
  );

  if (!activeSegment) return null;

  // Entry animation — anchored to the START OF THE ACTIVE SEGMENT.
  // (Previously this used `frame % (fps * 0.5)`, which re-triggered the whole
  // box every half second and made the subtitles flicker permanently.)
  const framesSinceSegmentStart = Math.max(
    0,
    frame - Math.round((activeSegment.startTime || 0) * fps),
  );
  const entryProgress = spring({
    frame: framesSinceSegmentStart,
    fps,
    config: { damping: 15, stiffness: 120, mass: 0.5 },
  });
  // Clean exit so the last frames don't hard-cut.
  const framesUntilSegmentEnd = Math.max(
    0,
    Math.round((activeSegment.endTime || 0) * fps) - frame,
  );
  const exitOpacity = safeInterpolate(
    framesUntilSegmentEnd,
    [0, Math.max(1, Math.round(fps * 0.15))],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Position styles — shared with the segment renderer so switching the
  // animation never moves the subtitle vertically.
  const position = mergedConfig.position || 'bottom';
  const placement = getUccSubtitleAbsolutePlacement(position);
  const baseTransform = placement.transform;


  const hasBox = !!mergedConfig.backgroundColor
    && mergedConfig.backgroundColor !== 'transparent'
    && (mergedConfig.backgroundOpacity ?? 0) > 0;

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyles[position],
        maxWidth: mergedConfig.maxWidth,
        padding: hasBox ? mergedConfig.padding : 0,
        backgroundColor: hasBox
          ? withOpacity(mergedConfig.backgroundColor!, mergedConfig.backgroundOpacity ?? 0.75)
          : 'transparent',
        borderRadius: hasBox ? mergedConfig.borderRadius : 0,
        boxShadow: hasBox ? '0 8px 32px rgba(0, 0, 0, 0.3)' : 'none',
        opacity: Math.min(safeInterpolate(entryProgress, [0, 1], [0, 1]), exitOpacity),
        transform: `${baseTransform} translateY(${safeInterpolate(entryProgress, [0, 1], [20, 0])}px)`,
        zIndex: 200,
      }}
    >

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '8px',
          lineHeight: 1.4,
        }}
      >
        {wordTimings.map((wordTiming, index) => {
          // Determine word state
          const isActive = index === activeIndex;
          const isSpoken = index < activeIndex;
          const isUpcoming = index > activeIndex;

          // Animation based on style
          let wordStyle: React.CSSProperties = {
            fontFamily: mergedConfig.fontFamily,
            fontSize: mergedConfig.fontSize,
            fontWeight: mergedConfig.fontWeight,
            display: 'inline-block',
            transition: 'all 0.15s ease-out',
          };

          switch (mergedConfig.animationStyle) {
            case 'karaoke':
              wordStyle = {
                ...wordStyle,
                color: isSpoken || isActive 
                  ? mergedConfig.highlightColor 
                  : mergedConfig.textColor,
                textShadow: isActive 
                  ? `0 0 20px ${mergedConfig.highlightColor}80, 0 0 40px ${mergedConfig.highlightColor}40`
                  : isSpoken 
                    ? `0 0 10px ${mergedConfig.highlightColor}40`
                    : '0 2px 4px rgba(0,0,0,0.5)',
                transform: isActive ? 'scale(1.08)' : 'scale(1)',
                opacity: isUpcoming ? 0.7 : 1,
              };
              break;

            case 'fade':
              wordStyle = {
                ...wordStyle,
                color: isSpoken || isActive ? mergedConfig.highlightColor : mergedConfig.textColor,
                opacity: isActive ? 1 : isSpoken ? 0.9 : 0.5,
                filter: isUpcoming ? 'blur(1px)' : 'none',
              };
              break;

            case 'scale':
              const scaleValue = isActive 
                ? safeInterpolate(progress, [0, 0.5, 1], [1, 1.15, 1.05])
                : isSpoken ? 1 : 0.95;
              wordStyle = {
                ...wordStyle,
                color: isSpoken || isActive ? mergedConfig.highlightColor : mergedConfig.textColor,
                transform: `scale(${scaleValue})`,
                opacity: isUpcoming ? 0.6 : 1,
              };
              break;

            case 'typewriter':
              wordStyle = {
                ...wordStyle,
                color: mergedConfig.textColor,
                opacity: isSpoken ? 1 : isActive ? progress : 0,
              };
              break;
          }

          // Highlight bar under active word (karaoke style)
          const showHighlightBar = mergedConfig.animationStyle === 'karaoke' && isActive;

          return (
            <span
              key={`word-${index}-${wordTiming.word}`}
              style={{
                ...wordStyle,
                position: 'relative',
              }}
            >
              {wordTiming.word}
              
              {/* Animated highlight bar */}
              {showHighlightBar && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: -4,
                    left: 0,
                    height: 3,
                    backgroundColor: mergedConfig.highlightColor,
                    borderRadius: 2,
                    width: `${progress * 100}%`,
                    transition: 'width 0.05s linear',
                    boxShadow: `0 0 8px ${mergedConfig.highlightColor}`,
                  }}
                />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default PrecisionSubtitleOverlay;
