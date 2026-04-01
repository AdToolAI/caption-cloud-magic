import React, { useMemo, useState, useEffect, useRef } from 'react';

interface TextOverlayData {
  id: string;
  text: string;
  animation: 'fadeIn' | 'scaleUp' | 'bounce' | 'typewriter' | 'highlight' | 'glitch';
  position: string;
  customPosition?: { x: number; y: number };
  startTime: number;
  style: {
    fontSize?: string;
    color?: string;
    backgroundColor?: string;
    shadow?: boolean;
    fontFamily?: string;
    fontWeight?: string;
  };
}

interface NativeTextOverlayRendererProps {
  overlay: TextOverlayData;
  displayTime: number;
}

const FONT_SIZE_MAP: Record<string, string> = {
  sm: '24px',
  md: '36px',
  lg: '48px',
  xl: '72px',
};

// Inject keyframes once
const STYLE_ID = 'native-text-overlay-keyframes';
function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes nto-fadeIn {
      0% { opacity: 0; transform: translateY(20px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes nto-scaleUp {
      0% { opacity: 0; transform: scale(0.3); }
      60% { opacity: 1; transform: scale(1.08); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes nto-bounce {
      0% { opacity: 0; transform: translateY(-50px); }
      40% { opacity: 1; transform: translateY(0); }
      55% { transform: translateY(-12px); }
      70% { transform: translateY(0); }
      85% { transform: translateY(-5px); }
      100% { transform: translateY(0); }
    }
    @keyframes nto-highlight {
      0% { background-size: 0% 100%; }
      100% { background-size: 100% 100%; }
    }
    @keyframes nto-glitch {
      0% { opacity: 0; transform: translateX(0); text-shadow: none; }
      10% { opacity: 1; transform: translateX(-3px); text-shadow: -3px 0 #ff0000, 3px 0 #00ffff; }
      20% { transform: translateX(3px); text-shadow: 3px 0 #ff0000, -3px 0 #00ffff; }
      30% { transform: translateX(-2px); text-shadow: -2px 0 #ff0000, 2px 0 #00ffff; }
      40% { transform: translateX(2px); text-shadow: 2px 0 #ff0000, -2px 0 #00ffff; }
      50% { transform: translateX(-1px); text-shadow: -1px 0 #ff0000, 1px 0 #00ffff; }
      60% { transform: translateX(1px); text-shadow: 1px 0 #ff0000, -1px 0 #00ffff; }
      70% { transform: translateX(0); text-shadow: none; }
      100% { transform: translateX(0); text-shadow: none; }
    }
  `;
  document.head.appendChild(style);
}

const ANIM_CSS: Record<string, string> = {
  fadeIn: 'nto-fadeIn 0.6s ease-out forwards',
  scaleUp: 'nto-scaleUp 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
  bounce: 'nto-bounce 0.7s ease-out forwards',
  highlight: 'nto-highlight 0.6s ease-out forwards',
  glitch: 'nto-glitch 0.8s ease-out forwards',
};

export const NativeTextOverlayRenderer: React.FC<NativeTextOverlayRendererProps> = ({ overlay }) => {
  ensureKeyframes();

  // Position
  const positionStyle = useMemo((): React.CSSProperties => {
    if (overlay.customPosition?.x != null && overlay.customPosition?.y != null) {
      return {
        top: `${overlay.customPosition.y}%`,
        left: `${overlay.customPosition.x}%`,
        transform: 'translate(-50%, -50%)',
      };
    }
    switch (overlay.position) {
      case 'top': return { top: '10%', left: '50%', transform: 'translateX(-50%)' };
      case 'bottom': return { bottom: '10%', left: '50%', transform: 'translateX(-50%)' };
      case 'bottomLeft': return { bottom: '10%', left: '5%' };
      case 'bottomRight': return { bottom: '10%', right: '5%' };
      case 'topLeft': return { top: '10%', left: '5%' };
      case 'topRight': return { top: '10%', right: '5%' };
      case 'centerLeft': return { top: '50%', left: '5%', transform: 'translateY(-50%)' };
      case 'centerRight': return { top: '50%', right: '5%', transform: 'translateY(-50%)' };
      case 'center':
      default: return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }
  }, [overlay.position, overlay.customPosition?.x, overlay.customPosition?.y]);

  // Typewriter: local RAF-based timer
  const [twText, setTwText] = useState('');
  const rafRef = useRef<number>(0);
  const isTypewriter = overlay.animation === 'typewriter';

  useEffect(() => {
    if (!isTypewriter) return;
    const startMs = performance.now();
    const charsPerSecond = 15;
    const fullText = overlay.text;
    const tick = (now: number) => {
      const elapsed = (now - startMs) / 1000;
      const count = Math.min(Math.floor(elapsed * charsPerSecond), fullText.length);
      setTwText(fullText.substring(0, count));
      if (count < fullText.length) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isTypewriter, overlay.text]);

  const displayText = isTypewriter ? twText : overlay.text;

  const fontSize = FONT_SIZE_MAP[overlay.style?.fontSize || ''] || overlay.style?.fontSize || '36px';
  const bgColor = overlay.style?.backgroundColor;

  // Build animation style
  let animStyle: React.CSSProperties = {};
  if (isTypewriter) {
    animStyle = { opacity: 1 };
  } else {
    const animCss = ANIM_CSS[overlay.animation];
    if (animCss) {
      animStyle = {
        animation: animCss,
        opacity: overlay.animation === 'highlight' ? 1 : 0, // start invisible for most, visible for highlight
      };
    } else {
      animStyle = { opacity: 1 };
    }
  }

  // Highlight needs background-image
  if (overlay.animation === 'highlight') {
    animStyle.backgroundImage = 'linear-gradient(transparent 60%, rgba(255, 215, 0, 0.5) 60%)';
    animStyle.backgroundSize = '0% 100%';
    animStyle.backgroundRepeat = 'no-repeat';
  }

  const style: React.CSSProperties = {
    position: 'absolute',
    ...positionStyle,
    ...animStyle,
    fontSize,
    fontWeight: (overlay.style as any)?.fontWeight || 'bold',
    color: overlay.style?.color || '#ffffff',
    fontFamily: overlay.style?.fontFamily || 'sans-serif',
    textShadow: overlay.style?.shadow !== false ? '2px 2px 8px rgba(0,0,0,0.8)' : undefined,
    backgroundColor: bgColor && bgColor !== 'transparent' ? bgColor : undefined,
    padding: bgColor && bgColor !== 'transparent' ? '8px 16px' : undefined,
    borderRadius: bgColor && bgColor !== 'transparent' ? '8px' : undefined,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: 15,
  };

  return (
    <div style={style}>
      {displayText}
      {isTypewriter && twText.length < overlay.text.length && (
        <span style={{ animation: 'none', opacity: 1 }}>|</span>
      )}
    </div>
  );
};
