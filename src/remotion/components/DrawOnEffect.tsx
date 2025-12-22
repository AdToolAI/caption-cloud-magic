import React from 'react';
import { 
  useCurrentFrame, 
  useVideoConfig, 
  interpolate, 
  spring,
  AbsoluteFill,
} from 'remotion';

interface DrawOnEffectProps {
  /** Type of drawing effect */
  type: 'underline' | 'circle' | 'arrow' | 'highlight' | 'checkmark' | 'cross' | 'bracket';
  /** Position of the effect */
  x: number;
  y: number;
  /** Width of the effect */
  width?: number;
  /** Height of the effect */
  height?: number;
  /** Color of the drawing */
  color?: string;
  /** Stroke width */
  strokeWidth?: number;
  /** Delay before animation starts (in frames) */
  delay?: number;
  /** Duration of the drawing animation (in frames) */
  drawDuration?: number;
}

export const DrawOnEffect: React.FC<DrawOnEffectProps> = ({
  type,
  x,
  y,
  width = 200,
  height = 50,
  color = '#F5C76A',
  strokeWidth = 4,
  delay = 0,
  drawDuration = 20,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  
  // ✅ Validate durationInFrames to prevent "Invalid array length" error
  const safeDuration = Math.max(30, Number(durationInFrames) || 30);
  const exitStart = Math.max(10, safeDuration - 15);
  
  // Drawing progress with delay
  const drawProgress = interpolate(
    frame - delay,
    [0, drawDuration],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  // Exit animation with safe range
  const exitOpacity = interpolate(
    frame,
    [exitStart, safeDuration],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  // Hand-drawn wobble effect for more organic feel
  const wobble = (seed: number) => Math.sin(seed * 0.5) * 2;
  
  // Entry spring for pop-in effect
  const entrySpring = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  const getPathData = (): { path: string; length: number } => {
    switch (type) {
      case 'underline':
        // Wavy underline for hand-drawn effect
        return {
          path: `M 0 ${height / 2} 
                 Q ${width * 0.25} ${height / 2 + wobble(1)} 
                   ${width * 0.5} ${height / 2 + wobble(2)} 
                 T ${width} ${height / 2 + wobble(3)}`,
          length: width * 1.1,
        };
        
      case 'circle':
        // Imperfect circle for hand-drawn look
        const rx = width / 2;
        const ry = height / 2;
        return {
          path: `M ${rx * 2} ${ry} 
                 Q ${rx * 2 + wobble(1)} ${ry * 0.3} ${rx} 0
                 Q ${wobble(2)} ${wobble(3)} 0 ${ry}
                 Q ${wobble(4)} ${ry * 1.7} ${rx} ${ry * 2}
                 Q ${rx * 2 + wobble(5)} ${ry * 2 - wobble(6)} ${rx * 2} ${ry}`,
          length: Math.PI * 2 * Math.max(rx, ry),
        };
        
      case 'arrow':
        return {
          path: `M 0 ${height / 2} 
                 L ${width * 0.8} ${height / 2} 
                 M ${width * 0.6} ${height * 0.2} 
                 L ${width * 0.8} ${height / 2} 
                 L ${width * 0.6} ${height * 0.8}`,
          length: width * 1.5,
        };
        
      case 'highlight':
        return {
          path: `M 0 ${height * 0.3} 
                 Q ${width * 0.5} ${height * 0.2 + wobble(1)} ${width} ${height * 0.3}
                 L ${width} ${height * 0.7}
                 Q ${width * 0.5} ${height * 0.8 + wobble(2)} 0 ${height * 0.7}
                 Z`,
          length: width * 2 + height * 2,
        };
        
      case 'checkmark':
        return {
          path: `M ${width * 0.15} ${height * 0.5} 
                 L ${width * 0.4} ${height * 0.8} 
                 L ${width * 0.85} ${height * 0.2}`,
          length: width * 1.2,
        };
        
      case 'cross':
        return {
          path: `M ${width * 0.2} ${height * 0.2} L ${width * 0.8} ${height * 0.8}
                 M ${width * 0.8} ${height * 0.2} L ${width * 0.2} ${height * 0.8}`,
          length: width * 2,
        };
        
      case 'bracket':
        return {
          path: `M ${width * 0.3} 0 
                 Q 0 0 0 ${height * 0.2}
                 L 0 ${height * 0.8}
                 Q 0 ${height} ${width * 0.3} ${height}`,
          length: height * 1.5,
        };
        
      default:
        return { path: '', length: 0 };
    }
  };

  const { path, length } = getPathData();
  
  if (drawProgress <= 0) return null;

  // Highlight uses fill instead of stroke
  if (type === 'highlight') {
    return (
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width,
          height,
          opacity: exitOpacity * Math.max(0, entrySpring) * 0.4,
          pointerEvents: 'none',
          zIndex: 80,
        }}
      >
        <svg width={width} height={height} style={{ overflow: 'visible' }}>
          <path
            d={path}
            fill={color}
            style={{
              clipPath: `inset(0 ${100 - drawProgress * 100}% 0 0)`,
            }}
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        opacity: exitOpacity * Math.max(0, entrySpring),
        pointerEvents: 'none',
        zIndex: 80,
      }}
    >
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - drawProgress)}
          style={{
            filter: `drop-shadow(0 2px 4px ${color}66)`,
          }}
        />
      </svg>
    </div>
  );
};

// Preset drawing effects for common use cases
export const UnderlineEffect: React.FC<Omit<DrawOnEffectProps, 'type'>> = (props) => (
  <DrawOnEffect type="underline" {...props} />
);

export const CircleEffect: React.FC<Omit<DrawOnEffectProps, 'type'>> = (props) => (
  <DrawOnEffect type="circle" {...props} />
);

export const ArrowEffect: React.FC<Omit<DrawOnEffectProps, 'type'>> = (props) => (
  <DrawOnEffect type="arrow" {...props} />
);

export const HighlightEffect: React.FC<Omit<DrawOnEffectProps, 'type'>> = (props) => (
  <DrawOnEffect type="highlight" {...props} />
);

export const CheckmarkEffect: React.FC<Omit<DrawOnEffectProps, 'type'>> = (props) => (
  <DrawOnEffect type="checkmark" {...props} />
);

export default DrawOnEffect;
