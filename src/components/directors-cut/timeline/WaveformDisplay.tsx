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

  // Generate waveform data from audio
  useEffect(() => {
    const generateWaveform = async () => {
      setIsLoading(true);
      
      try {
        // Create audio context
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // Fetch and decode audio
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Get audio data
        const channelData = audioBuffer.getChannelData(0);
        const samples = 100; // Number of bars to display
        const blockSize = Math.floor(channelData.length / samples);
        const data: number[] = [];
        
        for (let i = 0; i < samples; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channelData[i * blockSize + j]);
          }
          data.push(sum / blockSize);
        }
        
        // Normalize
        const max = Math.max(...data);
        const normalized = data.map(d => d / max);
        
        setWaveformData(normalized);
        audioContext.close();
      } catch (error) {
        // Generate mock waveform if audio can't be loaded
        const mockData = Array.from({ length: 100 }, () => 
          0.2 + Math.random() * 0.8
        );
        setWaveformData(mockData);
      } finally {
        setIsLoading(false);
      }
    };
    
    generateWaveform();
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
