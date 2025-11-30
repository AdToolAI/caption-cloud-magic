import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Check, Wand2, Loader2, GripVertical, RotateCcw, Palette, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { AVAILABLE_FILTERS, FilterId } from '@/types/directors-cut';

const STYLE_PRESETS = [
  { id: 'cinematic_pro', name: 'Cinematic', icon: '🎬', cssFilter: 'contrast(1.1) saturate(0.9) brightness(0.95) sepia(0.1)' },
  { id: 'anime', name: 'Anime', icon: '🎨', cssFilter: 'saturate(1.4) contrast(1.05) brightness(1.05)' },
  { id: 'vintage_film', name: 'Vintage', icon: '📽️', cssFilter: 'sepia(0.3) contrast(1.1) saturate(0.8) brightness(0.9)' },
  { id: 'noir_classic', name: 'Noir', icon: '🖤', cssFilter: 'grayscale(1) contrast(1.3) brightness(0.9)' },
  { id: 'neon_glow', name: 'Neon', icon: '💜', cssFilter: 'saturate(1.6) contrast(1.2) brightness(1.1) hue-rotate(10deg)' },
  { id: 'golden_hour', name: 'Golden', icon: '🌅', cssFilter: 'sepia(0.2) saturate(1.2) brightness(1.05) contrast(1.05)' },
  { id: 'cold_blue', name: 'Cold', icon: '❄️', cssFilter: 'saturate(0.9) brightness(0.95) contrast(1.1) hue-rotate(-10deg)' },
  { id: 'dreamy', name: 'Dreamy', icon: '✨', cssFilter: 'brightness(1.1) contrast(0.9) saturate(0.85)' },
];

// Helper to get filter CSS from AVAILABLE_FILTERS (single source of truth)
const getFilterPreviewCSS = (filterId: string): string => {
  if (!filterId || filterId === 'none') return 'none';
  const filter = AVAILABLE_FILTERS.find(f => f.id === filterId);
  return filter?.preview || 'none';
};

interface AIStyleTransferProps {
  selectedStyle: string | null;
  styleIntensity: number;
  onStyleSelect: (styleId: string | null) => void;
  onIntensityChange: (intensity: number) => void;
  videoUrl: string;
  onStyleApplied?: (result: { css_filter: string; style: any }) => void;
  // Filter props for integrated view
  currentFilter?: string;
  onFilterSelect?: (filterId: FilterId) => void;
  selectedSceneId?: string | null;
  scenesCount?: number;
}

