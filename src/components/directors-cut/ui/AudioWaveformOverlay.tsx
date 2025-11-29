import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Volume2 } from 'lucide-react';

interface AudioWaveformOverlayProps {
  videoUrl: string;
  duration: number;
  currentTime: number;
  height?: number;
}

export function AudioWaveformOverlay({ 
  videoUrl, 
  duration, 
  currentTime,
  height = 60 
}: AudioWaveformOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Generate mock waveform data (in production, this would analyze actual audio)
  useEffect(() => {
    const generateWaveform = () => {
      const samples = 200;
      const data: number[] = [];
      
      for (let i = 0; i < samples; i++) {
        // Create realistic-looking waveform with varying intensity
        const baseAmplitude = 0.3 + Math.random() * 0.4;
        const variation = Math.sin(i * 0.1) * 0.2;
        const noise = (Math.random() - 0.5) * 0.3;
        data.push(Math.max(0.1, Math.min(1, baseAmplitude + variation + noise)));
      }
      
      setWaveformData(data);
      setIsLoading(false);
    };

    generateWaveform();
  }, [videoUrl]);

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveformData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const canvasHeight = canvas.height;
    const barWidth = width / waveformData.length;
    const playheadPosition = (currentTime / duration) * width;

    // Clear canvas
    ctx.clearRect(0, 0, width, canvasHeight);

    // Draw waveform bars
    waveformData.forEach((amplitude, index) => {
      const x = index * barWidth;
      const barHeight = amplitude * (canvasHeight - 10);
      const y = (canvasHeight - barHeight) / 2;
      
      // Color based on playhead position
      const isPast = x < playheadPosition;
      
      // Gradient from primary to muted
      if (isPast) {
        ctx.fillStyle = 'hsl(var(--primary))';
      } else {
        ctx.fillStyle = 'hsl(var(--muted-foreground) / 0.4)';
      }
      
      // Draw bar with rounded corners
      const radius = Math.min(barWidth / 2, 2);
      ctx.beginPath();
      ctx.roundRect(x + 1, y, barWidth - 2, barHeight, radius);
      ctx.fill();
    });

    // Draw playhead
    ctx.fillStyle = 'hsl(var(--primary))';
    ctx.fillRect(playheadPosition - 1, 0, 2, canvasHeight);

  }, [waveformData, currentTime, duration]);

  if (isLoading) {
    return (
      <div 
        className="w-full flex items-center justify-center bg-muted/30 rounded-lg"
        style={{ height }}
      >
        <span className="text-xs text-muted-foreground">Lade Audio...</span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="relative w-full rounded-lg overflow-hidden bg-background/50 backdrop-blur-sm border border-border/50"
      style={{ height }}
    >
      {/* Label */}
      <div className="absolute top-1 left-2 flex items-center gap-1 z-10">
        <Volume2 className="w-3 h-3 text-primary" />
        <span className="text-[10px] font-medium text-muted-foreground">Audio Waveform</span>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={800}
        height={height}
        className="w-full h-full"
      />
    </motion.div>
  );
}
