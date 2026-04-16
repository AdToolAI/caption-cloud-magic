import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Loader2, Play, RefreshCw, ArrowRight, CheckCircle, XCircle, Clock, Search, Film, DollarSign, Sparkles } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { ComposerScene } from '@/types/video-composer';
import { SCENE_TYPE_LABELS, CLIP_SOURCE_LABELS, getClipCost, QUALITY_LABELS } from '@/types/video-composer';
import { SceneClipProgress } from './SceneClipProgress';

interface ClipsTabProps {
  scenes: ComposerScene[];
  projectId?: string;
  onUpdateScenes: (scenes: ComposerScene[]) => void;
  onGoToAudio: () => void;
  onEnsurePersisted?: () => Promise<{ projectId: string; scenes: ComposerScene[] }>;
}

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: 'text-muted-foreground', bg: 'bg-muted/40 border-border/40', label: 'Ausstehend' },
  generating: { color: 'text-accent', bg: 'bg-accent/15 border-accent/40 animate-pulse', label: 'Generiert…' },
  ready: { color: 'text-green-400', bg: 'bg-green-500/15 border-green-500/40', label: 'Fertig' },
  failed: { color: 'text-destructive', bg: 'bg-destructive/15 border-destructive/40', label: 'Fehlgeschlagen' },
};

