import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Loader2, Palette, Upload, Wand2, Eye, Layers, Globe } from 'lucide-react';

const COLOR_PRESETS = [
  { 
    id: 'teal-orange', 
    name: 'Teal & Orange', 
    description: 'Hollywood Blockbuster',
    shadows: '#1a4d5e',
    highlights: '#ff8c42'
  },
  { 
    id: 'moody-blue', 
    name: 'Moody Blue', 
    description: 'Drama & Thriller',
    shadows: '#1a1a3e',
    highlights: '#6b7fd7'
  },
  { 
    id: 'warm-sunset', 
    name: 'Warm Sunset', 
    description: 'Golden Hour Look',
    shadows: '#4a2c17',
    highlights: '#ffb366'
  },
  { 
    id: 'cold-steel', 
    name: 'Cold Steel', 
    description: 'Sci-Fi & Tech',
    shadows: '#1c2833',
    highlights: '#85c1e9'
  },
  { 
    id: 'forest-green', 
    name: 'Forest Green', 
    description: 'Natur & Dokumentar',
    shadows: '#1d3d1d',
    highlights: '#90c695'
  },
  { 
    id: 'rose-gold', 
    name: 'Rose Gold', 
    description: 'Fashion & Beauty',
    shadows: '#3d2d2d',
    highlights: '#e8b4b8'
  },
];

interface AIColorGradingProps {
  selectedGrade: string | null;
  gradeIntensity: number;
  onGradeSelect: (gradeId: string | null) => void;
  onIntensityChange: (intensity: number) => void;
  videoUrl: string;
  // Scene-specific support
  selectedSceneId?: string | null;
  scenesCount?: number;
}

export function AIColorGrading({
  selectedGrade,
  gradeIntensity,
  onGradeSelect,
  onIntensityChange,
  videoUrl,
  selectedSceneId,
  scenesCount = 0,
}: AIColorGradingProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  
  const isSceneMode = !!selectedSceneId;

  const handleAutoGrade = async () => {
    setIsAnalyzing(true);
    // Simulate AI analysis
    await new Promise(resolve => setTimeout(resolve, 2500));
    onGradeSelect('teal-orange');
    onIntensityChange(0.7);
    setIsAnalyzing(false);
  };

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setReferenceImage(url);
    }
  };

  const handleMatchReference = async () => {
    if (!referenceImage) return;
    setIsAnalyzing(true);
    await new Promise(resolve => setTimeout(resolve, 3000));
    onGradeSelect('warm-sunset');
    onIntensityChange(0.85);
    setIsAnalyzing(false);
  };

  const currentGrade = COLOR_PRESETS.find(g => g.id === selectedGrade);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Palette className="h-4 w-4 text-orange-500" />
          AI Color Grading
          {/* Scene/Global Badge */}
          <Badge 
            variant={isSceneMode ? "default" : "secondary"} 
            className={`ml-2 ${isSceneMode ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : ''}`}
          >
            {isSceneMode ? (
              <>
                <Layers className="h-3 w-3 mr-1" />
                Szene
              </>
            ) : (
              <>
                <Globe className="h-3 w-3 mr-1" />
                Global
              </>
            )}
          </Badge>
          <Badge variant="secondary" className="ml-auto">Premium</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI Auto-Grade Button */}
        <Button
          onClick={handleAutoGrade}
          disabled={isAnalyzing}
          className="w-full bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analysiere Farben...
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4 mr-2" />
              AI Auto-Grading
            </>
          )}
        </Button>

        {/* Reference Image Upload */}
        <div className="space-y-2">
          <label className="text-xs font-medium">Referenzbild für Color Match</label>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={handleReferenceUpload}
                className="hidden"
                id="reference-upload"
              />
              <label
                htmlFor="reference-upload"
                className="flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors"
              >
                {referenceImage ? (
                  <img src={referenceImage} alt="Reference" className="h-12 w-20 object-cover rounded" />
                ) : (
                  <>
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Bild hochladen</span>
                  </>
                )}
              </label>
            </div>
            {referenceImage && (
              <Button
                size="sm"
                onClick={handleMatchReference}
                disabled={isAnalyzing}
              >
                Match
              </Button>
            )}
          </div>
        </div>

        {/* Color Presets Grid */}
        <div className="space-y-2">
          <label className="text-xs font-medium">Farbpaletten</label>
          <div className="grid grid-cols-3 gap-2">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => onGradeSelect(preset.id)}
                className={`
                  relative p-2 rounded-lg border-2 transition-all text-left
                  ${selectedGrade === preset.id 
                    ? 'border-primary ring-2 ring-primary/20' 
                    : 'border-border hover:border-primary/50'
                  }
                `}
              >
                <div className="flex gap-1 mb-2">
                  <div 
                    className="w-6 h-6 rounded-full"
                    style={{ backgroundColor: preset.shadows }}
                  />
                  <div 
                    className="w-6 h-6 rounded-full"
                    style={{ backgroundColor: preset.highlights }}
                  />
                </div>
                <span className="text-[10px] font-medium block">{preset.name}</span>
                <span className="text-[8px] text-muted-foreground">{preset.description}</span>
                {selectedGrade === preset.id && (
                  <Badge className="absolute top-1 right-1 h-4 px-1 text-[8px]">Aktiv</Badge>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Intensity Slider */}
        {selectedGrade && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex justify-between">
              <span className="text-xs font-medium">Grading-Intensität</span>
              <span className="text-xs text-muted-foreground">{Math.round(gradeIntensity * 100)}%</span>
            </div>
            <Slider
              value={[gradeIntensity * 100]}
              onValueChange={(v) => onIntensityChange(v[0] / 100)}
              min={10}
              max={100}
              step={5}
            />
          </div>
        )}

        {/* Before/After Toggle */}
        {selectedGrade && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowComparison(!showComparison)}
          >
            <Eye className="h-4 w-4 mr-2" />
            {showComparison ? 'Vergleich ausblenden' : 'Vorher/Nachher'}
          </Button>
        )}

        {/* Reset */}
        {selectedGrade && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full"
            onClick={() => onGradeSelect(null)}
          >
            {isSceneMode ? 'Szenen-Grading entfernen' : 'Grading entfernen'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
