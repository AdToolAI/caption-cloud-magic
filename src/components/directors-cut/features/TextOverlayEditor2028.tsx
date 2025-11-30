import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { 
  Type, Plus, Trash2, Copy, Sparkles, GripHorizontal, Play, Pause
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TextOverlay, TEXT_OVERLAY_TEMPLATES } from '@/types/directors-cut';

interface TextOverlayEditor2028Props {
  overlays: TextOverlay[];
  onOverlaysChange: (overlays: TextOverlay[]) => void;
  videoDuration: number;
  currentTime?: number;
  videoUrl?: string;
}

// Animation definitions with CSS keyframes for live preview
const ANIMATIONS = [
  { id: 'fadeIn', name: 'Fade In', description: 'Sanftes Einblenden' },
  { id: 'scaleUp', name: 'Scale Up', description: 'Vergrößern von klein' },
  { id: 'bounce', name: 'Bounce', description: 'Hüpfende Animation' },
  { id: 'typewriter', name: 'Typewriter', description: 'Schreibmaschine' },
  { id: 'highlight', name: 'Highlight', description: 'Marker-Effekt' },
  { id: 'glitch', name: 'Glitch', description: 'Digitaler Störeffekt' },
] as const;

const POSITIONS = [
  { id: 'topLeft', row: 0, col: 0 },
  { id: 'top', row: 0, col: 1 },
  { id: 'topRight', row: 0, col: 2 },
  { id: 'centerLeft', row: 1, col: 0 },
  { id: 'center', row: 1, col: 1 },
  { id: 'centerRight', row: 1, col: 2 },
  { id: 'bottomLeft', row: 2, col: 0 },
  { id: 'bottom', row: 2, col: 1 },
  { id: 'bottomRight', row: 2, col: 2 },
] as const;

const FONT_SIZES = [
  { id: 'sm', name: 'S', preview: '14px' },
  { id: 'md', name: 'M', preview: '18px' },
  { id: 'lg', name: 'L', preview: '24px' },
  { id: 'xl', name: 'XL', preview: '32px' },
] as const;

const PRESET_COLORS = [
  '#ffffff', '#000000', '#ff3b30', '#34c759', '#007aff',
  '#ffcc00', '#ff2d92', '#5856d6', '#ff9500', '#af52de',
];

