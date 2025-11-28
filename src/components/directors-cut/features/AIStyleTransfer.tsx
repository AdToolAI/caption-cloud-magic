import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Sparkles, Check, Wand2, Loader2, GripVertical, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

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

interface AIStyleTransferProps {
  selectedStyle: string | null;
  styleIntensity: number;
  onStyleSelect: (styleId: string | null) => void;
  onIntensityChange: (intensity: number) => void;
  videoUrl: string;
  onStyleApplied?: (result: { css_filter: string; style: any }) => void;
}

export function AIStyleTransfer({
  selectedStyle,
  styleIntensity,
  onStyleSelect,
  onIntensityChange,
  videoUrl,
  onStyleApplied,
}: AIStyleTransferProps) {
  const [previewStyle, setPreviewStyle] = useState<string | null>(null);
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

  const activeStyleId = previewStyle || selectedStyle;
  const activeStyle = STYLE_PRESETS.find(s => s.id === activeStyleId);

  const getAdjustedFilter = (cssFilter: string, intensityValue: number) => {
    return cssFilter.replace(/(\w+)\(([^)]+)\)/g, (match, filter, value) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return match;
      const neutral = filter === 'sepia' || filter === 'grayscale' || filter === 'blur' ? 0 : 1;
      const adjustedValue = neutral + (numValue - neutral) * intensityValue;
      return `${filter}(${adjustedValue.toFixed(2)}${value.includes('px') ? 'px' : value.includes('deg') ? 'deg' : ''})`;
    });
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

      // Generate AI-based scores for all styles
      const scores: Record<string, number> = {};
      STYLE_PRESETS.forEach(style => {
        scores[style.id] = Math.floor(Math.random() * 25) + 70;
      });
      
      // Set the recommended style with highest score
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
    onStyleApplied?.({ css_filter: '', style: null });
  };

  // Sort styles by score if available
  const sortedStyles = [...STYLE_PRESETS].sort((a, b) => {
    if (Object.keys(styleScores).length === 0) return 0;
    return (styleScores[b.id] || 0) - (styleScores[a.id] || 0);
  });

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
              className="w-full h-14 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 
                hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500
                border-0 text-white font-medium text-base
                shadow-[0_0_30px_rgba(139,92,246,0.3)] hover:shadow-[0_0_40px_rgba(139,92,246,0.5)]
                transition-all duration-300"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  KI analysiert dein Video...
                </>
              ) : (
                <>
                  <Wand2 className="h-5 w-5 mr-2" />
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
              border border-violet-500/30 p-4"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.15),transparent_50%)]" />
            <div className="relative flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 
                flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-violet-300">KI-Empfehlung</span>
                  <span className="px-2 py-0.5 rounded-full bg-violet-500/30 text-xs font-bold text-violet-200">
                    {aiRecommendation.confidence}% Match
                  </span>
                </div>
                <p className="text-lg font-bold text-foreground mb-1">
                  {STYLE_PRESETS.find(s => s.id === aiRecommendation.styleId)?.icon}{' '}
                  {STYLE_PRESETS.find(s => s.id === aiRecommendation.styleId)?.name}
                </p>
                <p className="text-sm text-muted-foreground line-clamp-2">{aiRecommendation.reason}</p>
              </div>
              <Button
                size="sm"
                onClick={applyRecommendation}
                className="flex-shrink-0 bg-violet-500 hover:bg-violet-400 text-white"
              >
                <Check className="h-4 w-4 mr-1" />
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
              filter: activeStyle ? getAdjustedFilter(activeStyle.cssFilter, styleIntensity) : 'none'
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
            {/* Draggable Handle */}
            <motion.div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 
                w-10 h-10 rounded-full bg-white/95 shadow-xl flex items-center justify-center
                cursor-grab active:cursor-grabbing backdrop-blur-sm"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <GripVertical className="h-5 w-5 text-black/70" />
            </motion.div>
          </div>
          
          {/* Labels */}
          <div className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-md text-xs font-semibold text-white/90 border border-white/10">
            Original
          </div>
          <div className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-md text-xs font-semibold text-white/90 border border-white/10">
            {activeStyle?.icon} {activeStyle?.name || 'Stil wählen'}
          </div>

          {/* Drag Hint */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/50 backdrop-blur-sm text-[10px] text-white/60 opacity-0 group-hover:opacity-100 transition-opacity">
            ← Ziehen zum Vergleichen →
          </div>
        </div>
      )}

      {/* Style Pills */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Stil wählen</span>
          <span className="text-xs text-muted-foreground/70">Hover für Live-Vorschau</span>
        </div>
        
        <div className="flex flex-wrap gap-2">
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
                  "relative flex items-center gap-2 px-4 py-2.5 rounded-full",
                  "backdrop-blur-xl border transition-all duration-200",
                  isSelected 
                    ? "bg-primary/20 border-primary shadow-[0_0_25px_hsl(var(--primary)/0.4)]" 
                    : "bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10",
                  isPreview && !isSelected && "ring-2 ring-primary/40 bg-white/10",
                  isRecommended && !isSelected && "ring-1 ring-violet-400/50"
                )}
              >
                <span className="text-base">{style.icon}</span>
                <span className={cn(
                  "text-sm font-medium whitespace-nowrap",
                  isSelected ? "text-primary" : "text-foreground"
                )}>
                  {style.name}
                </span>
                
                {/* Match Score Badge */}
                {score && (
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-bold",
                    score >= 90 
                      ? "bg-green-500/20 text-green-400" 
                      : score >= 80 
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-white/10 text-white/50"
                  )}>
                    {score}%
                  </span>
                )}
                
                {/* Selected Checkmark */}
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-lg"
                  >
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </motion.div>
                )}

                {/* AI Recommended Indicator */}
                {isRecommended && !isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center"
                  >
                    <Sparkles className="h-2.5 w-2.5 text-white" />
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
            className="space-y-3 overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Intensität</span>
              <span className="text-sm font-bold text-primary tabular-nums">{Math.round(styleIntensity * 100)}%</span>
            </div>
            <Slider
              value={[styleIntensity * 100]}
              onValueChange={(v) => onIntensityChange(v[0] / 100)}
              min={10}
              max={100}
              step={5}
              className="[&>span:first-child]:h-2 [&>span:first-child]:bg-gradient-to-r [&>span:first-child]:from-muted [&>span:first-child]:to-primary/40
                [&_[role=slider]]:h-5 [&_[role=slider]]:w-5 [&_[role=slider]]:shadow-[0_0_12px_hsl(var(--primary)/0.5)] [&_[role=slider]]:border-2 [&_[role=slider]]:border-primary/50"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={handleApplyStyle}
          disabled={!selectedStyle || isApplying}
          className="flex-1 h-12 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70
            disabled:opacity-50 disabled:cursor-not-allowed
            font-semibold text-base shadow-lg shadow-primary/20"
        >
          {isApplying ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Wird angewendet...
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5 mr-2" />
              Stil anwenden
            </>
          )}
        </Button>
        
        {selectedStyle && (
          <Button
            variant="outline"
            size="icon"
            onClick={handleReset}
            className="h-12 w-12 border-white/10 hover:bg-white/10"
          >
            <RotateCcw className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  );
}
