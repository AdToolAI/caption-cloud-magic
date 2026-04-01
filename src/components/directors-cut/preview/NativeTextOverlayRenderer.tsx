import React, { useMemo } from 'react';

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

export const NativeTextOverlayRenderer: React.FC<NativeTextOverlayRendererProps> = ({ overlay, displayTime }) => {
  const elapsed = Math.max(0, displayTime - overlay.startTime);

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

  // Animation
  const animDuration = 0.5; // seconds
  const progress = Math.min(elapsed / animDuration, 1);

  let animStyle: React.CSSProperties = {};
  let displayText = overlay.text;

  switch (overlay.animation) {
    case 'fadeIn': {
      animStyle = {
        opacity: progress,
        transform: `translateY(${(1 - progress) * 20}px)`,
      };
      break;
    }
    case 'scaleUp': {
      const scale = progress < 1
        ? 0.3 + progress * 0.85 - Math.sin(progress * Math.PI) * 0.15
        : 1;
      animStyle = {
        opacity: Math.min(progress * 2, 1),
        transform: `scale(${scale})`,
      };
      break;
    }
    case 'bounce': {
      let ty = 0;
      if (progress < 0.4) {
        ty = -50 * (1 - progress / 0.4);
      } else if (progress < 0.6) {
        ty = 10 * ((progress - 0.4) / 0.2);
      } else if (progress < 0.8) {
        ty = 10 - 15 * ((progress - 0.6) / 0.2);
      } else {
        ty = -5 * (1 - (progress - 0.8) / 0.2);
      }
      animStyle = {
        opacity: Math.min(progress * 3, 1),
        transform: `translateY(${ty}px)`,
      };
      break;
    }
    case 'typewriter': {
      const charsPerSecond = 15;
      const visibleChars = Math.floor(elapsed * charsPerSecond);
      displayText = overlay.text.substring(0, Math.min(visibleChars, overlay.text.length));
      animStyle = { opacity: 1 };
      break;
    }
    case 'highlight': {
      const highlightWidth = Math.min(elapsed / animDuration * 100, 100);
      animStyle = {
        opacity: 1,
        backgroundImage: 'linear-gradient(transparent 60%, rgba(255, 215, 0, 0.5) 60%)',
        backgroundSize: `${highlightWidth}% 100%`,
        backgroundRepeat: 'no-repeat',
      };
      break;
    }
    case 'glitch': {
      const glitchOffset = Math.sin(elapsed * 15) * 3;
      animStyle = {
        opacity: Math.min(elapsed * 4, 1),
        transform: `translateX(${glitchOffset}px)`,
        textShadow: `${-glitchOffset}px 0 #ff0000, ${glitchOffset}px 0 #00ffff`,
      };
      break;
    }
    default:
      animStyle = { opacity: 1 };
  }

  // Merge transforms
  const posTransform = positionStyle.transform || '';
  const animTransform = animStyle.transform || '';
  const mergedTransform = [posTransform, animTransform].filter(Boolean).join(' ') || undefined;

  const fontSize = FONT_SIZE_MAP[overlay.style?.fontSize || ''] || overlay.style?.fontSize || '36px';
  const bgColor = overlay.style?.backgroundColor;

  const style: React.CSSProperties = {
    position: 'absolute',
    ...positionStyle,
    ...animStyle,
    transform: mergedTransform,
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
      {overlay.animation === 'typewriter' && displayText.length < overlay.text.length && (
        <span style={{ opacity: Math.floor(elapsed * 10) % 2 === 0 ? 1 : 0 }}>|</span>
      )}
    </div>
  );
};