// Animation Preview Component with live CSS animation
function AnimationCard({ 
  animation, 
  isSelected, 
  onSelect,
  isHovered,
  onHover,
}: { 
  animation: typeof ANIMATIONS[number];
  isSelected: boolean;
  onSelect: () => void;
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
}) {
  const getAnimationStyle = (): React.CSSProperties => {
    if (!isHovered) return { opacity: 1 };
    
    switch (animation.id) {
      case 'fadeIn':
        return { animation: 'fadeInDemo 1s ease-out infinite' };
      case 'scaleUp':
        return { animation: 'scaleUpDemo 0.8s ease-out infinite' };
      case 'bounce':
        return { animation: 'bounceDemo 0.6s ease-in-out infinite' };
      case 'typewriter':
        return { animation: 'typewriterDemo 2s steps(4) infinite' };
      case 'highlight':
        return { animation: 'highlightDemo 1.5s ease-in-out infinite' };
      case 'glitch':
        return { animation: 'glitchDemo 0.3s ease-in-out infinite' };
      default:
        return {};
    }
  };

  return (
    <motion.button
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onSelect}
      className={`relative p-4 rounded-xl backdrop-blur-xl border transition-all duration-300 overflow-hidden group ${
        isSelected 
          ? 'bg-primary/20 border-primary shadow-[0_0_30px_rgba(var(--primary),0.3)]' 
          : 'bg-white/5 border-white/10 hover:border-primary/50 hover:bg-white/10'
      }`}
    >
      {/* Glow effect on hover */}
      <div className={`absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
      
      {/* Animation preview area */}
      <div className="h-10 flex items-center justify-center mb-2 relative z-10">
        <span 
          className="text-lg font-bold text-foreground"
          style={getAnimationStyle()}
        >
          Text
        </span>
      </div>
      
      {/* Label */}
      <div className="relative z-10">
        <div className="font-medium text-sm">{animation.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{animation.description}</div>
      </div>
      
      {/* Selected indicator */}
      {isSelected && (
        <motion.div
          layoutId="animationSelected"
          className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary"
        />
      )}
    </motion.button>
  );
}

// Visual Position Grid Component
function PositionGrid({ 
  selectedPosition, 
  onSelectPosition,
  previewText,
}: {
  selectedPosition: string;
  onSelectPosition: (position: string) => void;
  previewText: string;
}) {
  const [hoveredPosition, setHoveredPosition] = useState<string | null>(null);
  
  const getPositionStyle = (posId: string): React.CSSProperties => {
    const pos = POSITIONS.find(p => p.id === posId);
    if (!pos) return {};
    
    const top = pos.row === 0 ? '8%' : pos.row === 1 ? '50%' : '92%';
    const left = pos.col === 0 ? '8%' : pos.col === 1 ? '50%' : '92%';
    const transform = `translate(${pos.col === 1 ? '-50%' : pos.col === 0 ? '0' : '-100%'}, ${pos.row === 1 ? '-50%' : pos.row === 0 ? '0' : '-100%'})`;
    
    return { top, left, transform };
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Position</Label>
      <div className="relative aspect-video rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/20 overflow-hidden">
        {/* Grid lines */}
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="border border-white/5" />
          ))}
        </div>
        
        {/* Position buttons */}
        {POSITIONS.map((pos) => {
          const isSelected = selectedPosition === pos.id;
          const isHovered = hoveredPosition === pos.id;
          
          return (
            <motion.button
              key={pos.id}
              onClick={() => onSelectPosition(pos.id)}
              onMouseEnter={() => setHoveredPosition(pos.id)}
              onMouseLeave={() => setHoveredPosition(null)}
              className={`absolute w-6 h-6 rounded-full transition-all duration-200 ${
                isSelected 
                  ? 'bg-primary shadow-[0_0_15px_rgba(var(--primary),0.6)] scale-110' 
                  : isHovered
                    ? 'bg-primary/60 scale-105'
                    : 'bg-white/30 hover:bg-white/50'
              }`}
              style={getPositionStyle(pos.id)}
              whileHover={{ scale: isSelected ? 1.1 : 1.2 }}
              whileTap={{ scale: 0.9 }}
            />
          );
        })}
        
        {/* Live text preview */}
        <AnimatePresence mode="wait">
          {(hoveredPosition || selectedPosition) && (
            <motion.div
              key={hoveredPosition || selectedPosition}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute px-2 py-1 bg-black/70 rounded text-xs font-medium text-white pointer-events-none"
              style={getPositionStyle(hoveredPosition || selectedPosition)}
            >
              {previewText.substring(0, 15) || 'Text'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Visual Timeline Component
function VisualTimeline({
  overlays,
  videoDuration,
  currentTime,
  selectedOverlayId,
  onSelectOverlay,
  onUpdateOverlay,
}: {
  overlays: TextOverlay[];
  videoDuration: number;
  currentTime: number;
  selectedOverlayId: string | null;
  onSelectOverlay: (id: string) => void;
  onUpdateOverlay: (id: string, updates: Partial<TextOverlay>) => void;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<{ id: string; type: 'start' | 'end' | 'move' } | null>(null);

  const getTimeFromX = (clientX: number): number => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return (x / rect.width) * videoDuration;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const time = getTimeFromX(e.clientX);
    const overlay = overlays.find(o => o.id === isDragging.id);
    if (!overlay) return;

    if (isDragging.type === 'start') {
      const newStart = Math.min(time, (overlay.endTime ?? videoDuration) - 0.5);
      onUpdateOverlay(isDragging.id, { startTime: Math.max(0, newStart) });
    } else if (isDragging.type === 'end') {
      const newEnd = Math.max(time, overlay.startTime + 0.5);
      onUpdateOverlay(isDragging.id, { endTime: newEnd >= videoDuration ? null : newEnd });
    } else if (isDragging.type === 'move') {
      const duration = (overlay.endTime ?? videoDuration) - overlay.startTime;
      const newStart = Math.max(0, Math.min(time - duration / 2, videoDuration - duration));
      onUpdateOverlay(isDragging.id, { 
        startTime: newStart, 
        endTime: newStart + duration >= videoDuration ? null : newStart + duration 
      });
    }
  };

  const handleMouseUp = () => setIsDragging(null);

  // Overlay colors based on index
  const getOverlayColor = (index: number) => {
    const colors = [
      'from-blue-500/80 to-blue-600/80',
      'from-purple-500/80 to-purple-600/80',
      'from-green-500/80 to-green-600/80',
      'from-orange-500/80 to-orange-600/80',
      'from-pink-500/80 to-pink-600/80',
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Timeline</Label>
        <span className="text-xs text-muted-foreground">
          {currentTime.toFixed(1)}s / {videoDuration.toFixed(1)}s
        </span>
      </div>
      
      <div
        ref={timelineRef}
        className="relative h-20 rounded-xl bg-gradient-to-r from-white/5 to-white/10 border border-white/20 overflow-hidden cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Time markers */}
        <div className="absolute inset-x-0 top-0 h-4 flex items-end px-1">
          {[...Array(Math.ceil(videoDuration / 5) + 1)].map((_, i) => {
            const time = i * 5;
            if (time > videoDuration) return null;
            return (
              <div 
                key={i}
                className="absolute text-[10px] text-muted-foreground"
                style={{ left: `${(time / videoDuration) * 100}%` }}
              >
                {time}s
              </div>
            );
          })}
        </div>
        
        {/* Overlay tracks */}
        <div className="absolute inset-x-2 top-6 bottom-2 space-y-1">
          {overlays.map((overlay, index) => {
            const startPercent = (overlay.startTime / videoDuration) * 100;
            const endPercent = ((overlay.endTime ?? videoDuration) / videoDuration) * 100;
            const isSelected = selectedOverlayId === overlay.id;
            
            return (
              <motion.div
                key={overlay.id}
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                className={`absolute h-5 rounded-md bg-gradient-to-r ${getOverlayColor(index)} border ${
                  isSelected ? 'border-white shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'border-white/30'
                } cursor-pointer flex items-center justify-center overflow-hidden group`}
                style={{ 
                  left: `${startPercent}%`, 
                  width: `${endPercent - startPercent}%`,
                  top: `${(index % 3) * 22}px`
                }}
                onClick={() => onSelectOverlay(overlay.id)}
              >
                {/* Drag handles */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/20 hover:bg-white/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  onMouseDown={(e) => { e.stopPropagation(); setIsDragging({ id: overlay.id, type: 'start' }); }}
                >
                  <GripHorizontal className="h-3 w-3 rotate-90" />
                </div>
                
                <span className="text-[10px] font-medium truncate px-3 text-white">
                  {overlay.text}
                </span>
                
                <div
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/20 hover:bg-white/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  onMouseDown={(e) => { e.stopPropagation(); setIsDragging({ id: overlay.id, type: 'end' }); }}
                >
                  <GripHorizontal className="h-3 w-3 rotate-90" />
                </div>
              </motion.div>
            );
          })}
        </div>
        
        {/* Playhead */}
        <motion.div
          className="absolute top-0 bottom-0 w-0.5 bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]"
          style={{ left: `${(currentTime / videoDuration) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function TextOverlayEditor2028({
  overlays,
  onOverlaysChange,
  videoDuration,
  currentTime = 0,
  videoUrl,
}: TextOverlayEditor2028Props) {
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [hoveredAnimation, setHoveredAnimation] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const selectedOverlay = overlays.find(o => o.id === selectedOverlayId);

  const addOverlay = (template?: typeof TEXT_OVERLAY_TEMPLATES[number]) => {
    const newOverlay: TextOverlay = {
      id: `overlay-${Date.now()}`,
      text: template?.text || 'Neuer Text',
      animation: template?.animation || 'fadeIn',
      position: template?.position || 'center',
      startTime: currentTime,
      endTime: null,
      style: template?.style || {
        fontSize: 'md',
        color: '#ffffff',
        backgroundColor: 'transparent',
        shadow: true,
        fontFamily: 'sans-serif',
      },
    };
    onOverlaysChange([...overlays, newOverlay]);
    setSelectedOverlayId(newOverlay.id);
    setShowTemplates(false);
  };

  const updateOverlay = (id: string, updates: Partial<TextOverlay>) => {
    onOverlaysChange(overlays.map(o => o.id === id ? { ...o, ...updates } : o));
  };

  const updateOverlayStyle = (id: string, styleUpdates: Partial<TextOverlay['style']>) => {
    const overlay = overlays.find(o => o.id === id);
    if (overlay) {
      updateOverlay(id, { style: { ...overlay.style, ...styleUpdates } });
    }
  };

  const deleteOverlay = (id: string) => {
    onOverlaysChange(overlays.filter(o => o.id !== id));
    if (selectedOverlayId === id) setSelectedOverlayId(null);
  };

  return (
    <Card className="backdrop-blur-xl bg-white/5 border-white/10 overflow-hidden">
      {/* CSS for animation demos */}
      <style>{`
        @keyframes fadeInDemo {
          0%, 100% { opacity: 0; transform: translateY(5px); }
          50% { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleUpDemo {
          0%, 100% { transform: scale(0.5); opacity: 0.5; }
          50% { transform: scale(1); opacity: 1; }
        }
        @keyframes bounceDemo {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes typewriterDemo {
          0% { width: 0; }
          100% { width: 100%; }
        }
        @keyframes highlightDemo {
          0%, 100% { background: linear-gradient(transparent 60%, rgba(255,215,0,0) 60%); }
          50% { background: linear-gradient(transparent 60%, rgba(255,215,0,0.5) 60%); }
        }
        @keyframes glitchDemo {
          0%, 100% { transform: translateX(0); text-shadow: none; }
          25% { transform: translateX(-2px); text-shadow: 2px 0 #ff00ff; }
          75% { transform: translateX(2px); text-shadow: -2px 0 #00ffff; }
        }
      `}</style>
      
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="p-2 rounded-lg bg-primary/20">
            <Type className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              Text & Overlays
              {overlays.length > 0 && (
                <Badge className="bg-primary/20 text-primary border-primary/30">
                  {overlays.length}
                </Badge>
              )}
            </div>
            <div className="text-xs font-normal text-muted-foreground mt-0.5">
              Professionelle Text-Animationen
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTemplates(!showTemplates)}
            className="ml-auto"
          >
            <Sparkles className="h-4 w-4 mr-1" />
            Vorlagen
          </Button>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-4 space-y-5">
        {/* Quick Templates Panel */}
        <AnimatePresence>
          {showTemplates && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-3 gap-2 pb-4 border-b border-white/10">
                {TEXT_OVERLAY_TEMPLATES.map((template) => (
                  <motion.button
                    key={template.id}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => addOverlay(template)}
                    className="p-3 rounded-lg bg-gradient-to-br from-white/10 to-white/5 border border-white/10 hover:border-primary/50 transition-all text-left group"
                  >
                    <div className="font-medium text-sm group-hover:text-primary transition-colors">
                      {template.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {template.text}
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Visual Timeline */}
        <VisualTimeline
          overlays={overlays}
          videoDuration={videoDuration}
          currentTime={currentTime}
          selectedOverlayId={selectedOverlayId}
          onSelectOverlay={setSelectedOverlayId}
          onUpdateOverlay={updateOverlay}
        />

        {/* Add Button */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => addOverlay()}
          className="w-full p-3 rounded-xl border-2 border-dashed border-white/20 hover:border-primary/50 hover:bg-white/5 transition-all flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          <span className="text-sm font-medium">Neues Text-Overlay</span>
        </motion.button>

        {/* Overlay List */}
        {overlays.length > 0 && (
          <ScrollArea className="h-[120px]">
            <div className="space-y-2">
              {overlays.map((overlay, index) => (
                <motion.div
                  key={overlay.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedOverlayId === overlay.id
                      ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(var(--primary),0.2)]'
                      : 'bg-white/5 border-white/10 hover:border-white/30'
                  }`}
                  onClick={() => setSelectedOverlayId(overlay.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${
                      ['from-blue-500 to-blue-600', 'from-purple-500 to-purple-600', 'from-green-500 to-green-600'][index % 3]
                    } flex items-center justify-center text-white text-xs font-bold`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{overlay.text}</div>
                      <div className="text-xs text-muted-foreground">
                        {overlay.startTime.toFixed(1)}s - {overlay.endTime?.toFixed(1) ?? 'Ende'}s
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-50 hover:opacity-100"
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          const newOverlay = { ...overlay, id: `overlay-${Date.now()}` };
                          onOverlaysChange([...overlays, newOverlay]);
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive opacity-50 hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); deleteOverlay(overlay.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Selected Overlay Editor */}
        <AnimatePresence mode="wait">
          {selectedOverlay && (
            <motion.div
              key={selectedOverlay.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-5 pt-4 border-t border-white/10"
            >
              {/* Text Input */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Text</Label>
                <Input
                  value={selectedOverlay.text}
                  onChange={(e) => updateOverlay(selectedOverlay.id, { text: e.target.value })}
                  placeholder="Text eingeben..."
                  className="bg-white/5 border-white/20 focus:border-primary"
                />
              </div>

              {/* Animation Cards */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Animation</Label>
                <div className="grid grid-cols-3 gap-2">
                  {ANIMATIONS.map((anim) => (
                    <AnimationCard
                      key={anim.id}
                      animation={anim}
                      isSelected={selectedOverlay.animation === anim.id}
                      onSelect={() => updateOverlay(selectedOverlay.id, { animation: anim.id as TextOverlay['animation'] })}
                      isHovered={hoveredAnimation === anim.id}
                      onHover={(h) => setHoveredAnimation(h ? anim.id : null)}
                    />
                  ))}
                </div>
              </div>

              {/* Position Grid */}
              <PositionGrid
                selectedPosition={selectedOverlay.position}
                onSelectPosition={(pos) => updateOverlay(selectedOverlay.id, { position: pos as TextOverlay['position'] })}
                previewText={selectedOverlay.text}
              />

              {/* Style Controls */}
              <div className="grid grid-cols-2 gap-4">
                {/* Font Size */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Größe</Label>
                  <div className="flex gap-1">
                    {FONT_SIZES.map((size) => (
                      <motion.button
                        key={size.id}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => updateOverlayStyle(selectedOverlay.id, { fontSize: size.id as TextOverlay['style']['fontSize'] })}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                          selectedOverlay.style.fontSize === size.id
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-white/5 hover:bg-white/10'
                        }`}
                        style={{ fontSize: size.preview }}
                      >
                        {size.name}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Shadow Toggle */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Schatten</Label>
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
                    <Switch
                      checked={selectedOverlay.style.shadow}
                      onCheckedChange={(v) => updateOverlayStyle(selectedOverlay.id, { shadow: v })}
                    />
                    <span className="text-sm text-muted-foreground">
                      {selectedOverlay.style.shadow ? 'Aktiv' : 'Aus'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Textfarbe</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_COLORS.map((color) => (
                      <motion.button
                        key={color}
                        whileHover={{ scale: 1.15 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => updateOverlayStyle(selectedOverlay.id, { color })}
                        className={`w-7 h-7 rounded-lg border-2 transition-all ${
                          selectedOverlay.style.color === color 
                            ? 'border-white shadow-[0_0_10px_rgba(255,255,255,0.5)]' 
                            : 'border-transparent hover:border-white/50'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Hintergrund</Label>
                  <div className="flex flex-wrap gap-1.5">
                    <motion.button
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => updateOverlayStyle(selectedOverlay.id, { backgroundColor: 'transparent' })}
                      className={`w-7 h-7 rounded-lg border-2 transition-all bg-[repeating-conic-gradient(#808080_0_90deg,transparent_0_180deg)_0_0/8px_8px] ${
                        selectedOverlay.style.backgroundColor === 'transparent' 
                          ? 'border-white shadow-[0_0_10px_rgba(255,255,255,0.5)]' 
                          : 'border-white/20'
                      }`}
                      title="Transparent"
                    />
                    {['rgba(0,0,0,0.7)', 'rgba(255,255,255,0.2)', 'rgba(220,38,38,0.8)', 'rgba(59,130,246,0.8)'].map((color) => (
                      <motion.button
                        key={color}
                        whileHover={{ scale: 1.15 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => updateOverlayStyle(selectedOverlay.id, { backgroundColor: color })}
                        className={`w-7 h-7 rounded-lg border-2 transition-all ${
                          selectedOverlay.style.backgroundColor === color 
                            ? 'border-white shadow-[0_0_10px_rgba(255,255,255,0.5)]' 
                            : 'border-transparent hover:border-white/50'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State */}
        {overlays.length === 0 && !showTemplates && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 mx-auto mb-4 flex items-center justify-center">
              <Type className="h-8 w-8 text-primary/60" />
            </div>
            <p className="font-medium">Keine Text-Overlays</p>
            <p className="text-sm text-muted-foreground mt-1">
              Füge CTAs, Hashtags oder Titel hinzu
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTemplates(true)}
              className="mt-4"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Vorlagen ansehen
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
