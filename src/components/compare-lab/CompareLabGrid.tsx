// Compare Lab — Reusable Grid Component
//
// Renders the full Compare Lab UI: engine picker, prompt + duration,
// start button, 2-6 result cards in a responsive grid (cost badge,
// video player, ⭐ rating, AI Pick highlight, "Set as Winner").
// Used by both the standalone /compare-lab page and the inline
// Composer-tab.

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  Sparkles, Trophy, Star, Loader2, AlertCircle, Crown,
  CheckCircle2, Play, Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCompareLab, type CompareEngine, type CompareLabOutput } from '@/hooks/useCompareLab';

const ENGINE_META: Record<CompareEngine, { name: string; icon: string; costPerSec: number }> = {
  sora:     { name: 'Sora 2',         icon: '🎬', costPerSec: 0.10 },
  kling:    { name: 'Kling 3',        icon: '🎭', costPerSec: 0.15 },
  seedance: { name: 'Seedance 1 Lite', icon: '💃', costPerSec: 0.06 },
  wan:      { name: 'Wan 2.5',        icon: '🎨', costPerSec: 0.10 },
  hailuo:   { name: 'Hailuo 2.3',     icon: '🌊', costPerSec: 0.08 },
  luma:     { name: 'Luma Ray 2',     icon: '✨', costPerSec: 0.12 },
};

const ALL_ENGINES: CompareEngine[] = ['sora', 'kling', 'seedance', 'wan', 'hailuo', 'luma'];

interface CompareLabGridProps {
  /** Optional preset prompt (e.g. from a Composer scene). */
  initialPrompt?: string;
  /** Optional aspect ratio preset. */
  initialAspectRatio?: '16:9' | '9:16' | '1:1';
  /** Optional scene id for linking back to Composer. */
  composerSceneId?: string;
  /** Called when the user picks a winner (manual or AI). */
  onWinnerSelected?: (engine: string, videoUrl: string | null) => void;
  /** Compact mode hides the prompt input (used inline in Composer). */
  compact?: boolean;
}

