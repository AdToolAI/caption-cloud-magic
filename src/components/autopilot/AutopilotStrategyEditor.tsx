import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Save, X, Plus, Settings as SettingsIcon } from 'lucide-react';
import { useUpsertAutopilotBrief, type AutopilotBrief } from '@/hooks/useAutopilot';

interface Props {
  brief: AutopilotBrief | null | undefined;
}

const ALL_PLATFORMS = ['instagram', 'tiktok', 'facebook', 'linkedin', 'youtube', 'x'];
const ALL_LANGS = ['de', 'en', 'es'];
const TONALITIES = ['professional', 'friendly', 'witty', 'inspirational', 'authoritative'];

const VIDEO_PROVIDERS: { id: string; label: string; perSecCredits: number; bestFor: string }[] = [
  { id: 'hailuo-standard', label: 'Hailuo Standard', perSecCredits: 5, bestFor: 'Schnell · günstig · 6/10s' },
  { id: 'seedance-lite',   label: 'Seedance Lite',   perSecCredits: 6, bestFor: 'Stilisiert · 6–12s' },
  { id: 'kling-std',       label: 'Kling 2.1',       perSecCredits: 8, bestFor: 'Premium-Realismus · 5/10s' },
];
const VIDEO_DURATIONS = [4, 6, 8, 10, 12];
const VIDEO_RATIOS: { id: string; label: string }[] = [
  { id: '9:16', label: '9:16 Reel/Story' },
  { id: '1:1',  label: '1:1 Quadrat' },
  { id: '16:9', label: '16:9 Landscape' },
];

