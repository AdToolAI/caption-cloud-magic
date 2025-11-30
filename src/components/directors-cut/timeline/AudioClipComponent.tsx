import { useState, useRef, useCallback, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { X, GripVertical } from 'lucide-react';
import { AudioClip } from '@/types/timeline';
import { WaveformDisplay } from './WaveformDisplay';
import { cn } from '@/lib/utils';

interface AudioClipComponentProps {
  clip: AudioClip;
  trackColor: string;
  zoom: number;
  isSelected: boolean;
  onSelect: () => void;
  onResize: (duration: number, edge: 'start' | 'end') => void;
  onDelete: () => void;
}

export function AudioClipComponent({
  clip,
  trackColor,
  zoom,
  isSelected,
  onSelect,
  onResize,
  onDelete,
}: AudioClipComponentProps) {
  const [isResizing, setIsResizing] = useState<'start' | 'end' | null>(null);
  const resizeStartX = useRef(0);
  const originalDuration = useRef(clip.duration);
  const originalStartTime = useRef(clip.startTime);
  
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: clip.id,
    data: { clip },
  });
  
  const style = {
    left: `${clip.startTime * zoom}px`,
    width: `${clip.duration * zoom}px`,
    transform: CSS.Translate.toString(transform),
  };
  
  // Handle resize
  const handleResizeStart = useCallback((e: React.MouseEvent, edge: 'start' | 'end') => {
    e.stopPropagation();
    setIsResizing(edge);
    resizeStartX.current = e.clientX;
    originalDuration.current = clip.duration;
    originalStartTime.current = clip.startTime;
  }, [clip.duration, clip.startTime]);
  
  useEffect(() => {
    if (!isResizing) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartX.current;
      const deltaTime = deltaX / zoom;
      
      if (isResizing === 'end') {
        const newDuration = Math.max(0.5, originalDuration.current + deltaTime);
        onResize(newDuration, 'end');
      } else {
        const newDuration = Math.max(0.5, originalDuration.current - deltaTime);
        onResize(newDuration, 'start');
      }
    };
    
    const handleMouseUp = () => {
      setIsResizing(null);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, zoom, onResize]);

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      className={cn(
        "absolute top-1 bottom-1 rounded-md overflow-hidden cursor-grab active:cursor-grabbing",
        "group transition-shadow",
        isDragging && "opacity-50 z-50",
        isSelected && "ring-2 ring-white shadow-lg",
        !isDragging && "hover:shadow-md"
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
    >
      {/* Background */}
      <div 
        className="absolute inset-0"
        style={{ 
          background: `linear-gradient(135deg, ${trackColor}cc, ${trackColor}99)`,
        }}
      />
      
      {/* Waveform */}
      <div className="absolute inset-0 opacity-60">
        <WaveformDisplay 
          audioUrl={clip.url} 
          duration={clip.duration}
          color="rgba(255,255,255,0.6)"
        />
      </div>
      
      {/* Content */}
      <div className="relative h-full flex flex-col justify-between p-1">
        {/* Header */}
        <div className="flex items-center justify-between">
          {/* Drag Handle */}
          <div {...attributes} {...listeners} className="cursor-grab">
            <GripVertical className="h-3 w-3 text-white/70" />
          </div>
          
          {/* Clip Name */}
          <div className="flex-1 text-[10px] text-white font-medium truncate px-1">
            {clip.name}
          </div>
          
          {/* Delete Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-white/20 rounded"
          >
            <X className="h-3 w-3 text-white" />
          </button>
        </div>
        
        {/* Duration */}
        <div className="text-[9px] text-white/70">
          {clip.duration.toFixed(1)}s
        </div>
      </div>
      
      {/* Resize Handles */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize",
          "hover:bg-white/30 transition-colors",
          isResizing === 'start' && "bg-white/40"
        )}
        onMouseDown={(e) => handleResizeStart(e, 'start')}
      />
      <div
        className={cn(
          "absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize",
          "hover:bg-white/30 transition-colors",
          isResizing === 'end' && "bg-white/40"
        )}
        onMouseDown={(e) => handleResizeStart(e, 'end')}
      />
      
      {/* Fade Indicators */}
      {clip.fadeIn > 0 && (
        <div 
          className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-black/50 to-transparent pointer-events-none"
          style={{ width: `${(clip.fadeIn / clip.duration) * 100}%` }}
        />
      )}
      {clip.fadeOut > 0 && (
        <div 
          className="absolute right-0 top-0 bottom-0 bg-gradient-to-l from-black/50 to-transparent pointer-events-none"
          style={{ width: `${(clip.fadeOut / clip.duration) * 100}%` }}
        />
      )}
    </motion.div>
  );
}
