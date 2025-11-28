import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';
import { GlobalEffects, AVAILABLE_FILTERS, FilterId } from '@/types/directors-cut';
import { AIStyleTransfer } from '../features/AIStyleTransfer';

interface StyleLookStepProps {
  effects: GlobalEffects;
  onEffectsChange: (effects: GlobalEffects) => void;
  videoUrl: string;
  onStyleTransferChange?: (enabled: boolean, style: string | null) => void;
}

export function StyleLookStep({ 
  effects, 
  onEffectsChange, 
  videoUrl,
  onStyleTransferChange 
}: StyleLookStepProps) {
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [styleIntensity, setStyleIntensity] = useState(0.8);

  const handleFilterSelect = (filterId: FilterId) => {
    onEffectsChange({ ...effects, filter: filterId === 'none' ? undefined : filterId });
  };

  const getFilterStyle = (): React.CSSProperties => {
    const filter = AVAILABLE_FILTERS.find(f => f.id === effects.filter);
    const baseFilter = filter?.preview || '';
    
    return {
      filter: `
        brightness(${effects.brightness / 100})
        contrast(${effects.contrast / 100})
        saturate(${effects.saturation / 100})
        ${baseFilter}
      `.trim(),
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Style & Look</h3>
        <p className="text-sm text-muted-foreground">
          Wähle einen visuellen Stil für dein Video
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Video Preview */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Live-Vorschau</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              <video
                src={videoUrl}
                className="w-full h-full object-contain"
                style={getFilterStyle()}
                muted
                loop
                autoPlay
                playsInline
              />
            </div>
            {effects.filter && (
              <Badge className="mt-2" variant="secondary">
                <Sparkles className="h-3 w-3 mr-1" />
                {AVAILABLE_FILTERS.find(f => f.id === effects.filter)?.name}
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Filter/LUT Auswahl */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Filter & LUTs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3">
              {AVAILABLE_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => handleFilterSelect(filter.id)}
                  className={`
                    relative aspect-square rounded-lg overflow-hidden border-2 transition-all
                    ${effects.filter === filter.id || (filter.id === 'none' && !effects.filter)
                      ? 'border-primary ring-2 ring-primary/20 scale-105'
                      : 'border-border hover:border-primary/50 hover:scale-102'
                    }
                  `}
                >
                  <div 
                    className="absolute inset-0 bg-gradient-to-br from-gray-600 to-gray-800"
                    style={{ filter: filter.preview || 'none' }}
                  />
                  <span className="absolute bottom-1 left-0 right-0 text-xs text-white text-center font-medium drop-shadow">
                    {filter.name}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Style Transfer */}
      <div className="pt-6 border-t">
        <AIStyleTransfer
          selectedStyle={selectedStyle}
          styleIntensity={styleIntensity}
          onStyleSelect={(style) => {
            setSelectedStyle(style);
            onStyleTransferChange?.(!!style, style);
          }}
          onIntensityChange={setStyleIntensity}
          videoUrl={videoUrl}
        />
      </div>
    </div>
  );
}
