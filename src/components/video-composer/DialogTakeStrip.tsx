/**
 * DialogTakeStrip — Phase B: Take-System A/B/C for per-line VO re-rolls.
 *
 * Sits under each parsed dialog block in SceneDialogStudio. Lets the user:
 *   - Generate up to 3 takes (A/B/C) of the SAME line with the assigned voice.
 *   - Preview each take in-place.
 *   - Pick which take is "active" — the active take's audioUrl is reused
 *     during scene render (cinematic-sync / SRS / inline), so we don't pay
 *     for TTS again unless the user re-rolls.
 *   - Delete a take to free a slot.
 *
 * Storage: ComposerScene.dialogTakes[lineKey] = { active, takes[] }
 *   lineKey = `${index}:${fnv1aHash(text)}` (see `dialogTakeKey.ts`).
 */
import { useMemo, useRef, useState } from 'react';
import { Loader2, Play, Pause, Plus, Trash2, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  MAX_TAKES_PER_LINE,
  TAKE_LABELS,
} from '@/lib/talking-head/dialogTakeKey';
import type {
  DialogTake,
  DialogTakeBundle,
  DialogVoiceCfg,
} from '@/types/video-composer';

interface DialogTakeStripProps {
  lineKey: string;
  text: string;
  voiceCfg: DialogVoiceCfg | undefined;
  bundle: DialogTakeBundle | undefined;
  language: 'de' | 'en' | 'es';
  projectId?: string;
  onChange: (next: DialogTakeBundle) => void;
}

const T = {
  de: {
    takes: 'Takes',
    add: 'Take aufnehmen',
    addFirst: 'Take A aufnehmen',
    rerolling: 'Generiere…',
    activeHint: 'Aktiver Take wird beim Rendern verwendet',
    setActive: 'Als aktiv markieren',
    delete: 'Löschen',
    noVoice: 'Stimme wählen, dann Take aufnehmen.',
    failed: 'Take fehlgeschlagen',
    full: `Max ${MAX_TAKES_PER_LINE} Takes — lösche einen, um neu aufzunehmen.`,
  },
  en: {
    takes: 'Takes',
    add: 'Record take',
    addFirst: 'Record Take A',
    rerolling: 'Generating…',
    activeHint: 'Active take is used at render time',
    setActive: 'Set as active',
    delete: 'Delete',
    noVoice: 'Pick a voice first, then record a take.',
    failed: 'Take failed',
    full: `Max ${MAX_TAKES_PER_LINE} takes — delete one to re-record.`,
  },
  es: {
    takes: 'Tomas',
    add: 'Grabar toma',
    addFirst: 'Grabar Toma A',
    rerolling: 'Generando…',
    activeHint: 'La toma activa se usa al renderizar',
    setActive: 'Marcar como activa',
    delete: 'Borrar',
    noVoice: 'Elige una voz, luego graba una toma.',
    failed: 'Toma fallida',
    full: `Máx ${MAX_TAKES_PER_LINE} tomas — borra una para volver a grabar.`,
  },
} as const;

function probeAudioDuration(audioUrl: string, fallbackSec: number): Promise<number> {
  return new Promise((resolve) => {
    try {
      const a = new Audio();
      a.preload = 'metadata';
      let done = false;
      const finish = (d: number) => { if (!done) { done = true; resolve(d); } };
      a.addEventListener('loadedmetadata', () => {
        finish(Number.isFinite(a.duration) && a.duration > 0 ? a.duration : fallbackSec);
      });
      a.addEventListener('error', () => finish(fallbackSec));
      setTimeout(() => finish(fallbackSec), 5000);
      a.src = audioUrl;
    } catch {
      resolve(fallbackSec);
    }
  });
}