export default function ClipsTab({ scenes, projectId, onUpdateScenes, onGoToAudio, onEnsurePersisted }: ClipsTabProps) {
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [singleGenerating, setSingleGenerating] = useState<Record<string, boolean>>({});
  const [stockSearch, setStockSearch] = useState<Record<string, string>>({});
  const [stockResults, setStockResults] = useState<Record<string, any[]>>({});
  const [searchingStock, setSearchingStock] = useState<Record<string, boolean>>({});
  const [previousStatuses, setPreviousStatuses] = useState<Record<string, string>>({});

  const allReady = scenes.every((s) => s.clipStatus === 'ready' || (s.clipSource === 'upload' && s.uploadUrl));
  const readyCount = scenes.filter((s) => s.clipStatus === 'ready' || (s.clipSource === 'upload' && s.uploadUrl)).length;
  const generatingCount = scenes.filter((s) => s.clipStatus === 'generating').length;
  const pendingScenes = scenes.filter(s => s.clipStatus !== 'ready' && s.clipStatus !== 'generating' && !(s.clipSource === 'upload' && s.uploadUrl));
  const progressPercent = scenes.length > 0 ? (readyCount / scenes.length) * 100 : 0;

  // Calculate total cost (only pending AI scenes)
  const remainingCost = pendingScenes.reduce((sum, s) => {
    if (s.clipSource.startsWith('ai-')) {
      return sum + getClipCost(s.clipSource, s.clipQuality || 'standard', s.durationSeconds);
    }
    return sum;
  }, 0);

  // Polling logic — extracted so we can also trigger it immediately
  const pollScenes = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from('composer_scenes')
      .select('id, clip_status, clip_url')
      .eq('project_id', projectId);

    if (!data) return;

    let changed = false;
    const newPrev: Record<string, string> = { ...previousStatuses };
    const updatedScenes = scenes.map((scene, idx) => {
      const dbScene = data.find((d: any) => d.id === scene.id);
      if (dbScene && (dbScene.clip_status !== scene.clipStatus || dbScene.clip_url !== scene.clipUrl)) {
        changed = true;
        // Toast on transition generating → ready
        if (scene.clipStatus === 'generating' && dbScene.clip_status === 'ready') {
          toast({ title: `Szene ${idx + 1} fertig ✓`, description: SCENE_TYPE_LABELS[scene.sceneType]?.de });
        }
        if (scene.clipStatus === 'generating' && dbScene.clip_status === 'failed') {
          toast({ title: `Szene ${idx + 1} fehlgeschlagen`, variant: 'destructive' });
        }
        newPrev[scene.id] = dbScene.clip_status;
        return { ...scene, clipStatus: dbScene.clip_status as ComposerScene['clipStatus'], clipUrl: dbScene.clip_url || scene.clipUrl };
      }
      return scene;
    });
    if (changed) {
      setPreviousStatuses(newPrev);
      onUpdateScenes(updatedScenes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, scenes, onUpdateScenes]);

  // Poll every 3s while generating
  useEffect(() => {
    if (generatingCount === 0) return;
    const interval = setInterval(pollScenes, 3000);
    return () => clearInterval(interval);
  }, [generatingCount, pollScenes]);

  const ensureProject = async (): Promise<{ projectId: string; scenes: ComposerScene[] } | null> => {
    if (projectId) return { projectId, scenes };
    if (!onEnsurePersisted) return null;
    try {
      return await onEnsurePersisted();
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message || 'Projekt konnte nicht gespeichert werden', variant: 'destructive' });
      return null;
    }
  };

  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    try {
      const persisted = await ensureProject();
      if (!persisted) {
        setIsGeneratingAll(false);
        return;
      }
      const { projectId: pid, scenes: pScenes } = persisted;

      const scenesPayload = pScenes
        .filter(s => s.clipStatus !== 'ready' && !(s.clipSource === 'upload' && s.uploadUrl))
        .map(s => ({
          id: s.id,
          clipSource: s.clipSource,
          clipQuality: s.clipQuality || 'standard',
          aiPrompt: s.aiPrompt,
          stockKeywords: s.stockKeywords,
          uploadUrl: s.uploadUrl,
          referenceImageUrl: s.referenceImageUrl,
          durationSeconds: s.durationSeconds,
        }));

      if (scenesPayload.length === 0) {
        toast({ title: 'Alle Clips sind bereits fertig!' });
        setIsGeneratingAll(false);
        return;
      }

      // Optimistically mark AI scenes as generating
      const optimistic = pScenes.map(s => {
        if (scenesPayload.some(p => p.id === s.id) && s.clipSource.startsWith('ai-')) {
          return { ...s, clipStatus: 'generating' as const };
        }
        return s;
      });
      onUpdateScenes(optimistic);

      const { data, error } = await supabase.functions.invoke('compose-video-clips', {
        body: { projectId: pid, scenes: scenesPayload },
      });
      if (error) throw error;

      const updatedScenes = optimistic.map(scene => {
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

      const failedResults = (data?.results || []).filter((r: any) => r.status === 'failed');
      if (failedResults.length > 0) {
        console.error('[ClipsTab] Failed clip details:', failedResults);
        toast({
          title: `${failedResults.length} Clip(s) fehlgeschlagen`,
          description: 'Generierung fehlgeschlagen — bitte erneut versuchen. Details in der Konsole.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Clip-Generierung gestartet',
          description: `${data?.generatingCount || 0} KI-Clips werden generiert (€${remainingCost.toFixed(2)}).`,
        });
      }
      // Trigger immediate poll
      setTimeout(pollScenes, 500);
    } catch (err: any) {
      console.error('Generate clips error:', err);
      toast({ title: 'Fehler', description: 'Clip-Generierung fehlgeschlagen — bitte erneut versuchen.', variant: 'destructive' });
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const handleGenerateSingle = async (scene: ComposerScene) => {
    setSingleGenerating(prev => ({ ...prev, [scene.id]: true }));
    try {
      const persisted = await ensureProject();
      if (!persisted) {
        setSingleGenerating(prev => ({ ...prev, [scene.id]: false }));
        return;
      }
      const { projectId: pid, scenes: pScenes } = persisted;

      // Find the up-to-date scene from persisted list (id may have been replaced)
      const targetScene = pScenes.find(s => s.orderIndex === scene.orderIndex) || scene;

      // Optimistic update
      if (targetScene.clipSource.startsWith('ai-')) {
        const optimistic = pScenes.map(s =>
          s.id === targetScene.id ? { ...s, clipStatus: 'generating' as const } : s
        );
        onUpdateScenes(optimistic);
      }

      const { data, error } = await supabase.functions.invoke('compose-video-clips', {
        body: {
          projectId: pid,
          scenes: [{
            id: targetScene.id,
            clipSource: targetScene.clipSource,
            clipQuality: targetScene.clipQuality || 'standard',
            aiPrompt: targetScene.aiPrompt,
            stockKeywords: targetScene.stockKeywords,
            uploadUrl: targetScene.uploadUrl,
            referenceImageUrl: targetScene.referenceImageUrl,
            durationSeconds: targetScene.durationSeconds,
          }],
        },
      });
      if (error) throw error;

      const result = data?.results?.[0];
      if (result) {
        const updatedScenes = pScenes.map(s =>
          s.id === targetScene.id
            ? { ...s, clipStatus: result.status, clipUrl: result.clipUrl || s.clipUrl, replicatePredictionId: result.predictionId || s.replicatePredictionId }
            : s
        );
        onUpdateScenes(updatedScenes);
      }
      toast({ title: 'Generierung gestartet', description: `Szene ${(targetScene.orderIndex ?? 0) + 1}` });
      setTimeout(pollScenes, 500);
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message, variant: 'destructive' });
    } finally {
      setSingleGenerating(prev => ({ ...prev, [scene.id]: false }));
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

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Summary Bar with Progress */}
      <div className="p-3 rounded-lg bg-card/60 border border-border/40 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xs font-medium">
              {readyCount}/{scenes.length} Clips fertig
            </div>
            {generatingCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-accent">
                <Loader2 className="h-3 w-3 animate-spin" />
                {generatingCount} werden generiert…
              </div>
            )}
            {remainingCost > 0 && (
              <div className="flex items-center gap-1 text-xs text-amber-400">
                <DollarSign className="h-3 w-3" />
                €{remainingCost.toFixed(2)} verbleibend
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateAll}
              disabled={isGeneratingAll || scenes.length === 0 || pendingScenes.length === 0}
              className="gap-1 text-xs"
            >
              {isGeneratingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {pendingScenes.length === 0
                ? 'Alle Clips bereit'
                : `Alle generieren (${pendingScenes.length} • €${remainingCost.toFixed(2)})`}
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
        <Progress value={progressPercent} className="h-1.5" />
      </div>

      {/* Clip Cards */}
      <div className="grid gap-3">
        {scenes.map((scene, i) => {
          const status = statusConfig[scene.clipStatus] || statusConfig.pending;
          const sceneQuality = scene.clipQuality || 'standard';
          const costPerClip = scene.clipSource.startsWith('ai-')
            ? getClipCost(scene.clipSource, sceneQuality, scene.durationSeconds)
            : 0;
          const isUpload = scene.clipSource === 'upload';
          const hasUpload = !!scene.uploadUrl;
          const isAi = scene.clipSource.startsWith('ai-');
          const isStock = scene.clipSource === 'stock';
          const isThisGenerating = singleGenerating[scene.id] || scene.clipStatus === 'generating';

          return (
            <Card key={scene.id} className="border-border/40 bg-card/80 overflow-hidden">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-stretch gap-3">
                  {/* Larger preview slot */}
                  <div className="w-36 h-20 rounded border border-border/30 flex-shrink-0 overflow-hidden">
                    <SceneClipProgress scene={scene} index={i} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-medium">Szene {i + 1}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {SCENE_TYPE_LABELS[scene.sceneType]?.de}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{scene.durationSeconds}s</span>
                        {costPerClip > 0 && (
                          <span className="text-[10px] text-amber-400">€{costPerClip.toFixed(2)}</span>
                        )}
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border ${status.bg} ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-foreground/80 truncate">
                        {scene.aiPrompt || scene.stockKeywords || (isUpload ? 'Eigener Upload' : 'Kein Prompt')}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{CLIP_SOURCE_LABELS[scene.clipSource]?.de}</span>
                        {isAi && (
                          <span className={`px-1.5 py-0 rounded text-[9px] border ${
                            sceneQuality === 'pro'
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                              : 'border-border/40 bg-muted/40 text-muted-foreground'
                          }`}>
                            {QUALITY_LABELS[scene.clipSource][sceneQuality]}
                          </span>
                        )}
                        {scene.clipStatus === 'generating' && isAi && (
                          <span className="text-accent inline-flex items-center gap-1">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            KI rendert ca. 30–60s…
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 justify-center">
                    {/* Pending AI → Generate button */}
                    {isAi && scene.clipStatus === 'pending' && (
                      <Button
                        size="sm"
                        onClick={() => handleGenerateSingle(scene)}
                        disabled={isThisGenerating}
                        className="gap-1 text-[10px] h-7 px-2"
                      >
                        {isThisGenerating ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        Generieren €{costPerClip.toFixed(2)}
                      </Button>
                    )}
                    {/* Failed → Retry */}
                    {scene.clipStatus === 'failed' && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleGenerateSingle(scene)}
                        disabled={isThisGenerating}
                        className="gap-1 text-[10px] h-7 px-2"
                      >
                        {isThisGenerating ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Erneut versuchen
                      </Button>
                    )}
                    {/* Ready → Re-roll */}
                    {scene.clipStatus === 'ready' && isAi && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Neu generieren"
                        disabled={isThisGenerating}
                        onClick={() => handleGenerateSingle(scene)}
                      >
                        {isThisGenerating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                    {/* Generating disabled marker */}
                    {scene.clipStatus === 'generating' && (
                      <Button size="sm" disabled className="gap-1 text-[10px] h-7 px-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Wird generiert…
                      </Button>
                    )}
                    {/* Stock pending */}
                    {isStock && scene.clipStatus !== 'ready' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-[10px] h-7 px-2"
                        onClick={() => {
                          setStockSearch(prev => ({ ...prev, [scene.id]: scene.stockKeywords || scene.aiPrompt || '' }));
                          setStockResults(prev => ({ ...prev, [scene.id]: prev[scene.id] || [] }));
                        }}
                      >
                        <Search className="h-3 w-3" />
                        Stock suchen
                      </Button>
                    )}
                    {/* Upload missing */}
                    {isUpload && !hasUpload && (
                      <span className="text-[10px] text-muted-foreground italic px-2">
                        Datei im Storyboard hochladen
                      </span>
                    )}
                    {/* Stock alt search button (always available) */}
                    {!isStock && scene.clipStatus !== 'generating' && (
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
                    )}
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
