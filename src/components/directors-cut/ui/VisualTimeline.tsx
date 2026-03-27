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
  onSceneSelect: (sceneId: string) => void;
  onTransitionClick: (sceneId: string) => void;
  // Updated: only needs sceneId and new end time - parent handles shifting
  onSceneDurationChange?: (sceneId: string, newEndTime: number) => void;
  onTransitionAnchorChange?: (sceneId: string, anchorTime: number) => void;
  thumbnails?: Record<string, string>;
  currentTime?: number;
}

const TRANSITION_COLORS: Record<string, string> = {
  'crossfade': 'bg-blue-500',
  'fade': 'bg-slate-500',
  'dissolve': 'bg-purple-500',
  'wipe': 'bg-green-500',
  'slide': 'bg-orange-500',
  'none': 'bg-muted',
};

const TRANSITION_ICONS: Record<string, string> = {
  'crossfade': '✦',
  'fade': '◐',
  'dissolve': '✧',
  'wipe': '▶',
  'slide': '→',
  'none': '—',
};

export function VisualTimeline({
  scenes,
  transitions,
  videoDuration,
  selectedSceneId,
  onSceneSelect,
  onTransitionClick,
  onSceneDurationChange,
  onTransitionAnchorChange,
  thumbnails = {},
  currentTime = 0,
}: VisualTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [hoveredScene, setHoveredScene] = useState<string | null>(null);
  const [hoveredTransition, setHoveredTransition] = useState<string | null>(null);
  const [draggingDivider, setDraggingDivider] = useState<number | null>(null);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [dragStartScenes, setDragStartScenes] = useState<{ leftEnd: number; rightStart: number } | null>(null);
  
  // Transition dot drag state
  const [draggingTransition, setDraggingTransition] = useState<{ sceneId: string; sceneIndex: number } | null>(null);
  const [dragTransitionAnchor, setDragTransitionAnchor] = useState<number | null>(null);
  const dragTransitionStartXRef = useRef<number>(0);
  const dragTransitionStartAnchorRef = useRef<number>(0);

  // Calculate total duration dynamically from scenes (not prop) for accurate widths
  const actualTotalDuration = scenes.reduce((sum, s) => sum + (s.end_time - s.start_time), 0);

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
    
    // Calculate delta time based on CURRENT total duration (which can change)
    const currentTotalDuration = scenes.reduce((sum, s) => sum + (s.end_time - s.start_time), 0);
    const deltaTime = deltaPercent * currentTotalDuration;

    const leftScene = scenes[draggingDivider];
    
    // Calculate original duration for 1:3 ratio limits
    const originalDuration = (leftScene.original_end_time ?? leftScene.end_time) - 
      (leftScene.original_start_time ?? leftScene.start_time);
    const minDuration = Math.max(0.5, originalDuration / 3); // 3x faster max
    const maxDuration = originalDuration * 3; // 3x slower max

    // Calculate new end time with 1:3 ratio constraint
    const targetEndTime = dragStartScenes.leftEnd + deltaTime;
    const newDuration = targetEndTime - leftScene.start_time;
    const clampedDuration = Math.max(minDuration, Math.min(maxDuration, newDuration));
    const newLeftEnd = leftScene.start_time + clampedDuration;

    // Parent handles shifting subsequent scenes
    onSceneDurationChange(leftScene.id, newLeftEnd);
  }, [draggingDivider, dragStartX, dragStartScenes, scenes, onSceneDurationChange]);

  const handleMouseUp = useCallback(() => {
    setDraggingDivider(null);
    setDragStartScenes(null);
  }, []);

  // Transition dot drag handlers
  const handleTransitionDotMouseDown = useCallback((e: React.MouseEvent, sceneId: string, sceneIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const transition = transitions.find(t => t.sceneId === sceneId);
    const currentAnchor = transition?.anchorTime ?? scenes[sceneIndex].end_time;
    dragTransitionStartXRef.current = e.clientX;
    dragTransitionStartAnchorRef.current = currentAnchor;
    setDraggingTransition({ sceneId, sceneIndex });
    setDragTransitionAnchor(currentAnchor);
  }, [scenes, transitions]);

  const handleTransitionDotMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingTransition || !timelineRef.current || !onTransitionAnchorChange) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const deltaX = e.clientX - dragTransitionStartXRef.current;
    const deltaPercent = deltaX / rect.width;
    const deltaTime = deltaPercent * actualTotalDuration;
    
    const leftScene = scenes[draggingTransition.sceneIndex];
    const rightScene = scenes[draggingTransition.sceneIndex + 1];
    // Clamp: at least 0.3s inside each scene
    const minAnchor = leftScene.start_time + 0.3;
    const maxAnchor = rightScene.end_time - 0.3;
    const newAnchor = Math.max(minAnchor, Math.min(maxAnchor, dragTransitionStartAnchorRef.current + deltaTime));
    
    setDragTransitionAnchor(newAnchor);
  }, [draggingTransition, scenes, onTransitionAnchorChange]);

  const handleTransitionDotMouseUp = useCallback(() => {
    if (draggingTransition && dragTransitionAnchor !== null && onTransitionAnchorChange) {
      onTransitionAnchorChange(draggingTransition.sceneId, dragTransitionAnchor);
    }
    setDraggingTransition(null);
    setDragTransitionAnchor(null);
  }, [draggingTransition, dragTransitionAnchor, onTransitionAnchorChange]);

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
  }, [draggingDivider, handleMouseMove, handleMouseUp, draggingTransition, handleTransitionDotMouseMove, handleTransitionDotMouseUp]);

  // (actualTotalDuration moved up before handlers)
  
  const getSceneWidth = (scene: SceneAnalysis) => {
    return ((scene.end_time - scene.start_time) / actualTotalDuration) * 100;
  };

  const getTransitionForScene = (sceneId: string) => {
    return transitions.find(t => t.sceneId === sceneId);
  };

  const playheadPosition = (currentTime / actualTotalDuration) * 100;

  return (
    <div className="space-y-3">
      {/* Timeline Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Play className="h-3 w-3" />
          <span>Visual Timeline</span>
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
        className="relative rounded-2xl bg-muted/30 backdrop-blur-sm border border-border/50 p-3 overflow-hidden"
      >
        {/* Time Markers - based on actual total duration */}
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
            const isSelected = selectedSceneId === scene.id;
            const isHovered = hoveredScene === scene.id;
            const transition = getTransitionForScene(scene.id);
            const isLastScene = index === scenes.length - 1;

            return (
              <motion.div
                key={scene.id}
                className="relative"
                style={{ width: `${width}%` }}
                initial={{ opacity: 0, scaleY: 0.8 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                {/* Scene Block */}
                <motion.button
                  onClick={() => onSceneSelect(scene.id)}
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

                  {/* Drag Handle */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical className="h-4 w-4 text-white/50" />
                  </div>
                </motion.button>

                {/* Draggable Divider + Transition Connector */}
                {!isLastScene && (
                  <div className="absolute -right-3 top-0 bottom-0 z-20 flex items-center">
                    {/* Draggable Divider */}
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

                    {/* Transition Button */}
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTransitionClick(scene.id);
                      }}
                      onHoverStart={() => setHoveredTransition(scene.id)}
                      onHoverEnd={() => setHoveredTransition(null)}
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      className={cn(
                        "w-4 h-4 rounded-full flex items-center justify-center",
                        "border-2 border-background shadow-lg",
                        "transition-all duration-200",
                        transition ? TRANSITION_COLORS[transition.transitionType] : 'bg-muted',
                        hoveredTransition === scene.id && "ring-2 ring-primary/50"
                      )}
                    >
                      <span className="text-[8px] text-white">
                        {transition ? TRANSITION_ICONS[transition.transitionType] : '+'}
                      </span>
                    </motion.button>
                  </div>
                )}

                {/* Transition Info Tooltip */}
                {hoveredTransition === scene.id && transition && (
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
