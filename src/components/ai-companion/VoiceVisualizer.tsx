import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface VoiceVisualizerProps {
  isActive: boolean;
  mode: 'listening' | 'speaking' | 'idle';
  className?: string;
}

export function VoiceVisualizer({ isActive, mode, className }: VoiceVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bars = 32;
    const barWidth = canvas.width / bars;
    
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      for (let i = 0; i < bars; i++) {
        // Generate wave pattern based on mode
        let height: number;
        
        if (!isActive || mode === 'idle') {
          // Subtle ambient animation
          height = Math.sin(Date.now() / 500 + i * 0.3) * 5 + 8;
        } else if (mode === 'listening') {
          // More active listening pattern
          height = Math.sin(Date.now() / 100 + i * 0.5) * 15 + 
                   Math.cos(Date.now() / 150 + i * 0.3) * 10 + 20;
        } else {
          // Speaking pattern - more pronounced
          height = Math.sin(Date.now() / 80 + i * 0.4) * 25 + 
                   Math.cos(Date.now() / 120 + i * 0.6) * 15 + 30;
        }
        
        const x = i * barWidth + barWidth / 4;
        const y = (canvas.height - height) / 2;
        
        // Color based on mode
        let gradient;
        if (mode === 'listening') {
          gradient = ctx.createLinearGradient(x, y, x, y + height);
          gradient.addColorStop(0, 'hsl(var(--primary))');
          gradient.addColorStop(1, 'hsl(var(--primary) / 0.3)');
        } else if (mode === 'speaking') {
          gradient = ctx.createLinearGradient(x, y, x, y + height);
          gradient.addColorStop(0, 'hsl(45, 93%, 69%)'); // Gold
          gradient.addColorStop(1, 'hsl(45, 93%, 69% / 0.3)');
        } else {
          gradient = ctx.createLinearGradient(x, y, x, y + height);
          gradient.addColorStop(0, 'hsl(var(--muted-foreground) / 0.5)');
          gradient.addColorStop(1, 'hsl(var(--muted-foreground) / 0.1)');
        }
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth / 2, height, 2);
        ctx.fill();
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, mode]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn("relative", className)}
    >
      <canvas
        ref={canvasRef}
        width={200}
        height={60}
        className="w-full h-full"
      />
      
      {/* Glow effect */}
      {isActive && mode !== 'idle' && (
        <motion.div
          className={cn(
            "absolute inset-0 blur-xl -z-10 rounded-full",
            mode === 'listening' ? "bg-primary/20" : "bg-[hsl(45,93%,69%)]/20"
          )}
          animate={{ 
            opacity: [0.3, 0.6, 0.3],
            scale: [1, 1.1, 1]
          }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}
