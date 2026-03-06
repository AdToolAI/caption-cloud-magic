import React, { useEffect, useState, useRef } from 'react';
import { Lottie, LottieAnimationData } from '@remotion/lottie';
import { 
  useCurrentFrame, 
  useVideoConfig, 
  delayRender,
  continueRender,
} from 'remotion';
import { safeInterpolate as interpolate, safeDuration, safeSpring as spring } from '../utils/safeInterpolate';
import { FALLBACK_ANIMATIONS, getIconKeys } from '../data/lottie-library';
import { sanitizeForLottiePlayer } from '../utils/premiumLottieLoader';

interface LottieIconsProps {
  sceneType: 'hook' | 'problem' | 'solution' | 'feature' | 'proof' | 'cta';
  position: 'left' | 'right' | 'top' | 'scattered';
  size?: number;
  staggerDelay?: number;
}

// Emoji fallbacks
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

/** Detect Lambda/serverless — CDN fetches hang there */
const isLambdaEnvironment = (): boolean => {
  try {
    return typeof process !== 'undefined' && (
      !!(process.env?.AWS_LAMBDA_FUNCTION_NAME) ||
      !!(process.env?.LAMBDA_TASK_ROOT) ||
      !!(process.env?.AWS_EXECUTION_ENV)
    );
  } catch {
    return false;
  }
};

/** fetch() with AbortController timeout */
const fetchWithTimeout = async (url: string, timeoutMs = 5000): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
};

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
  const continuedRef = useRef(false);

  const safelyContinue = () => {
    if (!continuedRef.current) {
      continuedRef.current = true;
      continueRender(handle);
    }
  };

  const iconKeys = getIconKeys(sceneType) || [];
  const iconUrls = Array.isArray(iconKeys) ? iconKeys.map(key => 
    FALLBACK_ANIMATIONS?.icons?.[key as keyof typeof FALLBACK_ANIMATIONS.icons] || 
    FALLBACK_ANIMATIONS?.icons?.star || ''
  ).filter(url => typeof url === 'string' && url.length > 0) : [];
  const emojiFallbacks = EMOJI_FALLBACKS[sceneType] || EMOJI_FALLBACKS.hook;

  useEffect(() => {
    let cancelled = false;

    // ── r34: Lambda shortcut — skip all CDN fetches, use emoji fallbacks ──
    if (isLambdaEnvironment()) {
      console.log('[LottieIcons] ⚡ Lambda detected — skipping CDN, using emoji fallbacks');
      setIcons(iconUrls.map(url => ({ url, animationData: null, error: true })));
      setLoaded(true);
      safelyContinue();
      return;
    }

    // ── r34: Global safety timer — force continue after 10s no matter what ──
    const safetyTimer = setTimeout(() => {
      if (!cancelled) {
        console.warn('[LottieIcons] ⏱️ Safety timer (10s) — forcing continueRender with fallbacks');
        setIcons(prev => prev.length > 0 ? prev : iconUrls.map(url => ({ url, animationData: null, error: true })));
        setLoaded(true);
        safelyContinue();
      }
    }, 10_000);

    const loadIcons = async () => {
      if (!iconUrls || iconUrls.length === 0) {
        if (!cancelled) {
          setIcons([]);
          setLoaded(true);
          safelyContinue();
        }
        return;
      }

      const loadedIcons: IconData[] = [];

      for (const url of iconUrls) {
        try {
          // r34: 5s fetch timeout via AbortController
          const response = await fetchWithTimeout(url, 5000);
          if (!response.ok) throw new Error('Failed to fetch');
          const data = await response.json();
          
          if (!cancelled) {
            const sanitized = sanitizeForLottiePlayer(data);
            if (sanitized) {
              loadedIcons.push({ url, animationData: sanitized, error: false });
            } else {
              loadedIcons.push({ url, animationData: null, error: true });
            }
          }
        } catch (err) {
          loadedIcons.push({ url, animationData: null, error: true });
        }
      }

      if (!cancelled) {
        setIcons(loadedIcons);
        setLoaded(true);
        safelyContinue();
      }
    };

    loadIcons();

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
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

  const safeDur = safeDuration(durationInFrames, 30);
  const exitStart = Math.min(Math.max(10, safeDur - 20), safeDur - 1);
  
  const exitOpacity = interpolate(
    frame,
    [exitStart, safeDur],
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

        const floatY = Math.sin((frame + i * 30) * 0.05) * 10;
        const floatX = Math.cos((frame + i * 20) * 0.03) * 5;
        const rotate = Math.sin((frame + i * 15) * 0.04) * 8;
        const pulse = 1 + Math.sin((frame + i * 10) * 0.08) * 0.05;

        const scale = (0.3 + 0.7 * Math.max(0, iconProgress)) * pulse;
        const opacity = Math.max(0, iconProgress);
        const translateY = (1 - Math.max(0, iconProgress)) * 50 + floatY;

        const itemStyle: React.CSSProperties = position === 'scattered'
          ? { position: 'absolute' as const, left: itemOffsets[i]?.x || 0, top: itemOffsets[i]?.y || 0 }
          : {};

        // Emoji fallback
        if (icon.error || !icon.animationData) {
          return (
            <div
              key={i}
              style={{
                ...itemStyle,
                fontSize: size * 0.9,
                opacity,
                transform: `translate(${floatX}px, ${translateY}px) scale(${scale}) rotate(${rotate}deg)`,
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
              transform: `translate(${floatX}px, ${translateY}px) scale(${scale}) rotate(${rotate}deg)`,
              filter: 'drop-shadow(0 6px 15px rgba(0,0,0,0.35))',
            }}
          >
            <Lottie
              animationData={icon.animationData}
              style={{ width: '100%', height: '100%' }}
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
