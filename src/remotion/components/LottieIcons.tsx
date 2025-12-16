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
import { FALLBACK_ANIMATIONS, getIconAnimations } from '@/data/lottie-library';

interface LottieIconsProps {
  sceneType: 'hook' | 'problem' | 'solution' | 'feature' | 'proof' | 'cta';
  position: 'left' | 'right' | 'top';
  size?: number;
  staggerDelay?: number;
}

// Map scene types to icon keys
const SCENE_ICON_MAP: Record<string, (keyof typeof FALLBACK_ANIMATIONS.icons)[]> = {
  hook: ['lightbulb', 'star'],
  problem: ['warning', 'error'],
  solution: ['checkmark', 'confetti'],
  feature: ['rocket', 'graph'],
  proof: ['trophy', 'graph'],
  cta: ['rocket', 'star'],
};

// Emoji fallbacks for when Lottie fails
const EMOJI_FALLBACKS: Record<string, string[]> = {
  hook: ['💡', '✨'],
  problem: ['⚠️', '❌'],
  solution: ['✅', '🎉'],
  feature: ['⭐', '🔧'],
  proof: ['📈', '🏆'],
  cta: ['🚀', '👉'],
};

interface IconData {
  url: string;
  animationData: LottieAnimationData | null;
  error: boolean;
}

export const LottieIcons: React.FC<LottieIconsProps> = ({
  sceneType,
  position,
  size = 80,
  staggerDelay = 12,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const [icons, setIcons] = useState<IconData[]>([]);
  const [handle] = useState(() => delayRender('Loading Lottie icons'));
  const [loaded, setLoaded] = useState(false);

  // Get icon URLs based on scene type
  const iconKeys = SCENE_ICON_MAP[sceneType] || SCENE_ICON_MAP.hook;
  const iconUrls = iconKeys.map(key => FALLBACK_ANIMATIONS.icons[key]);
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

  // Position styles
  const positionStyles: Record<string, React.CSSProperties> = {
    left: { left: 60, top: '20%', flexDirection: 'column' as const },
    right: { right: 60, top: '20%', flexDirection: 'column' as const },
    top: { top: 80, left: '50%', transform: 'translateX(-50%)', flexDirection: 'row' as const },
  };

  // Exit animation
  const exitOpacity = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        position: 'absolute',
        display: 'flex',
        gap: 20,
        ...positionStyles[position],
        pointerEvents: 'none',
        zIndex: 50,
        opacity: exitOpacity,
      }}
    >
      {icons.map((icon, i) => {
        const delay = i * staggerDelay;
        const iconProgress = spring({
          frame: frame - delay,
          fps,
          config: { damping: 10, stiffness: 120 },
        });

        const float = Math.sin((frame + i * 25) * 0.06) * 8;
        const rotate = Math.sin((frame + i * 15) * 0.04) * 10;

        const scale = 0.4 + 0.6 * Math.max(0, iconProgress);
        const opacity = Math.max(0, iconProgress);
        const translateY = (1 - Math.max(0, iconProgress)) * 60 + float;

        // If Lottie failed, render emoji fallback
        if (icon.error || !icon.animationData) {
          return (
            <div
              key={i}
              style={{
                fontSize: size * 0.8,
                opacity,
                transform: `
                  translateY(${translateY}px) 
                  scale(${scale})
                  rotate(${rotate}deg)
                `,
                filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
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
              width: size,
              height: size,
              opacity,
              transform: `
                translateY(${translateY}px) 
                scale(${scale})
                rotate(${rotate}deg)
              `,
              filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
            }}
          >
            <Lottie
              animationData={icon.animationData}
              style={{
                width: '100%',
                height: '100%',
              }}
              loop
              playbackRate={1}
            />
          </div>
        );
      })}
    </div>
  );
};

export default LottieIcons;
