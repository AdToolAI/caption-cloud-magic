import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, GripVertical, RotateCcw, Palette, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { AVAILABLE_FILTERS, FilterId } from '@/types/directors-cut';
import { SVGFilters, SVG_FILTER_IDS, isSVGFilter } from '@/remotion/components/SVGFilters';

// Helper to get filter CSS - uses SVG for creative filters, CSS for basic filters
const getFilterPreviewCSS = (filterId: string): string => {
  if (!filterId || filterId === 'none') return 'none';
  
  // For SVG-based creative filters, use the actual SVG filter reference
  if (isSVGFilter(filterId)) {
    return SVG_FILTER_IDS[filterId];
  }
  
  // For basic CSS filters, use preview from AVAILABLE_FILTERS
  const filter = AVAILABLE_FILTERS.find(f => f.id === filterId);
  return filter?.preview || 'none';
};

interface AIStyleTransferProps {
  videoUrl: string;
  // Filter props for integrated view
  currentFilter?: string;
  onFilterSelect?: (filterId: FilterId) => void;
  selectedSceneId?: string | null;
  scenesCount?: number;
}

export function AIStyleTransfer({
  videoUrl,
  currentFilter,
  onFilterSelect,
  selectedSceneId,
  scenesCount = 0,
}: AIStyleTransferProps) {
  const [previewFilter, setPreviewFilter] = useState<FilterId | null>(null);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoLeftRef = useRef<HTMLVideoElement>(null);
  const videoRightRef = useRef<HTMLVideoElement>(null);

  // Group filters by category
  const basicFilters = AVAILABLE_FILTERS.filter(f => f.category === 'basic' || !f.category);
  const creativeFilters = AVAILABLE_FILTERS.filter(f => f.category === 'creative');

  // Sync videos
  useEffect(() => {
    const syncVideos = () => {
      if (videoLeftRef.current && videoRightRef.current) {
        videoRightRef.current.currentTime = videoLeftRef.current.currentTime;
      }
    };
    
    const leftVideo = videoLeftRef.current;
    if (leftVideo) {
      leftVideo.addEventListener('timeupdate', syncVideos);
      leftVideo.addEventListener('seeked', syncVideos);
    }
    
    return () => {
      if (leftVideo) {
        leftVideo.removeEventListener('timeupdate', syncVideos);
        leftVideo.removeEventListener('seeked', syncVideos);
      }
    };
  }, []);

  // Determine active filter for preview
  const getActiveFilterCSS = (): string => {
    // Priority 1: Hovered filter
    if (previewFilter) {
      return getFilterPreviewCSS(previewFilter);
    }
    // Priority 2: Selected filter
    if (currentFilter) {
      return getFilterPreviewCSS(currentFilter);
    }
    return 'none';
  };

  const getActiveLabel = (): string => {
    if (previewFilter) {
      const filter = AVAILABLE_FILTERS.find(f => f.id === previewFilter);
      return filter?.name || 'Filter';
    }
    if (currentFilter && currentFilter !== 'none') {
      const filter = AVAILABLE_FILTERS.find(f => f.id === currentFilter);
      return filter?.name || 'Filter';
    }
    return 'Filter wählen';
  };

  const handleMouseDown = () => setIsDragging(true);

  useEffect(() => {
    if (isDragging) {
      const handleMove = (e: MouseEvent | TouchEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const x = clientX - rect.left;
        const percentage = Math.max(5, Math.min(95, (x / rect.width) * 100));
        setSliderPosition(percentage);
      };
      
      const handleUp = () => setIsDragging(false);
      
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
      window.addEventListener('touchmove', handleMove);
      window.addEventListener('touchend', handleUp);
      
      return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('touchend', handleUp);
      };
    }
  }, [isDragging]);

  const handleReset = () => {
    onFilterSelect?.('none');
  };

  const renderFilterGrid = (filters: readonly typeof AVAILABLE_FILTERS[number][], startIndex: number = 0) => (
    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
      {filters.map((filter, index) => {
        const isSelected = currentFilter === filter.id || (filter.id === 'none' && !currentFilter);
        const isHovered = previewFilter === filter.id;
        const isCreative = filter.category === 'creative';
        const description = (filter as { description?: string }).description;
        
        return (
          <motion.button
            key={filter.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: (startIndex + index) * 0.015 }}
            whileHover={{ scale: 1.08, y: -3 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onFilterSelect?.(filter.id)}
            onMouseEnter={() => setPreviewFilter(filter.id)}
            onMouseLeave={() => setPreviewFilter(null)}
            className={cn(
              "relative aspect-square rounded-lg overflow-hidden transition-all duration-200 group",
              "backdrop-blur-sm border-2",
              isSelected
                ? "border-primary ring-2 ring-primary/30 shadow-lg shadow-primary/20"
                : isCreative 
                  ? "border-yellow-500/20 hover:border-yellow-500/50"
                  : "border-white/10 hover:border-white/30"
            )}
            title={description}
          >
            {/* Filter Preview Background */}
            <div 
              className="absolute inset-0 bg-gradient-to-br from-gray-600 to-gray-800"
              style={{ filter: filter.preview || 'none' }}
            />
            
            {/* Glassmorphism overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            
            {/* Creative filter indicator */}
            {isCreative && (
              <div className="absolute top-0.5 left-0.5">
                <Zap className="h-2.5 w-2.5 text-yellow-500 drop-shadow-lg" />
              </div>
            )}
            
            {/* Filter Name */}
            <span className="absolute bottom-1 left-0 right-0 text-[9px] text-white text-center font-medium drop-shadow-lg truncate px-0.5">
              {filter.name}
            </span>
            
            {/* Selection Indicator */}
            {isSelected && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center"
              >
                <Check className="h-2.5 w-2.5 text-primary-foreground" />
              </motion.div>
            )}
            
            {/* Hover glow */}
            {isHovered && !isSelected && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn(
                  "absolute inset-0 pointer-events-none",
                  isCreative ? "bg-yellow-500/20" : "bg-primary/15"
                )}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Live Split-View Preview */}
      {videoUrl && (
        <div 
          ref={containerRef}
          className="relative aspect-video rounded-xl overflow-hidden bg-black/50 cursor-ew-resize select-none group"
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          {/* SVG Filter Definitions - MUST be in DOM for url() references to work */}
          <SVGFilters />
          
          {/* Original Video (Full - Background) */}
          <video
            ref={videoLeftRef}
            src={videoUrl}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            loop
            autoPlay
            playsInline
          />
          
          {/* Styled Video (Clipped - Foreground) */}
          {(() => {
            const activeFilter = getActiveFilterCSS();
            return (
              <div 
                className="absolute inset-0"
                style={{ clipPath: `inset(0 0 0 ${sliderPosition}%)` }}
              >
                <video
                  ref={videoRightRef}
                  src={videoUrl}
                  className="w-full h-full object-cover"
                  style={{ 
                    filter: activeFilter,
                    transform: 'translateZ(0)',
                    willChange: 'filter',
                  }}
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              </div>
            );
          })()}
          
          {/* Divider Line */}
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] transition-shadow group-hover:shadow-[0_0_15px_rgba(255,255,255,1)]"
            style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
          >
            <motion.div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 
                w-9 h-9 rounded-full bg-white/95 shadow-xl flex items-center justify-center
                cursor-grab active:cursor-grabbing backdrop-blur-sm"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <GripVertical className="h-4 w-4 text-black/70" />
            </motion.div>
          </div>
          
          {/* Labels */}
          <div className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-black/70 backdrop-blur-md text-[10px] font-semibold text-white/90 border border-white/10">
            Original
          </div>
          <div className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/70 backdrop-blur-md text-[10px] font-semibold text-white/90 border border-white/10">
            {getActiveLabel()}
          </div>

          {/* Drag Hint */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-[9px] text-white/60 opacity-0 group-hover:opacity-100 transition-opacity">
            ← Ziehen zum Vergleichen →
          </div>
        </div>
      )}

      {/* Filter Selection */}
      {onFilterSelect && (
        <div className="space-y-4 pt-2">
          {/* Basic Filters */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Palette className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Klassische Filter</span>
              <span className="text-[10px] text-muted-foreground/60 ml-auto">Hover für Live-Vorschau</span>
            </div>
            {renderFilterGrid(basicFilters, 0)}
          </div>
          
          {/* Creative Filters */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-3.5 w-3.5 text-yellow-500" />
              <span className="text-xs text-muted-foreground font-medium">Kreative Filter</span>
              <Badge variant="outline" className="text-[9px] px-1 py-0 border-yellow-500/50 text-yellow-500 h-4">
                Transformativ
              </Badge>
            </div>
            {renderFilterGrid(creativeFilters, basicFilters.length)}
          </div>

          {/* Scope indicator */}
          {currentFilter && currentFilter !== 'none' && (
            <p className="text-[10px] text-muted-foreground">
              {selectedSceneId 
                ? `Filter auf ausgewählte Szene angewendet`
                : "Filter wird auf das gesamte Video angewendet"
              }
            </p>
          )}
        </div>
      )}

      {/* Reset Button */}
      {currentFilter && currentFilter !== 'none' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="pt-2"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="w-full h-8 text-xs"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Filter zurücksetzen
          </Button>
        </motion.div>
      )}
    </div>
  );
}
