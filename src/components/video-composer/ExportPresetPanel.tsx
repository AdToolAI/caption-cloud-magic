import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Loader2, Download, CheckCircle, AlertCircle, Share2,
  Instagram, Youtube, Music2, Sparkles, Smartphone, Monitor, Square, Layers, Crosshair
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface PresetDef {
  key: string;
  platform: string;
  label: string;
  aspect: '9:16' | '16:9' | '1:1' | '4:5';
  width: number;
  height: number;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const PRESETS: PresetDef[] = [
  { key: 'tiktok-9-16', platform: 'tiktok', label: 'TikTok',
    aspect: '9:16', width: 1080, height: 1920, icon: Music2,
    description: 'Vertikal · 1080×1920' },
  { key: 'instagram-reel-9-16', platform: 'instagram', label: 'Reels / Story',
    aspect: '9:16', width: 1080, height: 1920, icon: Instagram,
    description: 'Vertikal · 1080×1920' },
  { key: 'instagram-feed-1-1', platform: 'instagram', label: 'Feed Square',
    aspect: '1:1', width: 1080, height: 1080, icon: Square,
    description: 'Quadrat · 1080×1080' },
  { key: 'instagram-feed-4-5', platform: 'instagram', label: 'Feed Portrait',
    aspect: '4:5', width: 1080, height: 1350, icon: Smartphone,
    description: 'Portrait · 1080×1350' },
  { key: 'youtube-short-9-16', platform: 'youtube', label: 'YouTube Short',
    aspect: '9:16', width: 1080, height: 1920, icon: Youtube,
    description: 'Vertikal · 1080×1920' },
  { key: 'youtube-16-9', platform: 'youtube', label: 'YouTube 16:9',
    aspect: '16:9', width: 1920, height: 1080, icon: Monitor,
    description: 'Landscape · 1920×1080' },
];

interface ExportRow {
  id: string;
  preset_key: string;
  platform: string;
  aspect_ratio: string;
  status: string;
  video_url: string | null;
  error_message: string | null;
  created_at: string;
}

interface ExportPresetPanelProps {
  projectId: string;
  masterReady: boolean;
  currentAspect?: string;
}

const COST_PER_EXPORT = 0.10;

export default function ExportPresetPanel({ projectId, masterReady, currentAspect }: ExportPresetPanelProps) {
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [smartReframe, setSmartReframe] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  // Load saved smart_reframe_enabled preference
  useEffect(() => {
    if (!projectId) return;
    supabase
      .from('composer_projects')
      .select('smart_reframe_enabled')
      .eq('id', projectId)
      .single()
      .then(({ data }) => {
        if (data && typeof (data as any).smart_reframe_enabled === 'boolean') {
          setSmartReframe((data as any).smart_reframe_enabled);
        }
      });
  }, [projectId]);

  const persistSmartReframe = async (next: boolean) => {
    setSmartReframe(next);
    await supabase
      .from('composer_projects')
      .update({ smart_reframe_enabled: next } as any)
      .eq('id', projectId);
  };

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from('composer_exports')
        .select('id, preset_key, platform, aspect_ratio, status, video_url, error_message, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (!cancelled && !error) setExports((data || []) as ExportRow[]);
      if (!cancelled) setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`composer_exports_${projectId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'composer_exports', filter: `project_id=eq.${projectId}` },
        () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const toggleSelect = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelectedKeys(new Set(PRESETS.map(p => p.key)));
  const clearAll = () => setSelectedKeys(new Set());

  const batchCost = useMemo(() => selectedKeys.size * COST_PER_EXPORT, [selectedKeys]);

  const handleBatchExport = async () => {
    if (!masterReady) {
      toast({ title: 'Bitte zuerst rendern', description: 'Erstelle erst dein Hauptvideo.', variant: 'destructive' });
      return;
    }
    if (selectedKeys.size === 0) return;

    setBatchLoading(true);
    try {
      const selectedPresets = PRESETS.filter(p => selectedKeys.has(p.key)).map(p => ({
        key: p.key,
        platform: p.platform,
        aspect: p.aspect,
        width: p.width,
        height: p.height,
        label: p.label,
      }));

      // Block R: When Smart Reframe is on AND target aspect differs from master,
      // ensure subject tracks exist before kicking off the parallel renders.
      const needsTracking = smartReframe && selectedPresets.some(p => p.aspect !== currentAspect);
      if (needsTracking) {
        setAnalyzing(true);
        try {
          const { error: analyzeErr } = await supabase.functions.invoke('analyze-scene-subject', {
            body: { projectId },
          });
          if (analyzeErr) {
            console.warn('[smart-reframe] analyze failed, falling back to center crop', analyzeErr);
            toast({
              title: 'Smart Reframe übersprungen',
              description: 'Subjekt-Tracking fehlgeschlagen — es wird zentriert zugeschnitten.',
            });
          }
        } finally {
          setAnalyzing(false);
        }
      }

      const { data, error } = await supabase.functions.invoke('render-multi-format-batch', {
        body: { projectId, presets: selectedPresets },
      });

      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || 'Batch-Export fehlgeschlagen');
      }

      toast({
        title: `${data.triggered} Formate werden gerendert 🚀`,
        description: `Geschätzte Kosten: €${data.totalCost.toFixed(2)}. Die Versionen erscheinen automatisch, sobald sie fertig sind.`,
      });
      clearAll();
    } catch (err: any) {
      toast({ title: 'Batch-Export fehlgeschlagen', description: err.message, variant: 'destructive' });
    } finally {
      setBatchLoading(false);
    }
  };

  const handleExport = async (preset: PresetDef) => {
    if (!masterReady) {
      toast({ title: 'Bitte zuerst rendern', description: 'Erstelle erst dein Hauptvideo.', variant: 'destructive' });
      return;
    }
    setActiveKey(preset.key);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nicht eingeloggt');

      const { data: row, error: insertErr } = await supabase
        .from('composer_exports')
        .insert({
          user_id: user.id,
          project_id: projectId,
          platform: preset.platform,
          preset_key: preset.key,
          aspect_ratio: preset.aspect,
          width: preset.width,
          height: preset.height,
          status: 'pending',
          estimated_cost_euros: COST_PER_EXPORT,
        })
        .select('id')
        .single();
      if (insertErr || !row) throw new Error(insertErr?.message || 'Export konnte nicht angelegt werden');

      const { data, error } = await supabase.functions.invoke('compose-video-assemble', {
        body: { projectId, aspectOverride: preset.aspect, exportId: row.id },
      });
      if (error || !data?.success) {
        await supabase.from('composer_exports').update({
          status: 'failed',
          error_message: error?.message || data?.error || 'Render fehlgeschlagen',
        }).eq('id', row.id);
        throw new Error(error?.message || data?.error || 'Render fehlgeschlagen');
      }

      toast({
        title: `${preset.label} wird gerendert 🎬`,
        description: 'Du wirst benachrichtigt, sobald das Video fertig ist.',
      });
    } catch (err: any) {
      toast({ title: 'Export fehlgeschlagen', description: err.message, variant: 'destructive' });
    } finally {
      setActiveKey(null);
    }
  };

  const latestByKey = new Map<string, ExportRow>();
  for (const e of exports) {
    if (!latestByKey.has(e.preset_key)) latestByKey.set(e.preset_key, e);
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Share2 className="h-4 w-4 text-primary" />
              Plattform-Versionen
              <Badge variant="secondary" className="ml-2 text-[10px] font-normal">
                Multi-Format Export
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Wähle mehrere Formate aus und exportiere sie in einem Klick (€{COST_PER_EXPORT.toFixed(2)} pro Export)
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={selectedKeys.size === PRESETS.length ? clearAll : selectAll}
              disabled={!masterReady}
            >
              {selectedKeys.size === PRESETS.length ? 'Auswahl löschen' : 'Alle auswählen'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="py-4">
        {/* Block R · Smart Reframe Toggle */}
        <div className="mb-3 p-2.5 rounded-lg border border-primary/20 bg-primary/5 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="h-7 w-7 rounded-md bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
              <Crosshair className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Label htmlFor="smart-reframe" className="text-[12px] font-semibold cursor-pointer">
                  Smart Subject Tracking
                </Label>
                <Badge variant="secondary" className="text-[9px] h-4 px-1 font-normal">
                  AI · Beta
                </Badge>
                {analyzing && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 gap-1 border-primary/40 text-primary">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    Analysiere…
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                Folgt dem Hauptmotiv beim Zuschnitt zwischen Formaten — perfekt für 16:9 → 9:16.
              </p>
            </div>
          </div>
          <Switch
            id="smart-reframe"
            checked={smartReframe}
            onCheckedChange={persistSmartReframe}
            disabled={analyzing || batchLoading}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {PRESETS.map((preset) => {
            const latest = latestByKey.get(preset.key);
            const isActive = activeKey === preset.key;
            const isInFlight = latest?.status === 'pending' || latest?.status === 'rendering';
            const isDone = latest?.status === 'completed' && latest.video_url;
            const isFailed = latest?.status === 'failed';
            const isCurrent = currentAspect === preset.aspect;
            const isSelected = selectedKeys.has(preset.key);
            const Icon = preset.icon;

            return (
              <div
                key={preset.key}
                className={cn(
                  "group relative border rounded-xl bg-card/60 p-3 transition-all cursor-pointer",
                  isSelected
                    ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                    : "border-border/40 hover:border-primary/40 hover:bg-card"
                )}
                onClick={() => masterReady && toggleSelect(preset.key)}
              >
                <div className="flex items-start gap-2.5 mb-2.5">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(preset.key)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={!masterReady}
                    className="mt-1"
                  />
                  <div className="h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                    <Icon className="h-4 w-4 text-foreground/80 group-hover:text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold leading-tight">{preset.label}</p>
                      {isCurrent && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-primary/40 text-primary">
                          Master
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{preset.description}</p>
                  </div>
                </div>

                {isDone ? (
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Badge variant="outline" className="text-[10px] h-5 gap-1 border-emerald-500/40 text-emerald-500 bg-emerald-500/5">
                      <CheckCircle className="h-3 w-3" /> Fertig
                    </Badge>
                    <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs ml-auto">
                      <a href={latest!.video_url!} download target="_blank" rel="noopener noreferrer">
                        <Download className="h-3 w-3 mr-1" /> Download
                      </a>
                    </Button>
                  </div>
                ) : isInFlight ? (
                  <Button size="sm" variant="outline" className="w-full h-8 text-xs" disabled>
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                    Rendert…
                  </Button>
                ) : isFailed ? (
                  <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                    <Badge variant="outline" className="text-[10px] h-5 gap-1 border-destructive/40 text-destructive bg-destructive/5">
                      <AlertCircle className="h-3 w-3" /> Fehlgeschlagen
                    </Badge>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => handleExport(preset)}
                      disabled={isActive || !masterReady}
                      className="w-full h-7 text-xs"
                    >
                      Erneut versuchen
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm" variant="ghost"
                    onClick={(e) => { e.stopPropagation(); handleExport(preset); }}
                    disabled={isActive || !masterReady}
                    className="w-full h-7 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {isActive ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Sparkles className="h-3 w-3 mr-1" />
                    )}
                    Einzeln exportieren
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {/* Sticky Batch Action Bar */}
        {selectedKeys.size > 0 && (
          <div className="mt-4 p-3 rounded-xl border border-primary/40 bg-primary/5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center">
                <Layers className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {selectedKeys.size} Formate ausgewählt
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Geschätzte Kosten: <span className="font-medium text-foreground">€{batchCost.toFixed(2)}</span> · Parallele Verarbeitung
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={clearAll} disabled={batchLoading}>
                Abbrechen
              </Button>
              <Button
                size="sm"
                onClick={handleBatchExport}
                disabled={batchLoading || !masterReady}
                className="gap-1.5 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
              >
                {batchLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Starte…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    {selectedKeys.size} Versionen exportieren
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {!masterReady && (
          <p className="text-[10px] text-muted-foreground mt-3 text-center">
            Erstelle erst dein Hauptvideo, dann kannst du es in einem Klick für jede Plattform exportieren.
          </p>
        )}
        {loading && exports.length === 0 && (
          <p className="text-[10px] text-muted-foreground mt-3 text-center">
            Lade Export-Verlauf…
          </p>
        )}
      </CardContent>
    </Card>
  );
}
