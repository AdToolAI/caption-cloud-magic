import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, RefreshCw, ArrowRight, CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { ComposerScene } from '@/types/video-composer';
import { SCENE_TYPE_LABELS, CLIP_SOURCE_LABELS } from '@/types/video-composer';

interface ClipsTabProps {
  scenes: ComposerScene[];
  onUpdateScenes: (scenes: ComposerScene[]) => void;
  onGoToAudio: () => void;
}

const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-muted-foreground', label: 'Ausstehend' },
  generating: { icon: Loader2, color: 'text-accent', label: 'Generiert...' },
  ready: { icon: CheckCircle, color: 'text-green-400', label: 'Fertig' },
  failed: { icon: XCircle, color: 'text-destructive', label: 'Fehlgeschlagen' },
};

export default function ClipsTab({ scenes, onUpdateScenes, onGoToAudio }: ClipsTabProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const allReady = scenes.every((s) => s.clipStatus === 'ready' || s.clipSource === 'upload');
  const readyCount = scenes.filter((s) => s.clipStatus === 'ready').length;

  const handleGenerateAll = async () => {
    setIsGenerating(true);
    toast({ title: 'Clip-Generierung gestartet', description: 'Dies kann einige Minuten dauern...' });
    // TODO: Call compose-video-clips edge function
    // For now, simulate
    setTimeout(() => {
      setIsGenerating(false);
      toast({ title: 'Clip-Generierung', description: 'Edge Function wird in Phase 3 implementiert' });
    }, 2000);
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Summary */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-card/60 border border-border/40">
        <div className="text-xs text-muted-foreground">
          {readyCount}/{scenes.length} Clips fertig
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateAll}
            disabled={isGenerating || scenes.length === 0}
            className="gap-1 text-xs"
          >
            {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Alle Clips generieren
          </Button>
          <Button
            size="sm"
            onClick={onGoToAudio}
            disabled={!allReady && readyCount === 0}
            className="gap-1 text-xs"
          >
            Weiter zu Audio <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Clip Cards */}
      <div className="grid gap-3">
        {scenes.map((scene, i) => {
          const status = statusConfig[scene.clipStatus] || statusConfig.pending;
          const StatusIcon = status.icon;
          return (
            <Card key={scene.id} className="border-border/40 bg-card/80">
              <CardContent className="p-3 flex items-center gap-4">
                {/* Thumbnail */}
                <div className="w-28 h-16 rounded bg-muted/30 border border-border/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {scene.clipUrl ? (
                    <video src={scene.clipUrl} className="w-full h-full object-cover" muted />
                  ) : (
                    <span className="text-[10px] text-muted-foreground/40">Szene {i + 1}</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium">Szene {i + 1}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {SCENE_TYPE_LABELS[scene.sceneType]?.de}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{scene.durationSeconds}s</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {scene.aiPrompt || scene.stockKeywords || 'Kein Prompt'}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {CLIP_SOURCE_LABELS[scene.clipSource]?.de}
                  </p>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2">
                  <StatusIcon className={`h-4 w-4 ${status.color} ${scene.clipStatus === 'generating' ? 'animate-spin' : ''}`} />
                  <span className={`text-[10px] ${status.color}`}>{status.label}</span>
                </div>

                {/* Actions */}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={scene.clipStatus === 'generating'}
                  onClick={() => {
                    // TODO: regenerate single clip
                    toast({ title: 'Regenerierung wird in Phase 3 implementiert' });
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
