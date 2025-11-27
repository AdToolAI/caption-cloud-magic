import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Wand2, RotateCcw, Sparkles } from 'lucide-react';
import { GlobalEffects, AVAILABLE_FILTERS, FilterId } from '@/types/directors-cut';
import { AIStyleTransfer } from '../features/AIStyleTransfer';
import { AIObjectRemoval } from '../features/AIObjectRemoval';
import { AIColorGrading } from '../features/AIColorGrading';
import { SmartCropping } from '../features/SmartCropping';
import { GreenScreenChromaKey } from '../features/GreenScreenChromaKey';
import { SpeedRamping, SpeedKeyframe } from '../features/SpeedRamping';
import { AIVideoUpscaling } from '../features/AIVideoUpscaling';
import { AIFrameInterpolation } from '../features/AIFrameInterpolation';
import { AIVideoRestoration } from '../features/AIVideoRestoration';

interface CropVariant {
  aspectRatio: string;
  enabled: boolean;
  focusPoint: { x: number; y: number };
  autoTrack: boolean;
}

interface ChromaKeySettings {
  enabled: boolean;
  color: string;
  tolerance: number;
  edgeSoftness: number;
  spillSuppression: number;
  backgroundUrl?: string;
}

interface PremiumFeatureCallbacks {
  onStyleTransferChange?: (enabled: boolean, style: string | null) => void;
  onUpscalingChange?: (enabled: boolean, resolution: string) => void;
  onInterpolationChange?: (enabled: boolean, fps: number) => void;
  onRestorationChange?: (enabled: boolean, level: string) => void;
  onObjectRemovalChange?: (enabled: boolean, count: number) => void;
  onColorGradingChange?: (enabled: boolean, grade: string | null) => void;
}

interface VisualEffectsStepProps {
  effects: GlobalEffects;
  onEffectsChange: (effects: GlobalEffects) => void;
  videoUrl: string;
  videoDuration?: number;
  currentTime?: number;
  premiumCallbacks?: PremiumFeatureCallbacks;
}

