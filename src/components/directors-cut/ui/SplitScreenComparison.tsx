import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SplitSquareHorizontal, Eye, EyeOff, GripVertical, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SplitScreenComparisonProps {
  originalVideoUrl: string;
  editedVideoUrl?: string;
  isActive: boolean;
  onToggle: () => void;
}

export function SplitScreenComparison({
  originalVideoUrl,
  editedVideoUrl,
  isActive,
  onToggle
}: SplitScreenComparisonProps) {
  const [splitPosition, setSplitPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const originalVideoRef = useRef<HTMLVideoElement>(null);
  const editedVideoRef = useRef<HTMLVideoElement>(null);

  // Sync video playback
  useEffect(() => {
    if (!isActive) return;
    
    const original = originalVideoRef.current;
    const edited = editedVideoRef.current;
    
    if (!original || !edited) return;

    const syncTime = () => {
      if (Math.abs(original.currentTime - edited.currentTime) > 0.1) {
        edited.currentTime = original.currentTime;
      }
    };

    original.addEventListener('timeupdate', syncTime);
    return () => original.removeEventListener('timeupdate', syncTime);
  }, [isActive]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(10, Math.min(90, (x / rect.width) * 100));
    setSplitPosition(percentage);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const togglePlayback = () => {
    const original = originalVideoRef.current;
    const edited = editedVideoRef.current;
    
    if (!original || !edited) return;

    if (isPlaying) {
      original.pause();
      edited.pause();
    } else {
      original.play();
      edited.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Use same video for both if no edited version
  const effectiveEditedUrl = editedVideoUrl || originalVideoUrl;

  return (
    <div className="space-y-3">
      {/* Toggle Button */}
      <Button
        variant={isActive ? "default" : "outline"}
        size="sm"
        onClick={onToggle}
        className={cn(
          "gap-2 transition-all duration-300",
          isActive && "bg-gradient-to-r from-purple-500 to-pink-500 border-0"
        )}
      >
        <SplitSquareHorizontal className="h-4 w-4" />
        Split-Screen
        {isActive ? <EyeOff className="h-3 w-3 ml-1" /> : <Eye className="h-3 w-3 ml-1" />}
      </Button>

      {/* Split Screen View */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div
              ref={containerRef}
              className="relative rounded-xl overflow-hidden backdrop-blur-xl bg-black/40 border border-white/10"
              style={{ aspectRatio: '16/9' }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Original Video (Left Side) */}
              <div 
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - splitPosition}% 0 0)` }}
              >
                <video
                  ref={originalVideoRef}
                  src={originalVideoUrl}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  playsInline
                />
                {/* Original Label */}
                <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm border border-white/20">
                  <span className="text-xs font-medium text-white/90">Original</span>
                </div>
              </div>

              {/* Edited Video (Right Side) */}
              <div 
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 0 0 ${splitPosition}%)` }}
              >
                <video
                  ref={editedVideoRef}
                  src={effectiveEditedUrl}
                  className="w-full h-full object-cover"
                  style={{
                    filter: 'saturate(1.2) contrast(1.1) brightness(1.05)'
                  }}
                  muted
                  loop
                  playsInline
                />
                {/* Edited Label */}
                <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-gradient-to-r from-purple-500/60 to-pink-500/60 backdrop-blur-sm border border-white/20">
                  <span className="text-xs font-medium text-white">Bearbeitet</span>
                </div>
              </div>

              {/* Draggable Divider */}
              <div
                className={cn(
                  "absolute top-0 bottom-0 w-1 cursor-ew-resize z-10 transition-colors",
                  isDragging ? "bg-white" : "bg-white/60 hover:bg-white"
                )}
                style={{ left: `${splitPosition}%`, transform: 'translateX(-50%)' }}
                onMouseDown={handleMouseDown}
              >
                {/* Drag Handle */}
                <div className={cn(
                  "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                  "w-8 h-12 rounded-full flex items-center justify-center",
                  "bg-black/60 backdrop-blur-sm border border-white/30",
                  "transition-transform",
                  isDragging && "scale-110"
                )}>
                  <GripVertical className="h-5 w-5 text-white" />
                </div>
              </div>

              {/* Play/Pause Button */}
              <button
                onClick={togglePlayback}
                className={cn(
                  "absolute bottom-3 left-1/2 -translate-x-1/2",
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  "bg-black/60 backdrop-blur-sm border border-white/30",
                  "hover:bg-black/80 transition-colors"
                )}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4 text-white" />
                ) : (
                  <Play className="h-4 w-4 text-white ml-0.5" />
                )}
              </button>

              {/* Position Indicator */}
              <div className="absolute bottom-3 right-3 px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm">
                <span className="text-xs font-mono text-white/70">
                  {Math.round(splitPosition)}% / {Math.round(100 - splitPosition)}%
                </span>
              </div>
            </div>

            {/* Quick Position Presets */}
            <div className="flex items-center justify-center gap-2 mt-2">
              {[25, 50, 75].map((pos) => (
                <button
                  key={pos}
                  onClick={() => setSplitPosition(pos)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium transition-all",
                    splitPosition === pos
                      ? "bg-white/20 text-white"
                      : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                  )}
                >
                  {pos === 25 && "¼ Original"}
                  {pos === 50 && "50/50"}
                  {pos === 75 && "¾ Original"}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
