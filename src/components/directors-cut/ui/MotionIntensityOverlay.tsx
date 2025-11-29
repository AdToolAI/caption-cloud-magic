import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import { SceneAnalysis } from '@/types/directors-cut';

interface MotionIntensityOverlayProps {
  scenes: SceneAnalysis[];
  duration: number;
  currentTime: number;
  height?: number;
}

export function MotionIntensityOverlay({ 
  scenes, 
  duration, 
  currentTime,
  height = 40 
}: MotionIntensityOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Generate motion intensity data based on scene moods
  const getMotionIntensity = (mood: string): number => {
    const intensityMap: Record<string, number> = {
      'energetic': 0.9,
      'action': 0.95,
      'dynamic': 0.85,
      'dramatic': 0.7,
      'neutral': 0.5,
      'calm': 0.3,
      'peaceful': 0.2,
      'serene': 0.15,
    };
    return intensityMap[mood?.toLowerCase()] ?? 0.5;
  };

  // Draw motion intensity gradient
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || scenes.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const canvasHeight = canvas.height;
    const playheadPosition = (currentTime / duration) * width;

    // Clear canvas
    ctx.clearRect(0, 0, width, canvasHeight);

    // Draw motion intensity for each scene
    scenes.forEach((scene) => {
      const startX = (scene.start_time / duration) * width;
      const endX = (scene.end_time / duration) * width;
      const sceneWidth = endX - startX;
      const intensity = getMotionIntensity(scene.mood);

      // Create gradient based on intensity
      const gradient = ctx.createLinearGradient(startX, 0, startX, canvasHeight);
      
      // Color mapping: low intensity = blue/green, high intensity = orange/red
      if (intensity > 0.7) {
        gradient.addColorStop(0, `hsla(15, 90%, 55%, ${intensity})`);
        gradient.addColorStop(1, `hsla(30, 85%, 50%, ${intensity * 0.6})`);
      } else if (intensity > 0.4) {
        gradient.addColorStop(0, `hsla(45, 80%, 55%, ${intensity})`);
        gradient.addColorStop(1, `hsla(60, 75%, 50%, ${intensity * 0.6})`);
      } else {
        gradient.addColorStop(0, `hsla(180, 70%, 50%, ${intensity + 0.3})`);
        gradient.addColorStop(1, `hsla(200, 65%, 45%, ${intensity * 0.6 + 0.2})`);
      }

      ctx.fillStyle = gradient;
      ctx.fillRect(startX, 0, sceneWidth, canvasHeight);

      // Add subtle border between scenes
      ctx.strokeStyle = 'hsla(var(--border) / 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(endX, 0);
      ctx.lineTo(endX, canvasHeight);
      ctx.stroke();
    });

    // Draw intensity wave overlay
    ctx.strokeStyle = 'hsla(var(--foreground) / 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    scenes.forEach((scene, idx) => {
      const startX = (scene.start_time / duration) * width;
      const endX = (scene.end_time / duration) * width;
      const intensity = getMotionIntensity(scene.mood);
      const y = canvasHeight - (intensity * canvasHeight * 0.8) - 4;
      
      if (idx === 0) {
        ctx.moveTo(startX, y);
      }
      ctx.lineTo(startX, y);
      ctx.lineTo(endX, y);
    });
    ctx.stroke();

    // Draw playhead
    ctx.fillStyle = 'hsl(var(--primary))';
    ctx.fillRect(playheadPosition - 1, 0, 2, canvasHeight);

  }, [scenes, currentTime, duration]);

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
        <Activity className="w-3 h-3 text-orange-500" />
        <span className="text-[10px] font-medium text-muted-foreground">Motion Intensity</span>
      </div>

      {/* Legend */}
      <div className="absolute top-1 right-2 flex items-center gap-2 z-10">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-cyan-500" />
          <span className="text-[9px] text-muted-foreground">Ruhig</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className="text-[9px] text-muted-foreground">Mittel</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-orange-500" />
          <span className="text-[9px] text-muted-foreground">Intensiv</span>
        </div>
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
