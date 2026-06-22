/**
 * AvatarDefaultPerformanceCard — Phase 3.3.
 *
 * Lets the user set a *character-level* default Performance Layer
 * (Expression / Gesture / Gaze / Energy). The Composer merges
 * `scene.performance[charId]` > `character.default_performance` > empty
 * via `derivePerformanceEntries`, so these defaults take effect in every
 * scene the avatar appears in unless the scene overrides them.
 *
 * Pure UI + a single supabase update. No coupling to the Composer code,
 * and never touches voice / lip-sync / portrait.
 */
import { useState } from 'react';
import { Sparkles, Eye, Hand, Smile, Zap, Trash2, Check, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type {
  PerformanceEnergy,
  PerformanceExpression,
  PerformanceGaze,
  PerformanceGesture,
  ScenePerformance,
} from '@/types/video-composer';

interface Props {
  avatarId: string;
  /** Initial default performance read from `brand_characters.default_performance`. */
  initial?: ScenePerformance | null;
}

const UNSET = '__unset__';

const EXPRESSIONS: Array<{ value: PerformanceExpression; label: string }> = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'warm-smile', label: 'Warm smile' },
  { value: 'curious', label: 'Curious' },
  { value: 'concerned', label: 'Concerned' },
  { value: 'confident', label: 'Confident' },
  { value: 'surprised', label: 'Surprised' },
];
const GESTURES: Array<{ value: PerformanceGesture; label: string }> = [
  { value: 'still', label: 'Still' },
  { value: 'hand-on-chin', label: 'Hand on chin' },
  { value: 'open-palms', label: 'Open palms' },
  { value: 'point', label: 'Pointing' },
  { value: 'cross-arms', label: 'Arms crossed' },
  { value: 'lean-in', label: 'Leans in' },
];
const GAZES: Array<{ value: PerformanceGaze; label: string }> = [
  { value: 'to-camera', label: 'To camera' },
  { value: 'to-speaker', label: 'To other speaker' },
  { value: 'away', label: 'Away' },
  { value: 'down-thinking', label: 'Down, thinking' },
];

function clean(p: ScenePerformance): ScenePerformance | null {
  const { expression, gesture, gaze, energy } = p;
  if (!expression && !gesture && !gaze && !energy) return null;
  return p;
}

export function AvatarDefaultPerformanceCard({ avatarId, initial }: Props) {
  const qc = useQueryClient();
  const [perf, setPerf] = useState<ScenePerformance>(() => initial ?? {});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const patch = (next: Partial<ScenePerformance>) => {
    setPerf((cur) => ({ ...cur, ...next }));
    setDirty(true);
  };

  const clear = () => {
    setPerf({});
    setDirty(true);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const value = clean(perf);
      const { error } = await supabase
        .from('brand_characters')
        .update({ default_performance: value } as any)
        .eq('id', avatarId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['avatar-detail', avatarId] });
      await qc.invalidateQueries({ queryKey: ['brand-characters'] });
      setDirty(false);
      toast.success('Default performance saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save default performance');
    } finally {
      setSaving(false);
    }
  };

  const hasAny = !!(perf.expression || perf.gesture || perf.gaze || perf.energy);

  return (
    <Card className="p-4 bg-card/60 border-primary/15 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary/80" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold leading-tight">Default performance</h3>
          <p className="text-[10px] text-muted-foreground/80 leading-snug">
            Applied automatically in every Composer scene this avatar appears in. Per-scene settings override these.
          </p>
        </div>
        {hasAny && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-rose-400"
            onClick={clear}
          >
            <Trash2 className="h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field
          icon={Smile}
          label="Expression"
          value={perf.expression ?? UNSET}
          options={EXPRESSIONS}
          onChange={(v) =>
            patch({ expression: v === UNSET ? undefined : (v as PerformanceExpression) })
          }
        />
        <Field
          icon={Hand}
          label="Gesture"
          value={perf.gesture ?? UNSET}
          options={GESTURES}
          onChange={(v) =>
            patch({ gesture: v === UNSET ? undefined : (v as PerformanceGesture) })
          }
        />
        <Field
          icon={Eye}
          label="Gaze"
          value={perf.gaze ?? UNSET}
          options={GAZES}
          onChange={(v) => patch({ gaze: v === UNSET ? undefined : (v as PerformanceGaze) })}
        />
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground uppercase tracking-wide font-medium">
            <Zap className="h-2.5 w-2.5" /> Energy
          </div>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => {
              const active = perf.energy === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() =>
                    patch({ energy: active ? undefined : (n as PerformanceEnergy) })
                  }
                  className={cn(
                    'flex-1 h-7 rounded-sm border text-[10px] font-mono transition-colors',
                    active
                      ? 'border-primary/60 bg-primary/15 text-primary'
                      : 'border-border/40 text-muted-foreground hover:border-primary/40 hover:text-primary/80',
                  )}
                  title={`Energy ${n}/5`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {dirty && (
          <span className="text-[10px] text-amber-400/80 italic">Unsaved changes</span>
        )}
        <Button
          size="sm"
          onClick={save}
          disabled={!dirty || saving}
          className="h-7 px-3 text-[11px] gap-1.5"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Save default
        </Button>
      </div>
    </Card>
  );
}

interface FieldProps {
  icon: typeof Sparkles;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}

function Field({ icon: Icon, label, value, options, onChange }: FieldProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground uppercase tracking-wide font-medium">
        <Icon className="h-2.5 w-2.5" />
        {label}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 text-[10.5px] px-2">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET} className="text-[10.5px] italic text-muted-foreground">
            —
          </SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-[10.5px]">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
