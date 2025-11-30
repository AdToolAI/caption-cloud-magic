import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Scissors, Link, MoreVertical, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SceneAnalysis } from '@/types/directors-cut';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface EditableVideoTrackProps {
  scenes: SceneAnalysis[];
  zoom: number;
  currentTime: number;
  duration: number;
  onSceneSplit: (time: number) => void;
  onSceneMerge: (sceneIds: string[]) => void;
  onSceneReorder: (fromIndex: number, toIndex: number) => void;
  onSceneSelect: (id: string | null) => void;
  onSceneResize: (sceneId: string, newStart: number, newEnd: number) => void;
  selectedSceneId: string | null;
}

interface DraggableSceneProps {
  scene: SceneAnalysis;
  index: number;
  zoom: number;
  isSelected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
  onResize: (newStart: number, newEnd: number) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function DraggableScene({
  scene,
  index,
  zoom,
  isSelected,
  isCurrent,
  onSelect,
  onResize,
  onContextMenu,
}: DraggableSceneProps) {
  const [isResizing, setIsResizing] = useState<'start' | 'end' | null>(null);
  const startXRef = useRef(0);
  const originalBoundsRef = useRef({ start: 0, end: 0 });

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `scene-${scene.id}`,
    data: { type: 'scene', scene, index },
  });

  const left = scene.start_time * zoom;
  const width = (scene.end_time - scene.start_time) * zoom;

  const handleResizeStart = (e: React.MouseEvent, edge: 'start' | 'end') => {
    e.stopPropagation();
    setIsResizing(edge);
    startXRef.current = e.clientX;
    originalBoundsRef.current = { start: scene.start_time, end: scene.end_time };

    const handleMouseMove = (moveE: MouseEvent) => {
      const deltaX = moveE.clientX - startXRef.current;
      const deltaTime = deltaX / zoom;

      if (edge === 'start') {
        const newStart = Math.max(0, originalBoundsRef.current.start + deltaTime);
        if (newStart < scene.end_time - 0.5) {
          onResize(newStart, scene.end_time);
        }
      } else {
        const newEnd = originalBoundsRef.current.end + deltaTime;
        if (newEnd > scene.start_time + 0.5) {
          onResize(scene.start_time, newEnd);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizing(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const colors = [
    'from-indigo-500/40 to-indigo-600/40',
    'from-purple-500/40 to-purple-600/40',
    'from-blue-500/40 to-blue-600/40',
    'from-cyan-500/40 to-cyan-600/40',
    'from-emerald-500/40 to-emerald-600/40',
  ];

  return (
    <motion.div
      ref={setNodeRef}
      className={cn(
        "absolute h-full rounded-md overflow-hidden cursor-pointer group",
        `bg-gradient-to-r ${colors[index % colors.length]}`,
        isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        isCurrent && "ring-2 ring-yellow-400",
        isDragging && "opacity-50 z-50"
      )}
      style={{
        left,
        width: Math.max(width, 20),
        transform: transform ? `translateX(${transform.x}px)` : undefined,
      }}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
    >
      {/* Thumbnail Background */}
      {scene.thumbnail_url && (
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: `url(${scene.thumbnail_url})` }}
        />
      )}

      {/* Content */}
      <div className="relative h-full flex items-center px-2 z-10">
        {/* Scene Number */}
        <div className="bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded font-bold mr-2">
          {index + 1}
        </div>
        
        {/* Scene Description */}
        {width > 80 && (
          <span className="text-[11px] text-foreground/90 truncate font-medium">
            {scene.description?.slice(0, Math.floor(width / 8))}
          </span>
        )}
      </div>

      {/* Resize Handles */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize",
          "bg-white/0 hover:bg-white/30 transition-colors",
          isResizing === 'start' && "bg-primary/50"
        )}
        onMouseDown={(e) => handleResizeStart(e, 'start')}
      />
      <div
        className={cn(
          "absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize",
          "bg-white/0 hover:bg-white/30 transition-colors",
          isResizing === 'end' && "bg-primary/50"
        )}
        onMouseDown={(e) => handleResizeStart(e, 'end')}
      />

      {/* Hover Actions */}
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 bg-black/50">
              <MoreVertical className="h-3 w-3 text-white" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Scissors className="h-3 w-3 mr-2" />
              Szene splitten
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link className="h-3 w-3 mr-2" />
              Mit vorheriger verbinden
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Wand2 className="h-3 w-3 mr-2" />
              KI-Effekte
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Duration Indicator */}
      <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1 py-0.5 rounded font-mono">
        {(scene.end_time - scene.start_time).toFixed(1)}s
      </div>
    </motion.div>
  );
}

export function EditableVideoTrack({
  scenes,
  zoom,
  currentTime,
  duration,
  onSceneSplit,
  onSceneMerge,
  onSceneReorder,
  onSceneSelect,
  onSceneResize,
  selectedSceneId,
}: EditableVideoTrackProps) {
  const { setNodeRef } = useDroppable({ id: 'video-track' });

  const getCurrentSceneIndex = () => {
    return scenes.findIndex(s => currentTime >= s.start_time && currentTime < s.end_time);
  };

  const currentSceneIndex = getCurrentSceneIndex();

  const handleContextMenu = (e: React.MouseEvent, scene: SceneAnalysis) => {
    e.preventDefault();
    onSceneSelect(scene.id);
  };

  return (
    <div 
      ref={setNodeRef}
      className="relative h-full bg-muted/20"
      style={{ width: duration * zoom }}
    >
      {/* Grid Lines */}
      {Array.from({ length: Math.ceil(duration) }).map((_, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 w-px bg-border/30"
          style={{ left: i * zoom }}
        />
      ))}

      {/* Scenes */}
      {scenes.map((scene, index) => (
        <DraggableScene
          key={scene.id}
          scene={scene}
          index={index}
          zoom={zoom}
          isSelected={scene.id === selectedSceneId}
          isCurrent={index === currentSceneIndex}
          onSelect={() => onSceneSelect(scene.id)}
          onResize={(newStart, newEnd) => onSceneResize(scene.id, newStart, newEnd)}
          onContextMenu={(e) => handleContextMenu(e, scene)}
        />
      ))}
    </div>
  );
}
