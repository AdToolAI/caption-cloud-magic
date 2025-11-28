import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { RotateCcw, Wand2 } from 'lucide-react';
import { GlobalEffects, AVAILABLE_FILTERS } from '@/types/directors-cut';
import { AIColorGrading } from '../features/AIColorGrading';

interface ColorCorrectionStepProps {
  effects: GlobalEffects;
  onEffectsChange: (effects: GlobalEffects) => void;
  videoUrl: string;
  onColorGradingChange?: (enabled: boolean, grade: string | null) => void;
}

export function ColorCorrectionStep({ 
  effects, 
  onEffectsChange, 
  videoUrl,
  onColorGradingChange 
}: ColorCorrectionStepProps) {
  const [isAutoEnhancing, setIsAutoEnhancing] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [gradeIntensity, setGradeIntensity] = useState(0.7);

  const handleSliderChange = (key: keyof GlobalEffects, value: number[]) => {
    onEffectsChange({ ...effects, [key]: value[0] });
  };

  const handleReset = () => {
    onEffectsChange({
      ...effects,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      sharpness: 0,
      temperature: 0,
      vignette: 0,
    });
  };

  const handleAutoEnhance = async () => {
    setIsAutoEnhancing(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    onEffectsChange({
      ...effects,
      brightness: 105,
      contrast: 110,
      saturation: 115,
      sharpness: 15,
    });
    setIsAutoEnhancing(false);
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Farbkorrektur</h3>
          <p className="text-sm text-muted-foreground">
            Passe Helligkeit, Kontrast und Farben an
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Zurücksetzen
          </Button>
          <Button 
            size="sm" 
            onClick={handleAutoEnhance}
            disabled={isAutoEnhancing}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          >
            <Wand2 className="h-4 w-4 mr-2" />
            {isAutoEnhancing ? 'Analysiere...' : 'AI Auto-Enhance'}
          </Button>
        </div>
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
          </CardContent>
        </Card>

        {/* Adjustment Sliders */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Anpassungen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Helligkeit</Label>
                <span className="text-xs text-muted-foreground">{effects.brightness}%</span>
              </div>
              <Slider
                value={[effects.brightness]}
                onValueChange={(v) => handleSliderChange('brightness', v)}
                min={50}
                max={150}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Kontrast</Label>
                <span className="text-xs text-muted-foreground">{effects.contrast}%</span>
              </div>
              <Slider
                value={[effects.contrast]}
                onValueChange={(v) => handleSliderChange('contrast', v)}
                min={50}
                max={150}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Sättigung</Label>
                <span className="text-xs text-muted-foreground">{effects.saturation}%</span>
              </div>
              <Slider
                value={[effects.saturation]}
                onValueChange={(v) => handleSliderChange('saturation', v)}
                min={0}
                max={200}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Schärfe</Label>
                <span className="text-xs text-muted-foreground">{effects.sharpness}</span>
              </div>
              <Slider
                value={[effects.sharpness]}
                onValueChange={(v) => handleSliderChange('sharpness', v)}
                min={0}
                max={100}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Farbtemperatur</Label>
                <span className="text-xs text-muted-foreground">{effects.temperature > 0 ? `+${effects.temperature}` : effects.temperature}</span>
              </div>
              <Slider
                value={[effects.temperature]}
                onValueChange={(v) => handleSliderChange('temperature', v)}
                min={-50}
                max={50}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Vignette</Label>
                <span className="text-xs text-muted-foreground">{effects.vignette}%</span>
              </div>
              <Slider
                value={[effects.vignette]}
                onValueChange={(v) => handleSliderChange('vignette', v)}
                min={0}
                max={100}
                step={1}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Color Grading */}
      <div className="pt-6 border-t">
        <AIColorGrading
          selectedGrade={selectedGrade}
          gradeIntensity={gradeIntensity}
          onGradeSelect={(grade) => {
            setSelectedGrade(grade);
            onColorGradingChange?.(!!grade, grade);
          }}
          onIntensityChange={setGradeIntensity}
          videoUrl={videoUrl}
        />
      </div>
    </div>
  );
}
