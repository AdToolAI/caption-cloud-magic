import { useEffect, useRef, useState } from 'react';

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
  height = 40 
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Generate waveform data from audio (leak-safe: cancel + always close AudioContext)
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let audioContext: AudioContext | null = null;

    const generateWaveform = async () => {
      setIsLoading(true);

      try {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

        const response = await fetch(audioUrl, { signal: controller.signal });
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        if (cancelled) return;

        const channelData = audioBuffer.getChannelData(0);
        const samples = 100;
        const blockSize = Math.max(1, Math.floor(channelData.length / samples));
        const data: number[] = [];

        for (let i = 0; i < samples; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channelData[i * blockSize + j] || 0);
          }
          data.push(sum / blockSize);
        }

        const max = Math.max(...data) || 1;
        const normalized = data.map((d) => d / max);

        if (!cancelled) setWaveformData(normalized);
      } catch (error) {
        if (!cancelled) {
          const mockData = Array.from({ length: 100 }, () => 0.2 + Math.random() * 0.8);
          setWaveformData(mockData);
        }
      } finally {
        // Always release the AudioContext — browsers cap at ~6 open contexts.
        if (audioContext && audioContext.state !== 'closed') {
          try { await audioContext.close(); } catch { /* noop */ }
        }
        if (!cancelled) setIsLoading(false);
      }
    };

    generateWaveform();

    return () => {
      cancelled = true;
      controller.abort();
      if (audioContext && audioContext.state !== 'closed') {
        try { audioContext.close(); } catch { /* noop */ }
      }
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
