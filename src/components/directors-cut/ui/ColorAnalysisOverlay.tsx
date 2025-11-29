import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Palette } from 'lucide-react';
import { SceneAnalysis } from '@/types/directors-cut';

interface ColorAnalysisOverlayProps {
  scenes: SceneAnalysis[];
  duration: number;
  currentTime: number;
  height?: number;
}

// Generate dominant colors based on scene mood/description
const getMoodColors = (mood: string, description: string): string[] => {
  const moodColorMap: Record<string, string[]> = {
    'energetic': ['#FF6B6B', '#FFE66D', '#4ECDC4'],
    'action': ['#FF4757', '#2F3542', '#FFA502'],
    'dynamic': ['#A55EEA', '#4ECDC4', '#FF6B6B'],
    'dramatic': ['#2C3E50', '#E74C3C', '#F39C12'],
    'neutral': ['#95A5A6', '#BDC3C7', '#7F8C8D'],
    'calm': ['#74B9FF', '#81ECEC', '#DFE6E9'],
    'peaceful': ['#55EFC4', '#81ECEC', '#FFEAA7'],
    'serene': ['#A29BFE', '#DFE6E9', '#FFEAA7'],
    'warm': ['#FF7675', '#FDCB6E', '#E17055'],
    'cold': ['#74B9FF', '#0984E3', '#A29BFE'],
  };

  // Check for keywords in description
  const desc = description?.toLowerCase() || '';
  if (desc.includes('natur') || desc.includes('wald') || desc.includes('grün')) {
    return ['#27AE60', '#2ECC71', '#1ABC9C'];
  }
  if (desc.includes('sonnenuntergang') || desc.includes('sunset')) {
    return ['#F39C12', '#E74C3C', '#9B59B6'];
  }
  if (desc.includes('wasser') || desc.includes('meer') || desc.includes('ocean')) {
    return ['#3498DB', '#2980B9', '#1ABC9C'];
  }
  if (desc.includes('stadt') || desc.includes('urban') || desc.includes('city')) {
    return ['#34495E', '#95A5A6', '#F39C12'];
  }

  return moodColorMap[mood?.toLowerCase()] || moodColorMap['neutral'];
};

export function ColorAnalysisOverlay({ 
  scenes, 
  duration, 
  currentTime,
  height = 50 
}: ColorAnalysisOverlayProps) {
  
  const sceneColors = useMemo(() => {
    return scenes.map(scene => ({
      ...scene,
      colors: getMoodColors(scene.mood, scene.description),
    }));
  }, [scenes]);

  const playheadPercent = (currentTime / duration) * 100;

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
        <Palette className="w-3 h-3 text-purple-500" />
        <span className="text-[10px] font-medium text-muted-foreground">Farbanalyse</span>
      </div>

      {/* Color Bars Container */}
      <div className="absolute inset-0 flex pt-5">
        {sceneColors.map((scene, idx) => {
          const widthPercent = ((scene.end_time - scene.start_time) / duration) * 100;
          
          return (
            <div 
              key={scene.id}
              className="h-full flex flex-col gap-0.5 px-px"
              style={{ width: `${widthPercent}%` }}
            >
              {scene.colors.map((color, colorIdx) => (
                <motion.div
                  key={colorIdx}
                  className="flex-1 rounded-sm"
                  style={{ backgroundColor: color }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: idx * 0.05 + colorIdx * 0.02 }}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Playhead */}
      <div 
        className="absolute top-0 bottom-0 w-0.5 bg-primary z-20"
        style={{ left: `${playheadPercent}%` }}
      />

      {/* Current Scene Color Preview */}
      {(() => {
        const currentScene = sceneColors.find(
          s => currentTime >= s.start_time && currentTime < s.end_time
        );
        
        if (!currentScene) return null;

        return (
          <div className="absolute top-1 right-2 flex items-center gap-1 z-10">
            <span className="text-[9px] text-muted-foreground mr-1">Dominant:</span>
            {currentScene.colors.map((color, idx) => (
              <div
                key={idx}
                className="w-3 h-3 rounded-full border border-white/30 shadow-sm"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        );
      })()}
    </motion.div>
  );
}
