import { useMemo } from 'react';
import { sampleAutomation, type AutomationPoint, type SpeechInterval } from '@/lib/duckingEnvelope';

interface DuckingEnvelopeOverlayProps {
  automation: AutomationPoint[];
  intervals: SpeechInterval[];
  duration: number;
  currentTime: number;
  height?: number;
  className?: string;
}

/**
 * SVG overlay that visualises the music-track gain automation
 * (yellow line) plus speech-active regions (cyan tint).
 *
 * Designed to sit on top of a music waveform. 100% width, fixed height.
 */
export function DuckingEnvelopeOverlay({
  automation,
  intervals,
  duration,
  currentTime,
  height = 80,
  className,
}: DuckingEnvelopeOverlayProps) {
  const samples = useMemo(
    () => (duration > 0 ? sampleAutomation(automation, duration, 600) : []),
    [automation, duration],
  );

  const path = useMemo(() => {
    if (samples.length === 0 || duration <= 0) return '';
    const toX = (t: number) => (t / duration) * 100;
    const toY = (g: number) => height - g * height; // gain 1 → top, 0 → bottom

    let d = `M ${toX(samples[0].t).toFixed(3)} ${toY(samples[0].g).toFixed(2)}`;
    for (let i = 1; i < samples.length; i++) {
      d += ` L ${toX(samples[i].t).toFixed(3)} ${toY(samples[i].g).toFixed(2)}`;
    }
    return d;
  }, [samples, duration, height]);

  const playheadX = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <svg
      className={className}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: `${height}px`, display: 'block' }}
    >
      {/* Speech regions */}
      {intervals.map((iv, i) => {
        const x = (iv.start / duration) * 100;
        const w = ((iv.end - iv.start) / duration) * 100;
        return (
          <rect
            key={i}
            x={x}
            y={0}
            width={Math.max(0.1, w)}
            height={height}
            fill="hsl(var(--primary) / 0.12)"
          />
        );
      })}

      {/* Reference line at full gain */}
      <line
        x1={0}
        y1={1}
        x2={100}
        y2={1}
        stroke="hsl(var(--muted-foreground) / 0.25)"
        strokeWidth={0.5}
        strokeDasharray="1 1"
        vectorEffect="non-scaling-stroke"
      />

      {/* Automation curve */}
      {path && (
        <>
          <path
            d={`${path} L 100 ${height} L 0 ${height} Z`}
            fill="hsl(var(--primary) / 0.15)"
          />
          <path
            d={path}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}

      {/* Playhead */}
      {duration > 0 && (
        <line
          x1={playheadX}
          y1={0}
          x2={playheadX}
          y2={height}
          stroke="hsl(var(--foreground))"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