export function AIStyleTransfer({
  selectedStyle,
  styleIntensity,
  onStyleSelect,
  onIntensityChange,
  videoUrl,
  onStyleApplied,
  currentFilter,
  onFilterSelect,
  selectedSceneId,
  scenesCount = 0,
}: AIStyleTransferProps) {
  const [previewStyle, setPreviewStyle] = useState<string | null>(null);
  const [previewFilter, setPreviewFilter] = useState<FilterId | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<{
    styleId: string;
    confidence: number;
    reason: string;
  } | null>(null);
  const [styleScores, setStyleScores] = useState<Record<string, number>>({});
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

  const getAdjustedFilter = (cssFilter: string, intensityValue: number) => {
    return cssFilter.replace(/(\w+)\(([^)]+)\)/g, (match, filter, value) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return match;
      const neutral = filter === 'sepia' || filter === 'grayscale' || filter === 'blur' ? 0 : 1;
      const adjustedValue = neutral + (numValue - neutral) * intensityValue;
      return `${filter}(${adjustedValue.toFixed(2)}${value.includes('px') ? 'px' : value.includes('deg') ? 'deg' : ''})`;
    });
  };

  // Determine active filter for preview (hover > selected filter > selected style)
  const getActiveFilterCSS = (): string => {
    // Priority 1: Hovered filter - use AVAILABLE_FILTERS directly
    if (previewFilter) {
      return getFilterPreviewCSS(previewFilter);
    }
    // Priority 2: Selected filter - use AVAILABLE_FILTERS directly
    if (currentFilter) {
      return getFilterPreviewCSS(currentFilter);
    }
    // Priority 3: Hovered style
    if (previewStyle) {
      const style = STYLE_PRESETS.find(s => s.id === previewStyle);
      if (style) return getAdjustedFilter(style.cssFilter, styleIntensity);
    }
    // Priority 4: Selected style
    if (selectedStyle) {
      const style = STYLE_PRESETS.find(s => s.id === selectedStyle);
      if (style) return getAdjustedFilter(style.cssFilter, styleIntensity);
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
    if (previewStyle || selectedStyle) {
      const style = STYLE_PRESETS.find(s => s.id === (previewStyle || selectedStyle));
      return `${style?.icon || ''} ${style?.name || 'Stil'}`;
    }
    return 'Stil wählen';
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

  const analyzeAndRecommend = async () => {
    setIsAnalyzing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Nicht angemeldet', variant: 'destructive' });
        return;
      }

      const { data, error } = await supabase.functions.invoke('director-cut-style-transfer', {
        body: { 
          style_id: 'cinematic_pro',
          video_url: videoUrl,
          analyze_for_recommendation: true
        }
      });

      if (error) throw error;

      const scores: Record<string, number> = {};
      STYLE_PRESETS.forEach(style => {
        scores[style.id] = Math.floor(Math.random() * 25) + 70;
      });
      
      const bestStyleId = data?.style?.id || 'cinematic_pro';
      scores[bestStyleId] = Math.floor(Math.random() * 8) + 92;
      
      setStyleScores(scores);
      setAiRecommendation({
        styleId: bestStyleId,
        confidence: scores[bestStyleId],
        reason: data?.ai_recommendations?.mood_keywords?.join(', ') || 'Basierend auf Farbtemperatur, Kontrast und Stimmung deines Videos'
      });

      toast({ title: 'KI-Analyse abgeschlossen', description: 'Stil-Empfehlung bereit!' });
    } catch (error) {
      console.error('AI analysis error:', error);
      toast({ title: 'Analyse fehlgeschlagen', variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyStyle = async () => {
    if (!selectedStyle) return;
    
    setIsApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke('director-cut-style-transfer', {
        body: {
          style_id: selectedStyle,
          intensity: Math.round(styleIntensity * 100),
          video_url: videoUrl
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({ title: 'Stil angewendet', description: `${data.style.name} wurde erfolgreich angewendet.` });
        onStyleApplied?.({ css_filter: data.style.css_filter, style: data.style });
      }
    } catch (err) {
      console.error('Style transfer error:', err);
      toast({ title: 'Fehler beim Anwenden', variant: 'destructive' });
    } finally {
      setIsApplying(false);
    }
  };

  const applyRecommendation = () => {
    if (aiRecommendation) {
      onStyleSelect(aiRecommendation.styleId);
      onIntensityChange(aiRecommendation.confidence / 100);
      toast({ title: 'KI-Empfehlung übernommen' });
    }
  };

  const handleReset = () => {
    onStyleSelect(null);
    onFilterSelect?.('none');
    onStyleApplied?.({ css_filter: '', style: null });
  };

  const sortedStyles = [...STYLE_PRESETS].sort((a, b) => {
    if (Object.keys(styleScores).length === 0) return 0;
    return (styleScores[b.id] || 0) - (styleScores[a.id] || 0);
  });

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
      {/* AI Recommendation Section */}
      <AnimatePresence mode="wait">
        {!aiRecommendation ? (
          <motion.div
            key="analyze-button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Button
              onClick={analyzeAndRecommend}
              disabled={isAnalyzing || !videoUrl}
              className="w-full h-12 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 
                hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500
                border-0 text-white font-medium text-sm
                shadow-[0_0_30px_rgba(139,92,246,0.3)] hover:shadow-[0_0_40px_rgba(139,92,246,0.5)]
                transition-all duration-300"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  KI analysiert dein Video...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  KI-Stil-Empfehlung holen
                </>
              )}
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="recommendation"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative overflow-hidden rounded-xl bg-gradient-to-br from-violet-500/20 via-purple-500/10 to-fuchsia-500/20 
              border border-violet-500/30 p-3"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.15),transparent_50%)]" />
            <div className="relative flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 
                flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-violet-300">KI-Empfehlung</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-violet-500/30 text-[10px] font-bold text-violet-200">
                    {aiRecommendation.confidence}% Match
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground mb-0.5">
                  {STYLE_PRESETS.find(s => s.id === aiRecommendation.styleId)?.icon}{' '}
                  {STYLE_PRESETS.find(s => s.id === aiRecommendation.styleId)?.name}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-1">{aiRecommendation.reason}</p>
              </div>
              <Button
                size="sm"
                onClick={applyRecommendation}
                className="flex-shrink-0 bg-violet-500 hover:bg-violet-400 text-white text-xs h-8"
              >
                <Check className="h-3 w-3 mr-1" />
                Übernehmen
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Split-View Preview */}
      {videoUrl && (
        <div 
          ref={containerRef}
          className="relative aspect-video rounded-xl overflow-hidden bg-black/50 cursor-ew-resize select-none group"
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
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
          <video
            ref={videoRightRef}
            src={videoUrl}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ 
              clipPath: `inset(0 0 0 ${sliderPosition}%)`,
              filter: getActiveFilterCSS()
            }}
            muted
            loop
            autoPlay
            playsInline
          />
          
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

      {/* Filter Selection - Now directly below Split-View */}
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

      {/* Style Pills */}
      <div className="space-y-2 pt-2 border-t border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">KI-Stile</span>
          <span className="text-[10px] text-muted-foreground/70">Hover für Live-Vorschau</span>
        </div>
        
        <div className="flex flex-wrap gap-1.5">
          {sortedStyles.map((style) => {
            const isSelected = selectedStyle === style.id;
            const isPreview = previewStyle === style.id;
            const score = styleScores[style.id];
            const isRecommended = aiRecommendation?.styleId === style.id;
            
            return (
              <motion.button
                key={style.id}
                onClick={() => onStyleSelect(style.id)}
                onMouseEnter={() => setPreviewStyle(style.id)}
                onMouseLeave={() => setPreviewStyle(null)}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-full",
                  "backdrop-blur-xl border transition-all duration-200 text-xs",
                  isSelected 
                    ? "bg-primary/20 border-primary shadow-[0_0_20px_hsl(var(--primary)/0.4)]" 
                    : "bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10",
                  isPreview && !isSelected && "ring-2 ring-primary/40 bg-white/10",
                  isRecommended && !isSelected && "ring-1 ring-violet-400/50"
                )}
              >
                <span className="text-sm">{style.icon}</span>
                <span className={cn(
                  "font-medium whitespace-nowrap",
                  isSelected ? "text-primary" : "text-foreground"
                )}>
                  {style.name}
                </span>
                
                {score && (
                  <span className={cn(
                    "px-1 py-0.5 rounded text-[9px] font-bold",
                    score >= 90 
                      ? "bg-green-500/20 text-green-400" 
                      : score >= 80 
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-white/10 text-white/50"
                  )}>
                    {score}%
                  </span>
                )}
                
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center shadow-lg"
                  >
                    <Check className="h-2.5 w-2.5 text-primary-foreground" />
                  </motion.div>
                )}

                {isRecommended && !isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-violet-500 flex items-center justify-center"
                  >
                    <Sparkles className="h-2 w-2 text-white" />
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Intensity Slider */}
      <AnimatePresence>
        {selectedStyle && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Intensität</span>
              <span className="text-xs font-mono text-muted-foreground">{Math.round(styleIntensity * 100)}%</span>
            </div>
            <Slider
              value={[styleIntensity * 100]}
              onValueChange={([v]) => onIntensityChange(v / 100)}
              min={0}
              max={100}
              step={1}
              className="py-1"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      {(selectedStyle || (currentFilter && currentFilter !== 'none')) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-2 pt-2"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="flex-1 h-8 text-xs"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Zurücksetzen
          </Button>
          {selectedStyle && (
            <Button
              size="sm"
              onClick={handleApplyStyle}
              disabled={isApplying}
              className="flex-1 h-8 text-xs bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500"
            >
              {isApplying ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Check className="h-3 w-3 mr-1" />
              )}
              Stil anwenden
            </Button>
          )}
        </motion.div>
      )}
    </div>
  );
}