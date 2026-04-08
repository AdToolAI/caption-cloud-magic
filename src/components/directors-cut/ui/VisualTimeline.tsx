import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Play, GripVertical, GripHorizontal } from 'lucide-react';
import { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';
import { cn } from '@/lib/utils';

interface VisualTimelineProps {
  scenes: SceneAnalysis[];
  transitions: TransitionAssignment[];
  videoDuration: number;
  selectedSceneId: string | null;
  selectedSceneIds?: Set<string>;
  onSceneSelect: (sceneId: string, shiftKey: boolean) => void;
  onTransitionClick: (sceneId: string) => void;
  onSceneDurationChange?: (sceneId: string, newEndTime: number) => void;
  /** @deprecated anchorTime removed — transitions anchor to original_end_time */
  onTransitionAnchorChange?: (sceneId: string, anchorTime: number) => void;
  onScenesReorder?: (fromIndex: number, toIndex: number) => void;
  cutSegmentMode?: boolean;
  cutSegmentIn?: number | null;
  cutSegmentOut?: number | null;
  onCutSegmentClick?: (time: number) => void;
  thumbnails?: Record<string, string>;
  currentTime?: number;
}

const TRANSITION_COLORS: Record<string, string> = {
  'crossfade': 'bg-blue-500',
  'fade': 'bg-slate-500',
  'dissolve': 'bg-purple-500',
  'wipe': 'bg-green-500',
  'slide': 'bg-orange-500',
  'blur': 'bg-indigo-500',
  'zoom': 'bg-teal-500',
  'push': 'bg-amber-500',
  'morph': 'bg-violet-500',
  'none': 'bg-muted',
};

const TRANSITION_ICONS: Record<string, string> = {
  'crossfade': '✦',
  'fade': '◐',
  'dissolve': '✧',
  'wipe': '▶',
  'slide': '→',
  'blur': '◎',
  'zoom': '⊕',
  'push': '⇒',
  'morph': '∞',
  'none': '—',
};

export function VisualTimeline({
  scenes,
  transitions,
  videoDuration,
  selectedSceneId,
  selectedSceneIds = new Set(),
  onSceneSelect,
  onTransitionClick,
  onSceneDurationChange,
  onTransitionAnchorChange,
  onScenesReorder,
  cutSegmentMode = false,
  cutSegmentIn = null,
  cutSegmentOut = null,
  onCutSegmentClick,
  thumbnails = {},
  currentTime = 0,
}: VisualTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [hoveredScene, setHoveredScene] = useState<string | null>(null);
  const [hoveredTransition, setHoveredTransition] = useState<string | null>(null);
  const [draggingDivider, setDraggingDivider] = useState<number | null>(null);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [dragStartScenes, setDragStartScenes] = useState<{ leftEnd: number; rightStart: number } | null>(null);
  
  // Drag-to-reorder state
  const [draggingSceneIdx, setDraggingSceneIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);
  const dragSceneStartX = useRef(0);
  
  // Trim handle state
  const [trimmingScene, setTrimmingScene] = useState<{ id: string; edge: 'start' | 'end' } | null>(null);
  const trimStartX = useRef(0);
  const trimOriginalTime = useRef(0);
  
  // Transition dot drag state
  const [draggingTransition, setDraggingTransition] = useState<{ sceneId: string; sceneIndex: number } | null>(null);
  const [dragTransitionAnchor, setDragTransitionAnchor] = useState<number | null>(null);
  const dragTransitionStartXRef = useRef<number>(0);
  const dragTransitionStartAnchorRef = useRef<number>(0);
  const hasExceededDragThresholdRef = useRef<boolean>(false);

  const actualTotalDuration = scenes.length > 0 ? Math.max(...scenes.map(s => s.end_time)) : videoDuration;

  // Handle divider drag
  const handleDividerMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingDivider(index);
    setDragStartX(e.clientX);
    setDragStartScenes({
      leftEnd: scenes[index].end_time,
      rightStart: scenes[index + 1].start_time,
    });
  }, [scenes]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingDivider === null || !timelineRef.current || !dragStartScenes || !onSceneDurationChange) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const deltaX = e.clientX - dragStartX;
    const deltaPercent = deltaX / rect.width;
    const currentTotalDuration = scenes.reduce((sum, s) => sum + (s.end_time - s.start_time), 0);
    const deltaTime = deltaPercent * currentTotalDuration;

    const leftScene = scenes[draggingDivider];
    const originalDuration = (leftScene.original_end_time ?? leftScene.end_time) - 
      (leftScene.original_start_time ?? leftScene.start_time);
    const minDuration = Math.max(0.5, originalDuration / 3);
    const maxDuration = originalDuration * 3;

    const targetEndTime = dragStartScenes.leftEnd + deltaTime;
    const newDuration = targetEndTime - leftScene.start_time;
    const clampedDuration = Math.max(minDuration, Math.min(maxDuration, newDuration));
    const newLeftEnd = leftScene.start_time + clampedDuration;

    onSceneDurationChange(leftScene.id, newLeftEnd);
  }, [draggingDivider, dragStartX, dragStartScenes, scenes, onSceneDurationChange]);

  const handleMouseUp = useCallback(() => {
    setDraggingDivider(null);
    setDragStartScenes(null);
  }, []);

  // Transition dot click handler
  const handleTransitionDotMouseDown = useCallback((e: React.MouseEvent, sceneId: string, sceneIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    onTransitionClick(sceneId);
  }, [onTransitionClick]);

  const handleTransitionDotMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingTransition || !timelineRef.current || !onTransitionAnchorChange) return;
    
    const deltaX = e.clientX - dragTransitionStartXRef.current;
    if (!hasExceededDragThresholdRef.current && Math.abs(deltaX) < 5) return;
    hasExceededDragThresholdRef.current = true;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const deltaPercent = deltaX / rect.width;
    const deltaTime = deltaPercent * actualTotalDuration;
    
    const leftScene = scenes[draggingTransition.sceneIndex];
    const rightScene = scenes[draggingTransition.sceneIndex + 1];
    const minAnchor = leftScene.start_time + 0.3;
    const maxAnchor = rightScene.end_time - 0.3;
    const newAnchor = Math.max(minAnchor, Math.min(maxAnchor, dragTransitionStartAnchorRef.current + deltaTime));
    
    setDragTransitionAnchor(newAnchor);
  }, [draggingTransition, scenes, onTransitionAnchorChange, actualTotalDuration]);

  const handleTransitionDotMouseUp = useCallback(() => {
    if (draggingTransition && dragTransitionAnchor !== null && onTransitionAnchorChange && hasExceededDragThresholdRef.current) {
      onTransitionAnchorChange(draggingTransition.sceneId, dragTransitionAnchor);
    }
    if (draggingTransition && !hasExceededDragThresholdRef.current) {
      onTransitionClick(draggingTransition.sceneId);
    }
    setDraggingTransition(null);
    setDragTransitionAnchor(null);
  }, [draggingTransition, dragTransitionAnchor, onTransitionAnchorChange, onTransitionClick]);

  // Drag-to-reorder handlers
  const handleSceneDragStart = useCallback((e: React.MouseEvent, index: number) => {
    if (!onScenesReorder) return;
    e.preventDefault();
    dragSceneStartX.current = e.clientX;
    setDraggingSceneIdx(index);
  }, [onScenesReorder]);

  const handleSceneDragMove = useCallback((e: MouseEvent) => {
    if (draggingSceneIdx === null || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const time = percent * actualTotalDuration;
    
    // Find which scene index the cursor is over
    let targetIdx = scenes.findIndex(s => time >= s.start_time && time < s.end_time);
    if (targetIdx === -1) targetIdx = scenes.length - 1;
    setDropTargetIdx(targetIdx);
  }, [draggingSceneIdx, scenes, actualTotalDuration]);

  const handleSceneDragEnd = useCallback(() => {
    if (draggingSceneIdx !== null && dropTargetIdx !== null && onScenesReorder) {
      onScenesReorder(draggingSceneIdx, dropTargetIdx);
    }
    setDraggingSceneIdx(null);
    setDropTargetIdx(null);
  }, [draggingSceneIdx, dropTargetIdx, onScenesReorder]);

  // Trim handle handlers
  const handleTrimStart = useCallback((e: React.MouseEvent, sceneId: string, edge: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    setTrimmingScene({ id: sceneId, edge });
    trimStartX.current = e.clientX;
    trimOriginalTime.current = edge === 'start' ? scene.start_time : scene.end_time;
  }, [scenes]);

  const handleTrimMove = useCallback((e: MouseEvent) => {
    if (!trimmingScene || !timelineRef.current || !onSceneDurationChange) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const deltaX = e.clientX - trimStartX.current;
    const deltaTime = (deltaX / rect.width) * actualTotalDuration;
    const scene = scenes.find(s => s.id === trimmingScene.id);
    if (!scene) return;
    
    if (trimmingScene.edge === 'end') {
      const newEnd = Math.max(scene.start_time + 0.5, trimOriginalTime.current + deltaTime);
      onSceneDurationChange(scene.id, newEnd);
    }
    // Start trimming would need a different callback - for now just support end trim
  }, [trimmingScene, scenes, actualTotalDuration, onSceneDurationChange]);

  const handleTrimEnd = useCallback(() => {
    setTrimmingScene(null);
  }, []);

  // Cut segment click on timeline
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!cutSegmentMode || !timelineRef.current || !onCutSegmentClick) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / rect.width) * actualTotalDuration;
    onCutSegmentClick(Math.max(0, Math.min(actualTotalDuration, time)));
  }, [cutSegmentMode, actualTotalDuration, onCutSegmentClick]);

  // Add/remove event listeners for drag
  useEffect(() => {
    if (draggingDivider !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
    if (draggingTransition !== null) {
      window.addEventListener('mousemove', handleTransitionDotMouseMove);
      window.addEventListener('mouseup', handleTransitionDotMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleTransitionDotMouseMove);
        window.removeEventListener('mouseup', handleTransitionDotMouseUp);
      };
    }
    if (draggingSceneIdx !== null) {
      window.addEventListener('mousemove', handleSceneDragMove);
      window.addEventListener('mouseup', handleSceneDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleSceneDragMove);
        window.removeEventListener('mouseup', handleSceneDragEnd);
      };
    }
    if (trimmingScene !== null) {
      window.addEventListener('mousemove', handleTrimMove);
      window.addEventListener('mouseup', handleTrimEnd);
      return () => {
        window.removeEventListener('mousemove', handleTrimMove);
        window.removeEventListener('mouseup', handleTrimEnd);
      };
    }
  }, [draggingDivider, handleMouseMove, handleMouseUp, draggingTransition, handleTransitionDotMouseMove, handleTransitionDotMouseUp, draggingSceneIdx, handleSceneDragMove, handleSceneDragEnd, trimmingScene, handleTrimMove, handleTrimEnd]);

  const getSceneWidth = (scene: SceneAnalysis) => {
    return ((scene.end_time - scene.start_time) / actualTotalDuration) * 100;
  };

  const getTransitionForScene = (sceneId: string) => {
    return transitions.find(t => t.sceneId === sceneId);
  };

  const playheadPosition = (currentTime / actualTotalDuration) * 100;

  // Cut segment overlay positions
  const cutInPos = cutSegmentIn !== null ? (cutSegmentIn / actualTotalDuration) * 100 : null;
  const cutOutPos = cutSegmentOut !== null ? (cutSegmentOut / actualTotalDuration) * 100 : null;

  return (
    <div className="space-y-3">
      {/* Timeline Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Play className="h-3 w-3" />
          <span>Visual Timeline</span>
          {cutSegmentMode && (
            <Badge variant="destructive" className="text-[9px] h-4 animate-pulse">
              ✂ Segment-Modus
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Gesamt: {actualTotalDuration.toFixed(1)}s</span>
          {Math.abs(actualTotalDuration - videoDuration) > 0.1 && (
            <Badge variant="secondary" className="text-[9px] h-4">
              {actualTotalDuration > videoDuration ? '+' : ''}{(actualTotalDuration - videoDuration).toFixed(1)}s
            </Badge>
          )}
        </div>
      </div>

      {/* Main Timeline Container */}
      <div 
        ref={timelineRef}
        className={cn(
          "relative rounded-2xl bg-muted/30 backdrop-blur-sm border border-border/50 p-3 overflow-hidden",
          cutSegmentMode && "ring-2 ring-destructive/30 cursor-crosshair"
        )}
        onClick={handleTimelineClick}
      >
        {/* Time Markers */}
        <div className="flex justify-between mb-2 px-1">
          {Array.from({ length: Math.ceil(actualTotalDuration / 5) + 1 }, (_, i) => (
            <span 
              key={i} 
              className="text-[9px] font-mono text-muted-foreground"
              style={{ minWidth: '30px', textAlign: i === 0 ? 'left' : 'center' }}
            >
              {(i * 5).toFixed(0)}s
            </span>
          ))}
        </div>

        {/* Scene Blocks Container */}
        <div className="relative flex h-20 gap-0.5 rounded-xl overflow-hidden">
          {scenes.map((scene, index) => {
            const width = getSceneWidth(scene);
            const isSelected = selectedSceneId === scene.id || selectedSceneIds.has(scene.id);
            const isHovered = hoveredScene === scene.id;
            const transition = getTransitionForScene(scene.id);
            const isLastScene = index === scenes.length - 1;
            const isDragTarget = dropTargetIdx === index && draggingSceneIdx !== null && draggingSceneIdx !== index;
            const isBeingDragged = draggingSceneIdx === index;

            return (
              <motion.div
                key={scene.id}
                className={cn("relative", isDragTarget && "ring-2 ring-primary")}
                style={{ width: `${width}%`, opacity: isBeingDragged ? 0.4 : 1 }}
                initial={{ opacity: 0, scaleY: 0.8 }}
                animate={{ opacity: isBeingDragged ? 0.4 : 1, scaleY: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                {/* Scene Block */}
                <motion.button
                  onClick={(e) => {
                    if (!cutSegmentMode) onSceneSelect(scene.id, e.shiftKey);
                  }}
                  onHoverStart={() => setHoveredScene(scene.id)}
                  onHoverEnd={() => setHoveredScene(null)}
                  whileHover={{ y: -2 }}
                  className={cn(
                    "relative w-full h-full rounded-lg overflow-hidden transition-all duration-200",
                    "border-2",
                    isSelected 
                      ? "border-primary ring-2 ring-primary/30 z-10" 
                      : "border-transparent hover:border-primary/50"
                  )}
                >
                  {/* Thumbnail or Gradient Background */}
                  {thumbnails[scene.id] ? (
                    <img 
                      src={thumbnails[scene.id]} 
                      alt={`Scene ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div 
                      className="w-full h-full"
                      style={{
                        background: `linear-gradient(135deg, 
                          hsl(${(index * 60) % 360}, 70%, 50%) 0%, 
                          hsl(${((index * 60) + 30) % 360}, 70%, 40%) 100%)`
                      }}
                    />
                  )}

                  {/* Dark Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

                  {/* Scene Number */}
                  <div className="absolute top-1 left-1">
                    <Badge 
                      variant="secondary" 
                      className="backdrop-blur-sm bg-black/40 text-white border-0 text-[9px] px-1.5 py-0"
                    >
                      {index + 1}
                    </Badge>
                  </div>

                  {/* Scene Info on Hover */}
                  {(isHovered || isSelected) && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute bottom-1 left-1 right-1"
                    >
                      <div className="text-[8px] text-white truncate font-medium">
                        {scene.description || `Szene ${index + 1}`}
                      </div>
                      <div className="text-[7px] text-white/70 font-mono">
                        {scene.start_time.toFixed(1)}s - {scene.end_time.toFixed(1)}s
                      </div>
                    </motion.div>
                  )}

                  {/* Drag Handle for reorder */}
                  {onScenesReorder && (
                    <div 
                      className="absolute top-1 right-1 opacity-0 hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-20"
                      onMouseDown={(e) => { e.stopPropagation(); handleSceneDragStart(e, index); }}
                    >
                      <div className="bg-black/60 rounded p-0.5">
                        <GripVertical className="h-3 w-3 text-white/80" />
                      </div>
                    </div>
                  )}
                </motion.button>

                {/* Trim Handles */}
                <div
                  className={cn(
                    "absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-20",
                    "bg-transparent hover:bg-primary/40 transition-colors rounded-l",
                    trimmingScene?.id === scene.id && trimmingScene.edge === 'start' && "bg-primary/60"
                  )}
                  onMouseDown={(e) => handleTrimStart(e, scene.id, 'start')}
                />
                <div
                  className={cn(
                    "absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-20",
                    "bg-transparent hover:bg-primary/40 transition-colors rounded-r",
                    trimmingScene?.id === scene.id && trimmingScene.edge === 'end' && "bg-primary/60"
                  )}
                  onMouseDown={(e) => handleTrimStart(e, scene.id, 'end')}
                />

                {/* Draggable Divider + Transition Connector */}
                {!isLastScene && (
                  <div className="absolute -right-3 top-0 bottom-0 z-20 flex items-center">
                    <motion.div
                      onMouseDown={(e) => handleDividerMouseDown(e, index)}
                      className={cn(
                        "absolute inset-y-0 w-6 cursor-ew-resize flex items-center justify-center group",
                        draggingDivider === index && "bg-primary/20"
                      )}
                    >
                      <div className={cn(
                        "w-1 h-12 rounded-full transition-all",
                        draggingDivider === index 
                          ? "bg-primary scale-y-110" 
                          : "bg-border group-hover:bg-primary/50"
                      )}>
                        <GripHorizontal className={cn(
                          "h-3 w-3 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                          "text-muted-foreground group-hover:text-primary transition-colors",
                          draggingDivider === index && "text-primary"
                        )} />
                      </div>
                    </motion.div>

                    <motion.button
                      onMouseDown={(e) => handleTransitionDotMouseDown(e, scene.id, index)}
                      onHoverStart={() => setHoveredTransition(scene.id)}
                      onHoverEnd={() => setHoveredTransition(null)}
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center",
                        "border-2 border-background shadow-lg",
                        "transition-colors duration-200 cursor-pointer",
                        transition ? TRANSITION_COLORS[transition.transitionType] : 'bg-muted',
                        hoveredTransition === scene.id && "ring-2 ring-primary/50",
                      )}
                    >
                      <span className="text-[8px] text-white">
                        {transition ? TRANSITION_ICONS[transition.transitionType] : '+'}
                      </span>
                    </motion.button>
                  </div>
                )}

                {/* Transition Info Tooltip */}
                {(hoveredTransition === scene.id || draggingTransition?.sceneId === scene.id) && transition && (
                  <motion.div
                    initial={{ opacity: 0, y: 5, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="absolute -right-12 top-full mt-2 z-30"
                  >
                    <div className="backdrop-blur-xl bg-popover/90 rounded-lg p-2 shadow-xl border border-border/50 min-w-[100px]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className={cn("w-2 h-2 rounded-full", TRANSITION_COLORS[transition.transitionType])} />
                        <span className="text-[10px] font-medium capitalize">{transition.transitionType}</span>
                      </div>
                      <div className="text-[9px] text-muted-foreground">
                        Dauer: {transition.duration.toFixed(1)}s
                      </div>
                      
                      {transition.aiSuggested && (
                        <Badge className="mt-1 h-4 text-[8px] px-1" variant="secondary">
                          <Sparkles className="h-2 w-2 mr-0.5" />
                          AI
                        </Badge>
                      )}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}

          {/* Cut Segment Overlay */}
          {cutSegmentMode && cutInPos !== null && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-destructive z-40 pointer-events-none"
              style={{ left: `${cutInPos}%` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[8px] text-destructive font-mono bg-background px-1 rounded">IN</div>
            </div>
          )}
          {cutSegmentMode && cutOutPos !== null && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-destructive z-40 pointer-events-none"
              style={{ left: `${cutOutPos}%` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[8px] text-destructive font-mono bg-background px-1 rounded">OUT</div>
            </div>
          )}
          {cutSegmentMode && cutInPos !== null && cutOutPos !== null && (
            <div
              className="absolute top-0 bottom-0 bg-destructive/20 z-30 pointer-events-none border-x border-destructive/50"
              style={{ 
                left: `${Math.min(cutInPos, cutOutPos)}%`, 
                width: `${Math.abs(cutOutPos - cutInPos)}%` 
              }}
            />
          )}

          {/* Playhead */}
          <motion.div
            className="absolute top-0 bottom-0 w-0.5 bg-destructive z-30 pointer-events-none"
            style={{ left: `${playheadPosition}%` }}
            animate={{ left: `${playheadPosition}%` }}
            transition={{ type: 'tween', duration: 0.1 }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-destructive rounded-full" />
          </motion.div>
        </div>

        {/* Transition Legend */}
        <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-border/50">
          {Object.entries(TRANSITION_COLORS).filter(([key]) => key !== 'none').map(([type, color]) => (
            <div key={type} className="flex items-center gap-1">
              <div className={cn("w-2 h-2 rounded-full", color)} />
              <span className="text-[9px] text-muted-foreground capitalize">{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
