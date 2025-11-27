import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Loader2, Wand2, Sparkles, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const STYLE_PRESETS = [
  { 
    id: 'cinematic_pro', 
    name: 'Cinematic Pro', 
    description: 'Hollywood Film-Look',
    preview: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    intensity: 0.8
  },
  { 
    id: 'anime', 
    name: 'Anime', 
    description: 'Japanischer Animations-Stil',
    preview: 'linear-gradient(135deg, #ff6b6b 0%, #4ecdc4 100%)',
    intensity: 0.9
  },
  { 
    id: 'vintage_film', 
    name: 'Vintage Film', 
    description: '70er Jahre Retro-Look',
    preview: 'linear-gradient(135deg, #d4a373 0%, #ccd5ae 100%)',
    intensity: 0.7
  },
  { 
    id: 'neon_glow', 
    name: 'Neon Cyberpunk', 
    description: 'Futuristischer Neon-Stil',
    preview: 'linear-gradient(135deg, #ff006e 0%, #8338ec 50%, #3a86ff 100%)',
    intensity: 0.85
  },
  { 
    id: 'golden_hour', 
    name: 'Golden Hour', 
    description: 'Warme Sonnenschein-Optik',
    preview: 'linear-gradient(135deg, #f4a261 0%, #e76f51 100%)',
    intensity: 0.6
  },
  { 
    id: 'noir_classic', 
    name: 'Noir Classic', 
    description: 'Dramatischer S/W Look',
    preview: 'linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%)',
    intensity: 0.9
  },
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [appliedFilter, setAppliedFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setAppliedFilter(data.style.css_filter);
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
    setAppliedFilter(null);
    onStyleApplied?.({ css_filter: '', style: null });
  };

  const currentStyle = STYLE_PRESETS.find(s => s.id === selectedStyle);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          AI Style Transfer
          <Badge variant="secondary" className="ml-auto">Premium</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Style Grid */}
        <div className="grid grid-cols-3 gap-2">
          {STYLE_PRESETS.map((style) => (
            <button
              key={style.id}
              onClick={() => handleApplyStyle(style.id)}
              disabled={isProcessing}
              className={`
                relative p-3 rounded-lg border-2 transition-all text-left
                ${selectedStyle === style.id 
                  ? 'border-primary ring-2 ring-primary/20' 
                  : 'border-border hover:border-primary/50'
                }
                ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <div 
                className="w-full h-12 rounded-md mb-2"
                style={{ background: style.preview }}
              />
              <span className="text-xs font-medium block">{style.name}</span>
              <span className="text-[10px] text-muted-foreground">{style.description}</span>
              {selectedStyle === style.id && (
                <div className="absolute top-1 right-1">
                  <Badge className="h-5 px-1 text-[10px]">Aktiv</Badge>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Applied Filter Info */}
        {appliedFilter && (
          <div className="p-2 bg-muted/50 rounded text-xs text-muted-foreground">
            <strong>CSS Filter:</strong> {appliedFilter}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Intensity Slider */}
        {selectedStyle && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex justify-between">
              <span className="text-xs font-medium">Stil-Intensität</span>
              <span className="text-xs text-muted-foreground">{Math.round(styleIntensity * 100)}%</span>
            </div>
            <Slider
              value={[styleIntensity * 100]}
              onValueChange={(v) => onIntensityChange(v[0] / 100)}
              min={10}
              max={100}
              step={5}
            />
          </div>
        )}

        {/* Apply Button */}
        {selectedStyle && (
          <Button 
            className="w-full" 
            size="sm"
            disabled={isProcessing}
            onClick={() => handleApplyStyle(selectedStyle)}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verarbeite Style Transfer...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                {currentStyle?.name} anwenden
              </>
            )}
          </Button>
        )}

        {/* Reset */}
        {selectedStyle && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full"
            onClick={handleRemoveStyle}
          >
            Style entfernen
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