export function VisualEffectsStep({ 
  effects, 
  onEffectsChange, 
  videoUrl, 
  videoDuration = 30, 
  currentTime = 0,
  premiumCallbacks 
}: VisualEffectsStepProps) {
  const [isAutoEnhancing, setIsAutoEnhancing] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [styleIntensity, setStyleIntensity] = useState(0.8);
  const [removedObjects, setRemovedObjects] = useState<string[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [gradeIntensity, setGradeIntensity] = useState(0.7);
  const [cropVariants, setCropVariants] = useState<CropVariant[]>([]);
  const [chromaKeySettings, setChromaKeySettings] = useState<ChromaKeySettings>({
    enabled: false,
    color: '#00ff00',
    tolerance: 30,
    edgeSoftness: 2,
    spillSuppression: 50,
  });
  const [speedKeyframes, setSpeedKeyframes] = useState<SpeedKeyframe[]>([]);
  
  // Phase 5 states
  const [upscalingSettings, setUpscalingSettings] = useState({
    enabled: false,
    targetResolution: '4k' as '2k' | '4k' | '8k',
    enhanceDetails: true,
    denoiseStrength: 30,
    sharpnessBoost: 20,
  });
  const [interpolationSettings, setInterpolationSettings] = useState({
    enabled: false,
    targetFps: 60 as 60 | 120 | 240,
    motionSmoothing: 50,
    preserveMotionBlur: true,
    slowMotionFactor: 1,
  });
  const [restorationSettings, setRestorationSettings] = useState({
    enabled: false,
    removeGrain: false,
    grainStrength: 50,
    removeScratches: false,
    scratchDetection: 50,
    stabilizeFootage: false,
    stabilizationStrength: 50,
    colorCorrection: false,
    enhanceFaces: false,
    deinterlace: false,
  });

  const handleSliderChange = (key: keyof GlobalEffects, value: number[]) => {
    onEffectsChange({ ...effects, [key]: value[0] });
  };

  const handleFilterSelect = (filterId: FilterId) => {
    onEffectsChange({ ...effects, filter: filterId === 'none' ? undefined : filterId });
  };

  const handleReset = () => {
    onEffectsChange({
      brightness: 100,
      contrast: 100,
      saturation: 100,
      sharpness: 0,
      temperature: 0,
      vignette: 0,
      filter: undefined,
    });
  };

  const handleAutoEnhance = async () => {
    setIsAutoEnhancing(true);
    // Simulate AI auto-enhance
    await new Promise(resolve => setTimeout(resolve, 1500));
    onEffectsChange({
      ...effects,
      brightness: 105,
      contrast: 110,
      saturation: 115,
      sharpness: 15,
      filter: 'cinematic',
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
      {/* Header mit Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Visuelle Effekte</h3>
          <p className="text-sm text-muted-foreground">
            Passe Farben, Filter und visuelle Stile an
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
            {effects.filter && (
              <Badge className="mt-2" variant="secondary">
                <Sparkles className="h-3 w-3 mr-1" />
                {AVAILABLE_FILTERS.find(f => f.id === effects.filter)?.name}
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Controls */}
        <div className="space-y-6">
          {/* Filter/LUT Auswahl */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Filter & LUTs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                {AVAILABLE_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => handleFilterSelect(filter.id)}
                    className={`
                      relative aspect-square rounded-lg overflow-hidden border-2 transition-all
                      ${effects.filter === filter.id || (filter.id === 'none' && !effects.filter)
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/50'
                      }
                    `}
                  >
                    <div 
                      className="absolute inset-0 bg-gradient-to-br from-gray-600 to-gray-800"
                      style={{ filter: filter.preview || 'none' }}
                    />
                    <span className="absolute bottom-0.5 left-0 right-0 text-[10px] text-white text-center font-medium drop-shadow">
                      {filter.name}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Adjustment Sliders */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Farbkorrektur</CardTitle>
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
      </div>

      {/* Premium Features - Phase 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6 border-t">
        <AIStyleTransfer
          selectedStyle={selectedStyle}
          styleIntensity={styleIntensity}
          onStyleSelect={(style) => {
            setSelectedStyle(style);
            premiumCallbacks?.onStyleTransferChange?.(!!style, style);
          }}
          onIntensityChange={setStyleIntensity}
          videoUrl={videoUrl}
        />
        <AIObjectRemoval
          videoUrl={videoUrl}
          onObjectsRemoved={(objects) => {
            setRemovedObjects(objects);
            premiumCallbacks?.onObjectRemovalChange?.(objects.length > 0, objects.length);
          }}
        />
      </div>

      {/* Premium Features - Phase 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6 border-t">
        <AIColorGrading
          selectedGrade={selectedGrade}
          gradeIntensity={gradeIntensity}
          onGradeSelect={(grade) => {
            setSelectedGrade(grade);
            premiumCallbacks?.onColorGradingChange?.(!!grade, grade);
          }}
          onIntensityChange={setGradeIntensity}
          videoUrl={videoUrl}
        />
        <SmartCropping
          sourceAspectRatio="16:9"
          cropVariants={cropVariants}
          onVariantsChange={setCropVariants}
          videoUrl={videoUrl}
        />
      </div>

      {/* Premium Features - Phase 4 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6 border-t">
        <GreenScreenChromaKey
          videoUrl={videoUrl}
          settings={chromaKeySettings}
          onSettingsChange={setChromaKeySettings}
        />
        <SpeedRamping
          videoDuration={videoDuration}
          keyframes={speedKeyframes}
          onKeyframesChange={setSpeedKeyframes}
          currentTime={currentTime}
        />
      </div>

      {/* Premium Features - Phase 5 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6 border-t">
        <AIVideoUpscaling
          settings={upscalingSettings}
          onSettingsChange={(settings) => {
            setUpscalingSettings(settings);
            premiumCallbacks?.onUpscalingChange?.(settings.enabled, settings.targetResolution);
          }}
        />
        <AIFrameInterpolation
          settings={interpolationSettings}
          onSettingsChange={(settings) => {
            setInterpolationSettings(settings);
            premiumCallbacks?.onInterpolationChange?.(settings.enabled, settings.targetFps);
          }}
        />
        <AIVideoRestoration
          settings={restorationSettings}
          onSettingsChange={(settings) => {
            setRestorationSettings(settings);
            premiumCallbacks?.onRestorationChange?.(settings.enabled, settings.enabled ? 'standard' : '');
          }}
        />
      </div>
    </div>
  );
}
