import React, { useEffect, useState } from 'react';
import { Lottie, LottieAnimationData } from '@remotion/lottie';
import { 
  useCurrentFrame, 
  useVideoConfig, 
  interpolate, 
  spring,
  delayRender,
  continueRender,
} from 'remotion';
import { FALLBACK_ANIMATIONS, getIconKeys } from '../data/lottie-library';

interface LottieIconsProps {
  sceneType: 'hook' | 'problem' | 'solution' | 'feature' | 'proof' | 'cta';
  position: 'left' | 'right' | 'top' | 'scattered';
  size?: number;
  staggerDelay?: number;
}

// Emoji fallbacks with better variety
const EMOJI_FALLBACKS: Record<string, string[]> = {
  hook: ['💡', '✨', '🎯'],
  problem: ['⚠️', '❌', '😰'],
  solution: ['✅', '🎉', '🚀'],
  feature: ['⭐', '🔧', '📊'],
  proof: ['📈', '🏆', '💯'],
  cta: ['🚀', '👉', '🔥'],
};

interface IconData {
  url: string;
  animationData: LottieAnimationData | null;
  error: boolean;
}

export const LottieIcons: React.FC<LottieIconsProps> = ({
  sceneType,
  position,
  size = 70,
  staggerDelay = 10,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const [icons, setIcons] = useState<IconData[]>([]);
  const [handle] = useState(() => delayRender('Loading Lottie icons'));
  const [loaded, setLoaded] = useState(false);

  // Get icon URLs based on scene type from the library
  const iconKeys = getIconKeys(sceneType);
  const iconUrls = iconKeys.map(key => 
    FALLBACK_ANIMATIONS.icons[key as keyof typeof FALLBACK_ANIMATIONS.icons] || 
    FALLBACK_ANIMATIONS.icons.star
  );
  const emojiFallbacks = EMOJI_FALLBACKS[sceneType] || EMOJI_FALLBACKS.hook;

  useEffect(() => {
    let cancelled = false;

    const loadIcons = async () => {
      const loadedIcons: IconData[] = [];

      for (const url of iconUrls) {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error('Failed to fetch');
          const data = await response.json();
          
          if (!cancelled) {
            loadedIcons.push({ url, animationData: data, error: false });
          }
        } catch (err) {
          console.warn('Failed to load Lottie icon:', url);
          loadedIcons.push({ url, animationData: null, error: true });
        }
      }

      if (!cancelled) {
        setIcons(loadedIcons);
        setLoaded(true);
        continueRender(handle);
      }
    };

    loadIcons();

    return () => {
      cancelled = true;
    };
  }, [iconUrls.join(','), handle]);

  // Position configurations
  const getPositionConfig = () => {
    switch (position) {
      case 'left':
        return {
          containerStyle: { left: 50, top: '15%', flexDirection: 'column' as const },
          itemOffsets: iconUrls.map((_, i) => ({ x: 0, y: i * 90 })),
        };
      case 'right':
        return {
          containerStyle: { right: 50, top: '15%', flexDirection: 'column' as const },
          itemOffsets: iconUrls.map((_, i) => ({ x: 0, y: i * 90 })),
        };
      case 'top':
        return {
          containerStyle: { top: 70, left: '50%', transform: 'translateX(-50%)', flexDirection: 'row' as const },
          itemOffsets: iconUrls.map((_, i) => ({ x: i * 100, y: 0 })),
        };
      case 'scattered':
        return {
          containerStyle: { inset: 0 },
          itemOffsets: [
            { x: 80, y: 100 },
            { x: 300, y: 60 },
            { x: 150, y: 200 },
          ],
        };
      default:
        return {
          containerStyle: { right: 60, top: '20%', flexDirection: 'column' as const },
          itemOffsets: iconUrls.map((_, i) => ({ x: 0, y: i * 90 })),
        };
    }
  };

  const { containerStyle, itemOffsets } = getPositionConfig();

  // ✅ Validate durationInFrames to prevent "Invalid array length" error
  const safeDuration = Math.max(30, Number(durationInFrames) || 30);
  const exitStart = Math.max(10, safeDuration - 20);
  
  // Exit animation with safe range
  const exitOpacity = interpolate(
    frame,
    [exitStart, safeDuration],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        position: 'absolute',
        display: position === 'scattered' ? 'block' : 'flex',
        gap: 15,
        ...containerStyle,
        pointerEvents: 'none',
        zIndex: 60,
        opacity: exitOpacity,
      }}
    >
      {icons.map((icon, i) => {
        const delay = i * staggerDelay;
        const iconProgress = spring({
          frame: frame - delay,
          fps,
          config: { damping: 10, stiffness: 100, mass: 0.6 },
        });

        // Floating animation with variety
        const floatY = Math.sin((frame + i * 30) * 0.05) * 10;
        const floatX = Math.cos((frame + i * 20) * 0.03) * 5;
        const rotate = Math.sin((frame + i * 15) * 0.04) * 8;
        const pulse = 1 + Math.sin((frame + i * 10) * 0.08) * 0.05;

        const scale = (0.3 + 0.7 * Math.max(0, iconProgress)) * pulse;
        const opacity = Math.max(0, iconProgress);
        const translateY = (1 - Math.max(0, iconProgress)) * 50 + floatY;

        const itemStyle: React.CSSProperties = position === 'scattered'
          ? {
              position: 'absolute' as const,
              left: itemOffsets[i]?.x || 0,
              top: itemOffsets[i]?.y || 0,
            }
          : {};

        // Render emoji fallback if Lottie failed
        if (icon.error || !icon.animationData) {
          return (
            <div
              key={i}
              style={{
                ...itemStyle,
                fontSize: size * 0.9,
                opacity,
                transform: `
                  translate(${floatX}px, ${translateY}px) 
                  scale(${scale})
                  rotate(${rotate}deg)
                `,
                filter: 'drop-shadow(0 6px 15px rgba(0,0,0,0.35))',
                textShadow: '0 0 20px rgba(255,255,255,0.3)',
              }}
            >
              {emojiFallbacks[i] || '⭐'}
            </div>
          );
        }

        return (
          <div
            key={i}
            style={{
              ...itemStyle,
              width: size,
              height: size,
              opacity,
              transform: `
                translate(${floatX}px, ${translateY}px) 
                scale(${scale})
                rotate(${rotate}deg)
              `,
              filter: 'drop-shadow(0 6px 15px rgba(0,0,0,0.35))',
            }}
          >
            <Lottie
              animationData={icon.animationData}
              style={{
                width: '100%',
                height: '100%',
              }}
              loop
              playbackRate={0.8}
            />
          </div>
        );
      })}
    </div>
  );
};

export default LottieIcons;