export function DialogTakeStrip({
  lineKey,
  text,
  voiceCfg,
  bundle,
  language,
  projectId,
  onChange,
}: DialogTakeStripProps) {
  const t = T[language];
  const { toast } = useToast();
  const takes = useMemo(() => bundle?.takes ?? [], [bundle]);
  const active = bundle?.active ?? null;
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const canAdd = takes.length < MAX_TAKES_PER_LINE && !!voiceCfg?.voiceId && !busy;

  const playOrPause = (take: DialogTake) => {
    if (playing === take.id && audioRef.current) {
      audioRef.current.pause();
      setPlaying(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const a = new Audio(take.audioUrl);
    audioRef.current = a;
    a.onended = () => setPlaying((cur) => (cur === take.id ? null : cur));
    a.onerror = () => setPlaying(null);
    setPlaying(take.id);
    void a.play().catch(() => setPlaying(null));
  };

  const recordTake = async () => {
    if (!voiceCfg?.voiceId) {
      toast({ title: t.noVoice, variant: 'destructive' });
      return;
    }
    if (takes.length >= MAX_TAKES_PER_LINE) {
      toast({ title: t.full, variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const fnName = voiceCfg.engine === 'hume' ? 'generate-voiceover-hume' : 'generate-voiceover';
      const body = voiceCfg.engine === 'hume'
        ? {
            text,
            voiceName: voiceCfg.voiceId,
            provider: voiceCfg.provider || 'HUME_AI',
            projectId,
          }
        : {
            text,
            voiceId: voiceCfg.isCustom ? voiceCfg.elevenlabsVoiceId : voiceCfg.voiceId,
            projectId,
          };
      const { data, error } = await supabase.functions.invoke(fnName, { body });
      if (error) throw error;
      const audioUrl = (data as any)?.audioUrl as string | undefined;
      if (!audioUrl) throw new Error('No audioUrl returned');
      const reported = Number((data as any)?.duration ?? 0);
      const duration = reported > 0
        ? reported
        : await probeAudioDuration(audioUrl, Math.max(1.5, text.length / 18));
      const id = `take_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const newTake: DialogTake = {
        id,
        audioUrl,
        durationSec: Math.round(duration * 100) / 100,
        engine: (voiceCfg.engine ?? 'elevenlabs') as 'elevenlabs' | 'hume',
        voiceId: voiceCfg.voiceId,
        voiceName: voiceCfg.voiceName,
        elevenlabsVoiceId: voiceCfg.elevenlabsVoiceId,
        isCustom: voiceCfg.isCustom,
        provider: voiceCfg.provider,
        createdAt: new Date().toISOString(),
        label: TAKE_LABELS[takes.length],
      };
      const nextBundle: DialogTakeBundle = {
        active: id, // newest take auto-becomes active — what the user just listened for
        takes: [...takes, newTake],
      };
      onChange(nextBundle);
    } catch (e: any) {
      console.error('[DialogTakeStrip] record take error', e);
      toast({
        title: t.failed,
        description: e?.message || String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const setActiveTake = (id: string) => {
    onChange({ active: id, takes });
  };

  const deleteTake = (id: string) => {
    const remaining = takes.filter((tk) => tk.id !== id);
    onChange({
      active: active === id ? (remaining[remaining.length - 1]?.id ?? null) : active,
      takes: remaining,
    });
  };

  // Empty-state: subtle "Take A" pill so it's discoverable but not loud.
  if (takes.length === 0) {
    return (
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-primary"
          disabled={!canAdd}
          onClick={recordTake}
          title={!voiceCfg?.voiceId ? t.noVoice : undefined}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {busy ? t.rerolling : t.addFirst}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1" data-line-key={lineKey}>
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
        {t.takes}
      </span>
      {takes.map((take, i) => {
        const label = take.label ?? TAKE_LABELS[i] ?? `T${i + 1}`;
        const isActive = active === take.id;
        const isPlaying = playing === take.id;
        return (
          <div
            key={take.id}
            className={`inline-flex items-center gap-0.5 rounded-md border px-1 py-0.5 text-[10px] ${
              isActive
                ? 'border-primary/60 bg-primary/10 text-primary'
                : 'border-border/60 bg-muted/30 text-foreground/80'
            }`}
            title={`${label} · ${take.durationSec.toFixed(1)}s · ${take.voiceName ?? take.voiceId}`}
          >
            <button
              type="button"
              onClick={() => playOrPause(take)}
              className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-primary/20"
              aria-label="Preview take"
            >
              {isPlaying ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
            </button>
            <span className="font-semibold leading-none">{label}</span>
            <span className="text-[9px] text-muted-foreground">{take.durationSec.toFixed(1)}s</span>
            {!isActive ? (
              <button
                type="button"
                onClick={() => setActiveTake(take.id)}
                className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-primary/20"
                title={t.setActive}
                aria-label={t.setActive}
              >
                <CheckCircle2 className="h-2.5 w-2.5" />
              </button>
            ) : (
              <CheckCircle2 className="h-2.5 w-2.5 text-primary" aria-hidden />
            )}
            <button
              type="button"
              onClick={() => deleteTake(take.id)}
              className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
              title={t.delete}
              aria-label={t.delete}
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </div>
        );
      })}

      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-5 px-1.5 text-[10px] gap-0.5 text-muted-foreground hover:text-primary"
        disabled={!canAdd}
        onClick={recordTake}
        title={takes.length >= MAX_TAKES_PER_LINE ? t.full : t.add}
      >
        {busy ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
        ) : takes.length >= MAX_TAKES_PER_LINE ? (
          <RotateCcw className="h-2.5 w-2.5" />
        ) : (
          <Plus className="h-2.5 w-2.5" />
        )}
        {busy ? t.rerolling : t.add}
      </Button>

      {active && (
        <span className="ml-auto text-[9px] text-muted-foreground/70">
          {t.activeHint}
        </span>
      )}
    </div>
  );
}

export default DialogTakeStrip;
