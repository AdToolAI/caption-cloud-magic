import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion';

export interface TextOverlayProps {
  id: string;
  text: string;
  animation: 'fadeIn' | 'scaleUp' | 'bounce' | 'typewriter' | 'highlight' | 'glitch';
  position: 'top' | 'center' | 'bottom' | 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight' | 'centerLeft' | 'centerRight' | 'custom';
  customPosition?: { x: number; y: number };
  startTime: number;
  endTime: number | null;
  style: {
    fontSize: 'sm' | 'md' | 'lg' | 'xl';
    color: string;
    backgroundColor: string;
    shadow: boolean;
    fontFamily: string;
  };
}

const POSITION_STYLES: Record<string, React.CSSProperties> = {
  top: { top: '10%', left: '50%', transform: 'translateX(-50%)' },
  center: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  bottom: { bottom: '10%', left: '50%', transform: 'translateX(-50%)' },
  bottomLeft: { bottom: '10%', left: '5%' },
  bottomRight: { bottom: '10%', right: '5%' },
  topLeft: { top: '10%', left: '5%' },
  topRight: { top: '10%', right: '5%' },
  centerLeft: { top: '50%', left: '5%', transform: 'translateY(-50%)' },
  centerRight: { top: '50%', right: '5%', transform: 'translateY(-50%)' },
};

const FONT_SIZES: Record<string, string> = {
  sm: '24px',
  md: '36px',
  lg: '48px',
  xl: '72px',
};

export const TextOverlayRenderer: React.FC<{ overlay: TextOverlayProps }> = ({ overlay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animation calculations
  const animationDuration = 20; // frames
  const progress = Math.min(frame / animationDuration, 1);

  // Position style
  const positionStyle: React.CSSProperties = overlay.position === 'custom' && overlay.customPosition
    ? { top: `${overlay.customPosition.y}%`, left: `${overlay.customPosition.x}%` }
    : POSITION_STYLES[overlay.position] || POSITION_STYLES.center;

  // Animation styles based on type
  let animationStyle: React.CSSProperties = {};
  let displayText = overlay.text;

  switch (overlay.animation) {
    case 'fadeIn': {
      const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
      const translateY = interpolate(frame, [0, 15], [20, 0], { extrapolateRight: 'clamp' });
      animationStyle = { opacity, transform: `translateY(${translateY}px)` };
      break;
    }
    case 'scaleUp': {
      const scale = spring({
        frame,
        fps,
        config: { damping: 20, mass: 0.5, stiffness: 100 },
      });
      const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
      animationStyle = { opacity, transform: `scale(${scale})` };
      break;
    }
    case 'bounce': {
      const translateY = interpolate(
        frame,
        [0, 12, 18, 24],
        [-50, 10, -5, 0],
        { extrapolateRight: 'clamp', easing: Easing.bezier(0.34, 1.56, 0.64, 1) }
      );
      const opacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
      animationStyle = { opacity, transform: `translateY(${translateY}px)` };
      break;
    }
    case 'typewriter': {
      const charsPerSecond = 15;
      const charsPerFrame = charsPerSecond / fps;
      const visibleChars = Math.floor(frame * charsPerFrame);
      displayText = overlay.text.substring(0, Math.min(visibleChars, overlay.text.length));
      animationStyle = { opacity: 1 };
      break;
    }
    case 'highlight': {
      const highlightWidth = interpolate(frame, [0, 20], [0, 100], { extrapolateRight: 'clamp' });
      animationStyle = {
        opacity: 1,
        backgroundImage: `linear-gradient(transparent 60%, rgba(255, 215, 0, 0.5) 60%)`,
        backgroundSize: `${highlightWidth}% 100%`,
        backgroundRepeat: 'no-repeat',
      };
      break;
    }
    case 'glitch': {
      const glitchOffset = Math.sin(frame * 0.5) * 3;
      const glitchOpacity = frame < 5 ? interpolate(frame, [0, 5], [0, 1]) : 1;
      animationStyle = {
        opacity: glitchOpacity,
        transform: `translateX(${glitchOffset}px)`,
        textShadow: `${-glitchOffset}px 0 #ff0000, ${glitchOffset}px 0 #00ffff`,
      };
      break;
    }
  }

  // Combine position transform with animation transform
  if (positionStyle.transform && animationStyle.transform) {
    animationStyle.transform = `${positionStyle.transform} ${animationStyle.transform}`;
    delete positionStyle.transform;
  }

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    fontSize: FONT_SIZES[overlay.style.fontSize],
    color: overlay.style.color,
    backgroundColor: overlay.style.backgroundColor !== 'transparent' ? overlay.style.backgroundColor : undefined,
    padding: overlay.style.backgroundColor !== 'transparent' ? '8px 16px' : undefined,
    borderRadius: overlay.style.backgroundColor !== 'transparent' ? '8px' : undefined,
    fontFamily: overlay.style.fontFamily || 'Inter',
    fontWeight: 'bold',
    textShadow: overlay.style.shadow ? '2px 2px 4px rgba(0,0,0,0.8)' : undefined,
    whiteSpace: 'nowrap',
    ...positionStyle,
    ...animationStyle,
  };

  return (
    <div style={baseStyle}>
      {displayText}
      {overlay.animation === 'typewriter' && displayText.length < overlay.text.length && (
        <span style={{ opacity: frame % 10 < 5 ? 1 : 0 }}>|</span>
      )}
    </div>
  );
};
