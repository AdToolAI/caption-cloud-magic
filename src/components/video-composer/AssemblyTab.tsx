import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Download, Palette, Film, Type, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import ColorGradingSelector from './ColorGradingSelector';
import type { AssemblyConfig, ComposerScene, TransitionStyle } from '@/types/video-composer';
import { CLIP_SOURCE_COSTS } from '@/types/video-composer';

interface AssemblyTabProps {
  project: any;
  assemblyConfig: AssemblyConfig;
  onUpdateAssembly: (config: Partial<AssemblyConfig>) => void;
  scenes: ComposerScene[];
}

export default function AssemblyTab({ project, assemblyConfig, onUpdateAssembly, scenes }: AssemblyTabProps) {
  const [isRendering, setIsRendering] = useState(false);
  const [renderResult, setRenderResult] = useState<{ renderId?: string; error?: string } | null>(null);

  const clipCost = scenes.reduce((sum, s) => sum + (CLIP_SOURCE_COSTS[s.clipSource] || 0), 0);
  const voCost = assemblyConfig.voiceover?.enabled ? 0.05 : 0;
  const renderCost = 0.10;
  const totalCost = clipCost + voCost + renderCost;

  const readyClips = scenes.filter(s => s.clipStatus === 'ready' && s.clipUrl);
  const allReady = readyClips.length === scenes.length && scenes.length > 0;

  const handleRender = async () => {
    if (!allReady) {
      toast({ title: 'Clips nicht bereit', description: 'Bitte generiere zuerst alle Clips im Clips-Tab.', variant: 'destructive' });
      return;
    }

    setIsRendering(true);
    setRenderResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('compose-video-assemble', {
        body: { projectId: project?.id },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Assembly fehlgeschlagen');

      setRenderResult({ renderId: data.renderId });
      toast({
        title: 'Video-Rendering gestartet! 🎬',
        description: `${data.scenesCount} Szenen · ${Math.round(data.totalDuration)}s Gesamtdauer`,
      });
    } catch (err: any) {
      setRenderResult({ error: err.message });
      toast({ title: 'Rendering fehlgeschlagen', description: err.message, variant: 'destructive' });
    } finally {
      setIsRendering(false);
    }
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
              <span className="text-muted-foreground">{scenes.length} Clips ({readyClips.length} bereit)</span>
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

      {/* Render result */}
      {renderResult?.renderId && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-medium">Rendering läuft</p>
              <p className="text-[10px] text-muted-foreground">Render-ID: {renderResult.renderId.slice(0, 8)}... — Das Video wird in wenigen Minuten bereit sein.</p>
            </div>
          </CardContent>
        </Card>
      )}
      {renderResult?.error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-medium">Fehler</p>
              <p className="text-[10px] text-muted-foreground">{renderResult.error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Render Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={handleRender}
          disabled={isRendering || !allReady}
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
      {!allReady && scenes.length > 0 && (
        <p className="text-[10px] text-muted-foreground text-right">
          {readyClips.length}/{scenes.length} Clips bereit — alle Clips müssen generiert sein
        </p>
      )}
    </div>
  );
}
