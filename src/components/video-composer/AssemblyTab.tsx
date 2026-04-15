import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Download, Palette, Film, Type } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import ColorGradingSelector from './ColorGradingSelector';
import type { AssemblyConfig, ComposerScene, ColorGradingPreset, TransitionStyle } from '@/types/video-composer';
import { CLIP_SOURCE_COSTS } from '@/types/video-composer';

interface AssemblyTabProps {
  project: any;
  assemblyConfig: AssemblyConfig;
  onUpdateAssembly: (config: Partial<AssemblyConfig>) => void;
  scenes: ComposerScene[];
}

export default function AssemblyTab({ project, assemblyConfig, onUpdateAssembly, scenes }: AssemblyTabProps) {
  const [isRendering, setIsRendering] = useState(false);

  const clipCost = scenes.reduce((sum, s) => sum + (CLIP_SOURCE_COSTS[s.clipSource] || 0), 0);
  const voCost = assemblyConfig.voiceover?.enabled ? 0.05 : 0;
  const renderCost = 0.10;
  const totalCost = clipCost + voCost + renderCost;

  const handleRender = async () => {
    setIsRendering(true);
    toast({ title: 'Video-Rendering gestartet', description: 'Dies kann einige Minuten dauern...' });
    // TODO: Call compose-video-assemble edge function
    setTimeout(() => {
      setIsRendering(false);
      toast({ title: 'Rendering', description: 'Assembly Edge Function wird in Phase 5 implementiert' });
    }, 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Color Grading */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" /> Color Grading
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ColorGradingSelector
            value={assemblyConfig.colorGrading}
            onChange={(v) => onUpdateAssembly({ colorGrading: v })}
          />
        </CardContent>
      </Card>

      {/* Transition Style */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" /> Übergangs-Stil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {(['fade', 'crossfade', 'wipe', 'slide', 'zoom', 'none'] as TransitionStyle[]).map((t) => (
              <button
                key={t}
                onClick={() => onUpdateAssembly({ transitionStyle: t })}
                className={`p-2 rounded-lg border text-center transition-all ${
                  assemblyConfig.transitionStyle === t
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/40 hover:border-border text-muted-foreground'
                }`}
              >
                <p className="text-xs font-medium capitalize">{t}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Kinetic Text */}
      <Card className="border-border/40 bg-card/80">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Kinetic Typography</p>
                <p className="text-[10px] text-muted-foreground">Spring-animierte Texteinblendungen statt statischem Text</p>
              </div>
            </div>
            <Switch
              checked={assemblyConfig.kineticText}
              onCheckedChange={(v) => onUpdateAssembly({ kineticText: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Cost Summary */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4">
          <h3 className="text-sm font-semibold mb-3">Kosten-Zusammenfassung</h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{scenes.length} Clips</span>
              <span>€{clipCost.toFixed(2)}</span>
            </div>
            {assemblyConfig.voiceover?.enabled && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Voiceover</span>
                <span>€{voCost.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rendering</span>
              <span>€{renderCost.toFixed(2)}</span>
            </div>
            <div className="border-t border-border/40 pt-1.5 flex justify-between font-semibold text-sm">
              <span>Gesamt</span>
              <span className="text-primary">€{totalCost.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Render Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={handleRender}
          disabled={isRendering || scenes.length === 0}
          className="gap-2"
        >
          {isRendering ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Video wird gerendert...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" /> Video rendern (€{totalCost.toFixed(2)})
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
