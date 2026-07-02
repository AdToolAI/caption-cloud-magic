import { useEffect, useRef, useState } from 'react';
import { getCachedPeaks, loadPeaks } from '@/lib/directors-cut/waveformCache';

interface WaveformDisplayProps {
  audioUrl: string;
  duration: number;
  color?: string;
  height?: number;
}

export function WaveformDisplay({
  audioUrl,
  duration,
  color = 'rgba(255,255,255,0.6)',
  height = 40,
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Warm-start from module-level cache so re-mounts are instant.
  const cachedInitial = getCachedPeaks(audioUrl);
  const [waveformData, setWaveformData] = useState<number[]>(cachedInitial ?? []);
  const [isLoading, setIsLoading] = useState(!cachedInitial);

  // Generate waveform data from audio (cached + in-flight-deduped)
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const cached = getCachedPeaks(audioUrl);
    if (cached) {
      setWaveformData(cached);
      setIsLoading(false);
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    setIsLoading(true);
    loadPeaks(audioUrl, { signal: controller.signal })
      .then((peaks) => {
        if (!cancelled) {
          setWaveformData(peaks);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          const mockData = Array.from({ length: 100 }, () => 0.2 + Math.random() * 0.8);
          setWaveformData(mockData);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [audioUrl]);

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveformData.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    const barWidth = rect.width / waveformData.length;
    const centerY = rect.height / 2;
    
    ctx.fillStyle = color;
    
    waveformData.forEach((value, index) => {
      const barHeight = value * rect.height * 0.8;
      const x = index * barWidth;
      const y = centerY - barHeight / 2;
      
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth - 1, barHeight, 1);
      ctx.fill();
    });
  }, [waveformData, color]);

  if (isLoading) {
    return (
      <div 
        className="w-full flex items-center justify-center"
        style={{ height }}
      >
        <div className="animate-pulse bg-white/20 rounded w-full h-1/2" />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ height }}
    />
  );
}