export default function CompareLabGrid({
  initialPrompt = '',
  initialAspectRatio = '16:9',
  composerSceneId,
  onWinnerSelected,
  compact = false,
}: CompareLabGridProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio);
  const [selectedEngines, setSelectedEngines] = useState<CompareEngine[]>([
    'sora', 'kling', 'seedance',
  ]);

  const {
    run, outputs, isStarting, isJudging, allCompleted, completedCount,
    start, callJudge, setUserWinner, rateOutput,
  } = useCompareLab();

  const totalCost = selectedEngines.reduce(
    (sum, e) => sum + ENGINE_META[e].costPerSec * duration,
    0
  );

  const toggleEngine = (e: CompareEngine) => {
    setSelectedEngines((prev) =>
      prev.includes(e)
        ? prev.filter((x) => x !== e)
        : prev.length >= 6 ? prev : [...prev, e]
    );
  };

  const handleStart = async () => {
    if (!prompt.trim()) return;
    if (selectedEngines.length < 2) return;
    await start({
      prompt: prompt.trim(),
      engines: selectedEngines,
      durationSeconds: duration,
      aspectRatio,
      composerSceneId,
    });
  };

  return (
    <div className="space-y-6">
      {/* Setup Panel */}
      {(!run || compact === false) && (
        <Card className="bg-card/60 backdrop-blur-xl border-white/10">
          <CardContent className="p-4 space-y-4">
            {!compact && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Prompt</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Beschreibe die Szene, die du auf allen Engines vergleichen willst…"
                  className="min-h-[100px] resize-none"
                  disabled={isStarting}
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Engines ({selectedEngines.length}/6)
                </Label>
                <Badge variant="outline" className="text-xs">
                  ~{totalCost.toFixed(2)}€ total
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ALL_ENGINES.map((e) => {
                  const meta = ENGINE_META[e];
                  const isSel = selectedEngines.includes(e);
                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() => toggleEngine(e)}
                      disabled={isStarting}
                      className={cn(
                        "flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-all",
                        isSel
                          ? "bg-primary/15 border-primary/50 text-foreground"
                          : "bg-muted/30 border-border/40 text-muted-foreground hover:border-border"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-base">{meta.icon}</span>
                        <span className="font-medium">{meta.name}</span>
                      </span>
                      <span className="text-[10px] tabular-nums opacity-70">
                        {(meta.costPerSec * duration).toFixed(2)}€
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs flex items-center justify-between">
                  <span>Dauer</span>
                  <span className="tabular-nums">{duration}s</span>
                </Label>
                <Slider
                  min={3}
                  max={10}
                  step={1}
                  value={[duration]}
                  onValueChange={(v) => setDuration(v[0])}
                  disabled={isStarting}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Format</Label>
                <div className="flex gap-1">
                  {(['16:9', '9:16', '1:1'] as const).map((r) => (
                    <Button
                      key={r}
                      type="button"
                      size="sm"
                      variant={aspectRatio === r ? 'default' : 'outline'}
                      onClick={() => setAspectRatio(r)}
                      disabled={isStarting}
                      className="flex-1 h-8 text-xs"
                    >
                      {r}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <Button
              onClick={handleStart}
              disabled={isStarting || !prompt.trim() || selectedEngines.length < 2}
              size="lg"
              className="w-full"
            >
              {isStarting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Starte {selectedEngines.length} Engines…</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Vergleich starten ({totalCost.toFixed(2)}€)</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results Header */}
      {run && outputs.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            {completedCount}/{outputs.length} fertig
            {run.ai_judge_winner_engine && (
              <span className="ml-2 text-primary">
                · 🏆 AI-Pick: <strong>{ENGINE_META[run.ai_judge_winner_engine as CompareEngine]?.name}</strong>
              </span>
            )}
          </div>
          <Button
            onClick={() => callJudge(run.id)}
            disabled={!allCompleted || isJudging || completedCount < 2}
            variant="outline"
            size="sm"
          >
            {isJudging ? (
              <><Loader2 className="h-3 w-3 mr-2 animate-spin" /> Judge analysiert…</>
            ) : (
              <><Wand2 className="h-3 w-3 mr-2" /> AI-Judge: Sieger küren</>
            )}
          </Button>
        </div>
      )}

      {/* AI Reasoning */}
      {run?.ai_judge_reasoning && (
        <Card className="bg-primary/5 border-primary/30">
          <CardContent className="p-4 text-sm">
            <div className="flex items-start gap-2">
              <Trophy className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-primary mb-1">AI-Judge Begründung</div>
                <div className="text-muted-foreground">{run.ai_judge_reasoning}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Grid */}
      {outputs.length > 0 && (
        <div className={cn(
          "grid gap-4",
          outputs.length <= 2 ? "grid-cols-1 md:grid-cols-2" :
          outputs.length <= 4 ? "grid-cols-1 md:grid-cols-2" :
          "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        )}>
          {outputs.map((o) => (
            <OutputCard
              key={o.id}
              output={o}
              onRate={(r, note) => rateOutput(o.id, r, note)}
              onSetWinner={() => {
                setUserWinner(o.run_id, o.engine);
                onWinnerSelected?.(o.engine, o.video_url);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OutputCard({
  output,
  onRate,
  onSetWinner,
}: {
  output: CompareLabOutput;
  onRate: (rating: number, note?: string) => void;
  onSetWinner: () => void;
}) {
  const meta = ENGINE_META[output.engine];
  const isWinner = output.is_user_winner;
  const isAIPick = output.is_ai_pick;
  const isFailed = output.status === 'failed';
  const isLoading = output.status === 'pending' || output.status === 'running';

  return (
    <Card
      className={cn(
        "bg-card/60 backdrop-blur-xl border-white/10 overflow-hidden transition-all",
        isWinner && "ring-2 ring-primary",
        isAIPick && !isWinner && "ring-2 ring-yellow-500/60",
      )}
    >
      <div className="aspect-video bg-muted/30 relative">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Generiert…</span>
          </div>
        )}
        {isFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <span className="text-xs text-muted-foreground">{output.error_message ?? 'Fehler'}</span>
          </div>
        )}
        {output.video_url && (
          <video
            src={output.video_url}
            controls
            playsInline
            className="w-full h-full object-cover"
            poster={output.thumbnail_url ?? undefined}
          />
        )}
        {isAIPick && (
          <div className="absolute top-2 right-2 bg-yellow-500/90 text-yellow-950 text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1">
            <Crown className="h-3 w-3" /> AI Pick
          </div>
        )}
        {isWinner && (
          <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Winner
          </div>
        )}
      </div>

      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">{meta.icon}</span>
            <span className="font-medium text-sm">{meta.name}</span>
          </div>
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {output.cost_euros.toFixed(2)}€
          </Badge>
        </div>

        {output.ai_judge_score !== null && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Wand2 className="h-3 w-3" /> AI-Score: <strong className="text-foreground">{output.ai_judge_score}</strong>/100
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onRate(n)}
                disabled={!output.video_url}
                className="p-0.5 disabled:opacity-30"
              >
                <Star
                  className={cn(
                    "h-3.5 w-3.5 transition-colors",
                    (output.user_rating ?? 0) >= n
                      ? "fill-yellow-500 text-yellow-500"
                      : "text-muted-foreground hover:text-yellow-500/60"
                  )}
                />
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant={isWinner ? 'default' : 'outline'}
            onClick={onSetWinner}
            disabled={!output.video_url || isWinner}
            className="h-7 text-xs"
          >
            {isWinner ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Winner</> : 'Wählen'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
