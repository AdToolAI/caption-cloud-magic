import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Loader2, Wand2, Sparkles } from 'lucide-react';

const STYLE_PRESETS = [
  { 
    id: 'cinematic', 
    name: 'Cinematic', 
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
    id: 'vintage', 
    name: 'Vintage Film', 
    description: '70er Jahre Retro-Look',
    preview: 'linear-gradient(135deg, #d4a373 0%, #ccd5ae 100%)',
    intensity: 0.7
  },
  { 
    id: 'neon', 
    name: 'Neon Cyberpunk', 
    description: 'Futuristischer Neon-Stil',
    preview: 'linear-gradient(135deg, #ff006e 0%, #8338ec 50%, #3a86ff 100%)',
    intensity: 0.85
  },
  { 
    id: 'watercolor', 
    name: 'Aquarell', 
    description: 'Weiche Wasserfarben-Optik',
    preview: 'linear-gradient(135deg, #a8dadc 0%, #457b9d 100%)',
    intensity: 0.6
  },
  { 
    id: 'comic', 
    name: 'Comic Art', 
    description: 'Pop-Art Comic-Stil',
    preview: 'linear-gradient(135deg, #ffbe0b 0%, #fb5607 50%, #ff006e 100%)',
    intensity: 0.9
  },
];

interface AIStyleTransferProps {
  selectedStyle: string | null;
  styleIntensity: number;
  onStyleSelect: (styleId: string | null) => void;
  onIntensityChange: (intensity: number) => void;
  videoUrl: string;
}

export function AIStyleTransfer({
  selectedStyle,
  styleIntensity,
  onStyleSelect,
  onIntensityChange,
  videoUrl,
}: AIStyleTransferProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleApplyStyle = async (styleId: string) => {
    setIsProcessing(true);
    onStyleSelect(styleId);
    
    // Simulate style transfer processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsProcessing(false);
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
            onClick={() => onStyleSelect(null)}
          >
            Style entfernen
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