export function AutopilotStrategyEditor({ brief }: Props) {
  const upsert = useUpsertAutopilotBrief();
  const [pillars, setPillars] = useState<string[]>([]);
  const [forbidden, setForbidden] = useState<string[]>([]);
  const [tonality, setTonality] = useState('professional');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>(['de']);
  const [budget, setBudget] = useState(1000);
  const [autoPublish, setAutoPublish] = useState(false);
  const [pillarInput, setPillarInput] = useState('');
  const [forbiddenInput, setForbiddenInput] = useState('');
  // Session E: video defaults
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [videoProvider, setVideoProvider] = useState('hailuo-standard');
  const [videoDuration, setVideoDuration] = useState(6);
  const [videoRatio, setVideoRatio] = useState('9:16');

  useEffect(() => {
    if (!brief) return;
    setPillars(brief.topic_pillars ?? []);
    setForbidden(brief.forbidden_topics ?? []);
    setTonality(brief.tonality ?? 'professional');
    setPlatforms(brief.platforms ?? []);
    setLanguages(brief.languages ?? ['de']);
    setBudget(brief.weekly_credit_budget ?? 1000);
    setAutoPublish(!!brief.auto_publish_enabled);
    setVideoEnabled(!!brief.video_enabled);
    setVideoProvider(brief.video_provider ?? 'hailuo-standard');
    setVideoDuration(brief.video_duration_sec ?? 6);
    setVideoRatio(brief.video_aspect_ratio ?? '9:16');
  }, [brief]);

  const dirty = useMemo(() => {
    if (!brief) return true;
    return (
      JSON.stringify(pillars) !== JSON.stringify(brief.topic_pillars) ||
      JSON.stringify(forbidden) !== JSON.stringify(brief.forbidden_topics) ||
      tonality !== brief.tonality ||
      JSON.stringify(platforms) !== JSON.stringify(brief.platforms) ||
      JSON.stringify(languages) !== JSON.stringify(brief.languages) ||
      budget !== brief.weekly_credit_budget ||
      autoPublish !== brief.auto_publish_enabled ||
      videoEnabled !== !!brief.video_enabled ||
      videoProvider !== (brief.video_provider ?? 'hailuo-standard') ||
      videoDuration !== (brief.video_duration_sec ?? 6) ||
      videoRatio !== (brief.video_aspect_ratio ?? '9:16')
    );
  }, [brief, pillars, forbidden, tonality, platforms, languages, budget, autoPublish, videoEnabled, videoProvider, videoDuration, videoRatio]);

  function togglePlatform(p: string) {
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }
  function toggleLang(l: string) {
    setLanguages((prev) => prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]);
  }
  function addPillar() {
    const v = pillarInput.trim();
    if (!v || pillars.includes(v)) return;
    setPillars([...pillars, v]);
    setPillarInput('');
  }
  function addForbidden() {
    const v = forbiddenInput.trim();
    if (!v || forbidden.includes(v)) return;
    setForbidden([...forbidden, v]);
    setForbiddenInput('');
  }

  function save() {
    upsert.mutate({
      topic_pillars: pillars,
      forbidden_topics: forbidden,
      tonality,
      platforms,
      posts_per_week: brief?.posts_per_week ?? {},
      languages,
      avatar_ids: brief?.avatar_ids ?? [],
      weekly_credit_budget: budget,
      auto_publish_enabled: autoPublish,
      video_enabled: videoEnabled,
      video_provider: videoProvider,
      video_duration_sec: videoDuration,
      video_aspect_ratio: videoRatio,
    });
  }

  if (!brief) {
    return (
      <Card className="p-8 text-center border-dashed">
        <SettingsIcon className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          Noch kein Brief erstellt — bitte zuerst beim ersten Aktivieren den Onboarding-Wizard durchlaufen.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pillars */}
      <Card className="p-5 space-y-3">
        <div>
          <Label className="text-xs uppercase tracking-widest text-muted-foreground">Themen-Pillars</Label>
          <p className="text-[11px] text-muted-foreground mt-1">Kernthemen, um die sich dein Content drehen soll.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {pillars.map((p) => (
            <Badge key={p} variant="secondary" className="gap-1">
              {p}
              <button onClick={() => setPillars(pillars.filter((x) => x !== p))} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {pillars.length === 0 && <span className="text-xs text-muted-foreground">Keine Pillars definiert.</span>}
        </div>
        <div className="flex gap-2">
          <Input
            value={pillarInput}
            onChange={(e) => setPillarInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPillar())}
            placeholder="z. B. Productivity, AI Tools, Brand Building"
            className="text-sm"
          />
          <Button onClick={addPillar} size="sm" variant="outline" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Hinzufügen
          </Button>
        </div>
      </Card>

      {/* Forbidden topics */}
      <Card className="p-5 space-y-3 border-destructive/30">
        <div>
          <Label className="text-xs uppercase tracking-widest text-destructive">Verbotene Themen</Label>
          <p className="text-[11px] text-muted-foreground mt-1">
            Hard-Block: Diese Themen werden nie generiert oder gepostet.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {forbidden.map((t) => (
            <Badge key={t} variant="destructive" className="gap-1">
              {t}
              <button onClick={() => setForbidden(forbidden.filter((x) => x !== t))}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {forbidden.length === 0 && <span className="text-xs text-muted-foreground">Keine Verbote.</span>}
        </div>
        <div className="flex gap-2">
          <Input
            value={forbiddenInput}
            onChange={(e) => setForbiddenInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addForbidden())}
            placeholder="z. B. Politik, Glücksspiel, Wettbewerber-Namen"
            className="text-sm"
          />
          <Button onClick={addForbidden} size="sm" variant="outline" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Sperren
          </Button>
        </div>
      </Card>

      {/* Tonality + Platforms + Languages */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-5 space-y-3">
          <Label className="text-xs uppercase tracking-widest text-muted-foreground">Tonalität</Label>
          <div className="flex flex-wrap gap-1.5">
            {TONALITIES.map((t) => (
              <Button
                key={t}
                variant={tonality === t ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTonality(t)}
                className="capitalize text-xs"
              >
                {t}
              </Button>
            ))}
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <Label className="text-xs uppercase tracking-widest text-muted-foreground">Plattformen</Label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_PLATFORMS.map((p) => (
              <Button
                key={p}
                variant={platforms.includes(p) ? 'default' : 'outline'}
                size="sm"
                onClick={() => togglePlatform(p)}
                className="capitalize text-xs"
              >
                {p}
              </Button>
            ))}
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <Label className="text-xs uppercase tracking-widest text-muted-foreground">Sprachen</Label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_LANGS.map((l) => (
              <Button
                key={l}
                variant={languages.includes(l) ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleLang(l)}
                className="uppercase text-xs"
              >
                {l}
              </Button>
            ))}
          </div>
        </Card>
      </div>

      {/* Budget + Auto-Publish */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <Label htmlFor="budget" className="text-xs uppercase tracking-widest text-muted-foreground">
            Wöchentliches Credit-Budget
          </Label>
          <Input
            id="budget"
            type="number"
            min={100}
            max={50000}
            step={100}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
          />
          <p className="text-[11px] text-muted-foreground">
            Diese Woche verbraucht: {brief.weekly_credits_spent} cr · Reset {new Date(brief.budget_resets_at).toLocaleDateString()}
          </p>
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Auto-Publish</Label>
            <Switch checked={autoPublish} onCheckedChange={setAutoPublish} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {autoPublish
              ? '🟢 Aktiv: Posts werden nach QA-Gate automatisch veröffentlicht.'
              : '🟡 Co-Pilot-Modus: Du musst jeden Slot vor Veröffentlichung freigeben.'}
          </p>
        </Card>
      </div>

      {/* Session E: Video Pipeline */}
      <Card className="p-5 space-y-4 border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/5 to-transparent">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs uppercase tracking-widest text-fuchsia-600">🎬 Video-Pipeline</Label>
            <p className="text-[11px] text-muted-foreground mt-1">
              Wenn aktiv und Slot-Format „video / reel / short / tiktok / story" enthält, rendert der Autopilot ein echtes Video statt eines Bildes.
            </p>
          </div>
          <Switch checked={videoEnabled} onCheckedChange={setVideoEnabled} />
        </div>

        {videoEnabled && (
          <>
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Provider</Label>
              <div className="grid sm:grid-cols-3 gap-2 mt-2">
                {VIDEO_PROVIDERS.map((p) => {
                  const cost = p.perSecCredits * videoDuration;
                  const active = videoProvider === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setVideoProvider(p.id)}
                      className={`text-left p-3 rounded-md border transition ${
                        active
                          ? 'border-fuchsia-500/60 bg-fuchsia-500/10'
                          : 'border-border hover:border-fuchsia-500/30'
                      }`}
                    >
                      <div className="text-sm font-semibold">{p.label}</div>
                      <div className="text-[11px] text-muted-foreground">{p.bestFor}</div>
                      <div className="text-[11px] mt-1 text-fuchsia-600">≈ {cost} cr / Video</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Dauer</Label>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {VIDEO_DURATIONS.map((d) => (
                    <Button
                      key={d}
                      variant={videoDuration === d ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setVideoDuration(d)}
                      className="text-xs"
                    >
                      {d}s
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Seitenverhältnis</Label>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {VIDEO_RATIOS.map((r) => (
                    <Button
                      key={r.id}
                      variant={videoRatio === r.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setVideoRatio(r.id)}
                      className="text-xs"
                    >
                      {r.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground bg-muted/40 rounded p-2 leading-relaxed">
              ⚠️ Video-Renders dauern typischerweise 1–5 Min. Status sichtbar im Slot-Drawer.
              Bei Render-Fehler werden Credits automatisch zurückerstattet.
            </div>
          </>
        )}
      </Card>

      <Separator />

      {/* Sticky save bar */}
      <div className="sticky bottom-4 z-20">
        <Card className="p-3 flex items-center gap-3 bg-card/80 backdrop-blur border-primary/30">
          <span className="text-xs text-muted-foreground flex-1">
            {dirty ? 'Änderungen noch nicht gespeichert' : 'Alle Änderungen gespeichert'}
          </span>
          <Button onClick={save} disabled={!dirty || upsert.isPending} size="sm" className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {upsert.isPending ? 'Speichere…' : 'Strategie speichern'}
          </Button>
        </Card>
      </div>
    </div>
  );
}
