import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Loader2, Wand2, Sparkles, AlertCircle, Check, Film, Palette, Sun, Moon, Zap, Camera, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const STYLE_PRESETS = [
  { 
    id: 'cinematic_pro', 
    name: 'Cinematic', 
    description: 'Hollywood Film-Look',
    icon: Film,
    cssFilter: 'contrast(1.1) saturate(0.9) brightness(0.95)',
    intensity: 0.8
  },
  { 
    id: 'anime', 
    name: 'Anime', 
    description: 'Animation Style',
    icon: Sparkles,
    cssFilter: 'saturate(1.4) contrast(1.2) brightness(1.05)',
    intensity: 0.9
  },
  { 
    id: 'vintage_film', 
    name: 'Vintage', 
    description: '70s Retro',
    icon: Camera,
    cssFilter: 'sepia(0.4) contrast(1.1) brightness(0.95) saturate(0.85)',
    intensity: 0.7
  },
  { 
    id: 'neon_glow', 
    name: 'Neon', 
    description: 'Cyberpunk',
    icon: Zap,
    cssFilter: 'saturate(1.6) contrast(1.3) brightness(1.1) hue-rotate(10deg)',
    intensity: 0.85
  },
  { 
    id: 'golden_hour', 
    name: 'Golden', 
    description: 'Warm Sunset',
    icon: Sun,
    cssFilter: 'sepia(0.25) saturate(1.2) brightness(1.05) contrast(1.05)',
    intensity: 0.6
  },
  { 
    id: 'noir_classic', 
    name: 'Noir', 
    description: 'B&W Drama',
    icon: Moon,
    cssFilter: 'grayscale(1) contrast(1.3) brightness(0.9)',
    intensity: 0.9
  },
  { 
    id: 'vibrant', 
    name: 'Vibrant', 
    description: 'Pop Colors',
    icon: Palette,
    cssFilter: 'saturate(1.5) contrast(1.15) brightness(1.02)',
    intensity: 0.75
  },
];

// Sample image for preview - using a gradient as fallback
const PREVIEW_IMAGE = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=300&h=200&fit=crop';

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleApplyStyle = async (styleId: string) => {
    setIsProcessing(true);
    setError(null);
    onStyleSelect(styleId);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('director-cut-style-transfer', {
        body: {
          style_id: styleId,
          intensity: Math.round(styleIntensity * 100),
          video_url: videoUrl
        }
      });

      if (fnError) throw fnError;

      if (data?.success) {
        toast({
          title: 'Stil angewendet',
          description: `${data.style.name} wurde erfolgreich angewendet.`
        });
        onStyleApplied?.({ css_filter: data.style.css_filter, style: data.style });
      }
    } catch (err) {
      console.error('Style transfer error:', err);
      setError(err instanceof Error ? err.message : 'Stil konnte nicht angewendet werden');
      toast({
        title: 'Fehler beim Anwenden',
        description: 'Bitte versuche es erneut.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveStyle = () => {
    onStyleSelect(null);
    onStyleApplied?.({ css_filter: '', style: null });
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 180;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const currentStyle = STYLE_PRESETS.find(s => s.id === selectedStyle);

  return (
    <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20">
            <Sparkles className="h-4 w-4 text-purple-400" />
          </div>
          AI Style Transfer
          <Badge variant="secondary" className="ml-auto bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-400 border-purple-500/20">
            Premium
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Carousel Container */}
        <div className="relative group">
          {/* Scroll Buttons */}
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-background/90 backdrop-blur-sm border border-border/50 shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110 hover:bg-background"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-background/90 backdrop-blur-sm border border-border/50 shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110 hover:bg-background"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Horizontal Carousel */}
          <div 
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2 -mx-2 px-2"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {STYLE_PRESETS.map((style) => {
              const isSelected = selectedStyle === style.id;
              const Icon = style.icon;
              
              return (
                <button
                  key={style.id}
                  onClick={() => handleApplyStyle(style.id)}
                  disabled={isProcessing}
                  className={cn(
                    "relative flex-shrink-0 snap-center w-[140px] rounded-xl overflow-hidden transition-all duration-300 ease-out group/card",
                    "bg-white/5 backdrop-blur-xl border",
                    isSelected 
                      ? "border-primary/50 ring-2 ring-primary/30 scale-[1.02] shadow-[0_0_30px_rgba(168,85,247,0.2)]" 
                      : "border-white/10 hover:border-white/20 hover:scale-[1.03] hover:shadow-xl",
                    isProcessing && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {/* Image Preview with CSS Filter */}
                  <div className="relative h-20 overflow-hidden">
                    <img 
                      src={PREVIEW_IMAGE}
                      alt={style.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                      style={{ filter: style.cssFilter }}
                    />
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    
                    {/* Selection Indicator */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 p-1 rounded-full bg-primary/90 backdrop-blur-sm animate-in zoom-in-50 duration-200">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="p-3 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn(
                        "h-3.5 w-3.5 transition-colors",
                        isSelected ? "text-primary" : "text-muted-foreground"
                      )} />
                      <span className={cn(
                        "text-xs font-semibold transition-colors",
                        isSelected ? "text-primary" : "text-foreground"
                      )}>
                        {style.name}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      {style.description}
                    </p>
                  </div>
                  
                  {/* Hover Glow Effect */}
                  <div className={cn(
                    "absolute inset-0 opacity-0 transition-opacity duration-300 pointer-events-none",
                    "bg-gradient-to-t from-primary/10 via-transparent to-transparent",
                    "group-hover/card:opacity-100"
                  )} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Scroll Indicators */}
        <div className="flex justify-center gap-1.5">
          {STYLE_PRESETS.map((style, index) => (
            <div
              key={style.id}
              className={cn(
                "h-1 rounded-full transition-all duration-300",
                selectedStyle === style.id 
                  ? "w-4 bg-primary" 
                  : "w-1 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
            />
          ))}
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Intensity Slider - Modern Design */}
        {selectedStyle && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Stil-Intensität</span>
              <Badge variant="outline" className="text-[10px] font-mono">
                {Math.round(styleIntensity * 100)}%
              </Badge>
            </div>
            <div className="relative">
              <Slider
                value={[styleIntensity * 100]}
                onValueChange={(v) => onIntensityChange(v[0] / 100)}
                min={10}
                max={100}
                step={5}
                className="[&>span:first-child]:bg-gradient-to-r [&>span:first-child]:from-muted [&>span:first-child]:to-primary/50"
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {selectedStyle && (
          <div className="flex gap-2 pt-2">
            <Button 
              className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-0 shadow-lg shadow-purple-500/20" 
              size="sm"
              disabled={isProcessing}
              onClick={() => handleApplyStyle(selectedStyle)}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verarbeite...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  {currentStyle?.name} anwenden
                </>
              )}
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleRemoveStyle}
              className="text-muted-foreground hover:text-foreground"
            >
              Reset
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
