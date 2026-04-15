import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Play, RefreshCw, ArrowRight, CheckCircle, XCircle, Clock, Search, Upload, Film, DollarSign } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { ComposerScene } from '@/types/video-composer';
import { SCENE_TYPE_LABELS, CLIP_SOURCE_LABELS, CLIP_SOURCE_COSTS } from '@/types/video-composer';

interface ClipsTabProps {
  scenes: ComposerScene[];
  projectId?: string;
  onUpdateScenes: (scenes: ComposerScene[]) => void;
  onGoToAudio: () => void;
}

const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-muted-foreground', label: 'Ausstehend' },
  generating: { icon: Loader2, color: 'text-accent', label: 'Generiert...' },
  ready: { icon: CheckCircle, color: 'text-green-400', label: 'Fertig' },
  failed: { icon: XCircle, color: 'text-destructive', label: 'Fehlgeschlagen' },
};

export default function ClipsTab({ scenes, projectId, onUpdateScenes, onGoToAudio }: ClipsTabProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [stockSearch, setStockSearch] = useState<Record<string, string>>({});
  const [stockResults, setStockResults] = useState<Record<string, any[]>>({});
  const [searchingStock, setSearchingStock] = useState<Record<string, boolean>>({});

  const allReady = scenes.every((s) => s.clipStatus === 'ready' || s.clipSource === 'upload');
  const readyCount = scenes.filter((s) => s.clipStatus === 'ready').length;
  const generatingCount = scenes.filter((s) => s.clipStatus === 'generating').length;

  // Calculate total cost
  const totalCost = scenes.reduce((sum, s) => {
    if (s.clipSource.startsWith('ai-')) {
      return sum + s.durationSeconds * (CLIP_SOURCE_COSTS[s.clipSource] || 0);
    }
    return sum;
  }, 0);

  // Poll for generating scenes
  useEffect(() => {
    if (generatingCount === 0) return;

    const interval = setInterval(async () => {
      if (!projectId) return;

      const { data } = await supabase
        .from('composer_scenes')
        .select('id, clip_status, clip_url')
        .eq('project_id', projectId);

      if (data) {
        let changed = false;
        const updatedScenes = scenes.map(scene => {
          const dbScene = data.find((d: any) => d.id === scene.id);
          if (dbScene && (dbScene.clip_status !== scene.clipStatus || dbScene.clip_url !== scene.clipUrl)) {
            changed = true;
            return { ...scene, clipStatus: dbScene.clip_status as ComposerScene['clipStatus'], clipUrl: dbScene.clip_url || scene.clipUrl };
          }
          return scene;
        });
        if (changed) {
          onUpdateScenes(updatedScenes);
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [generatingCount, projectId, scenes, onUpdateScenes]);

  const handleGenerateAll = async () => {
    setIsGenerating(true);

    try {
      const scenesPayload = scenes
        .filter(s => s.clipStatus !== 'ready')
        .map(s => ({
          id: s.id,
          clipSource: s.clipSource,
          aiPrompt: s.aiPrompt,
          stockKeywords: s.stockKeywords,
          uploadUrl: s.uploadUrl,
          durationSeconds: s.durationSeconds,
        }));

      if (scenesPayload.length === 0) {
        toast({ title: 'Alle Clips sind bereits fertig!' });
        setIsGenerating(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('compose-video-clips', {
        body: { projectId, scenes: scenesPayload },
      });

      if (error) throw error;

      // Update local state with generating status
      const updatedScenes = scenes.map(scene => {
        const result = data?.results?.find((r: any) => r.sceneId === scene.id);
        if (result) {
          return {
            ...scene,
            clipStatus: result.status as any,
            clipUrl: result.clipUrl || scene.clipUrl,
            replicatePredictionId: result.predictionId || scene.replicatePredictionId,
          };
        }
        return scene;
      });
      onUpdateScenes(updatedScenes);

      const generating = data?.generatingCount || 0;
      const cost = data?.totalCost || 0;
      toast({
        title: 'Clip-Generierung gestartet',
        description: `${generating} KI-Clips werden generiert (€${cost.toFixed(2)}). Stock-Clips sofort verfügbar.`,
      });
    } catch (err: any) {
      console.error('Generate clips error:', err);
      toast({ title: 'Fehler', description: err.message || 'Clip-Generierung fehlgeschlagen', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSearchStock = async (sceneId: string) => {
    const query = stockSearch[sceneId];
    if (!query) return;

    setSearchingStock(prev => ({ ...prev, [sceneId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('search-stock-videos', {
        body: { query, perPage: 6 },
      });
      if (error) throw error;
      setStockResults(prev => ({ ...prev, [sceneId]: data?.videos || [] }));
    } catch (err) {
      toast({ title: 'Stock-Suche fehlgeschlagen', variant: 'destructive' });
    } finally {
      setSearchingStock(prev => ({ ...prev, [sceneId]: false }));
    }
  };

  const handleSelectStock = (sceneId: string, videoUrl: string) => {
    const updatedScenes = scenes.map(s =>
      s.id === sceneId ? { ...s, clipUrl: videoUrl, clipStatus: 'ready' as const, clipSource: 'stock' as const } : s
    );
    onUpdateScenes(updatedScenes);
    setStockResults(prev => ({ ...prev, [sceneId]: [] }));
    toast({ title: 'Stock-Video ausgewählt' });
  };

  const handleRegenerateScene = async (scene: ComposerScene) => {
    if (!projectId) return;

    try {
      const { data, error } = await supabase.functions.invoke('compose-video-clips', {
        body: {
          projectId,
          scenes: [{
            id: scene.id,
            clipSource: scene.clipSource,
            aiPrompt: scene.aiPrompt,
            stockKeywords: scene.stockKeywords,
            durationSeconds: scene.durationSeconds,
          }],
        },
      });

      if (error) throw error;

      const result = data?.results?.[0];
      if (result) {
        const updatedScenes = scenes.map(s =>
          s.id === scene.id ? { ...s, clipStatus: result.status, clipUrl: result.clipUrl || '', retryCount: s.retryCount + 1 } : s
        );
        onUpdateScenes(updatedScenes);
      }
      toast({ title: 'Regenerierung gestartet' });
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Summary Bar */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-card/60 border border-border/40">
        <div className="flex items-center gap-4">
          <div className="text-xs text-muted-foreground">
            {readyCount}/{scenes.length} Clips fertig
          </div>
          {generatingCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-accent">
              <Loader2 className="h-3 w-3 animate-spin" />
              {generatingCount} werden generiert...
            </div>
          )}
          {totalCost > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              ~€{totalCost.toFixed(2)} KI-Kosten
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateAll}
            disabled={isGenerating || scenes.length === 0 || allReady}
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
          const costPerClip = scene.clipSource.startsWith('ai-')
            ? scene.durationSeconds * (CLIP_SOURCE_COSTS[scene.clipSource] || 0)
            : 0;

          return (
            <Card key={scene.id} className="border-border/40 bg-card/80">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-4">
                  {/* Thumbnail / Preview */}
                  <div className="w-28 h-16 rounded bg-muted/30 border border-border/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {scene.clipUrl ? (
                      <video src={scene.clipUrl} className="w-full h-full object-cover" muted controls />
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
                      {costPerClip > 0 && (
                        <span className="text-[10px] text-amber-400">€{costPerClip.toFixed(2)}</span>
                      )}
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
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Regenerieren"
                      disabled={scene.clipStatus === 'generating'}
                      onClick={() => handleRegenerateScene(scene)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Stock-Alternative suchen"
                      onClick={() => {
                        setStockSearch(prev => ({ ...prev, [scene.id]: scene.stockKeywords || scene.aiPrompt || '' }));
                        setStockResults(prev => ({ ...prev, [scene.id]: prev[scene.id] || [] }));
                      }}
                    >
                      <Film className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Stock Search Inline */}
                {stockSearch[scene.id] !== undefined && (
                  <div className="space-y-2 pt-2 border-t border-border/20">
                    <div className="flex gap-2">
                      <Input
                        value={stockSearch[scene.id]}
                        onChange={(e) => setStockSearch(prev => ({ ...prev, [scene.id]: e.target.value }))}
                        placeholder="Stock-Video suchen..."
                        className="h-7 text-xs"
                        onKeyDown={(e) => e.key === 'Enter' && handleSearchStock(scene.id)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSearchStock(scene.id)}
                        disabled={searchingStock[scene.id]}
                        className="h-7 text-xs gap-1"
                      >
                        {searchingStock[scene.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                        Suchen
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setStockSearch(prev => { const n = { ...prev }; delete n[scene.id]; return n; });
                          setStockResults(prev => { const n = { ...prev }; delete n[scene.id]; return n; });
                        }}
                        className="h-7 text-xs"
                      >
                        ✕
                      </Button>
                    </div>

                    {stockResults[scene.id]?.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {stockResults[scene.id].map((video: any) => (
                          <button
                            key={video.id}
                            onClick={() => handleSelectStock(scene.id, video.url)}
                            className="relative rounded overflow-hidden border border-border/30 hover:border-primary/60 transition-colors group"
                          >
                            <img
                              src={video.thumbnail_url}
                              alt="Stock Video"
                              className="w-full h-16 object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <span className="text-[9px] text-white font-medium">Auswählen</span>
                            </div>
                            <div className="absolute bottom-0.5 right-0.5">
                              <Badge variant="secondary" className="text-[8px] px-1 py-0">
                                {video.duration_sec}s • {video.source}
                              </Badge>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
