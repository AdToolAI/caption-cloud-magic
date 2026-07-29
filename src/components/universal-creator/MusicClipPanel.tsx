/**
 * MusicClipPanel — reusable background-music trim / placement panel.
 *
 * Wired into every Universal-Content-Creator style flow (UCC today; Motion
 * Studio & AI Video Studio can adopt via the same component). Data shape
 * intentionally mirrors `AudioClip` in `src/types/timeline.ts` so a UCC
 * project imported into Director's Cut keeps its trim/offset values.
 *
 *   trimStart / trimEnd  — seconds inside the SOURCE track
 *   startTime            — seconds ON the video timeline (offset from 0)
 *   loop                 — repeat clip until end of video when true
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { type Region } from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Music, Scissors, AlertTriangle } from 'lucide-react';

export interface MusicClip {
  trimStart: number;
  trimEnd: number;
  startTime: number;
  loop: boolean;
  fadeIn?: number;
  fadeOut?: number;
}

export interface MusicClipPanelProps {
  audioUrl: string | null | undefined;
  /** Total playable duration of the composed video in seconds. */
  videoDuration: number;
  value?: MusicClip | null;
  onChange: (clip: MusicClip) => void;
  /** Optional proxy helper for CORS-restricted sources (e.g. Jamendo). */
  resolveUrl?: (url: string) => string;
}

const DEFAULT_CLIP: MusicClip = {
  trimStart: 0,
  trimEnd: 0,
  startTime: 0,
  loop: true,
  fadeIn: 0.5,
  fadeOut: 0.8,
};

const MIN_CLIP_LEN = 0.2; // 200 ms

function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function parseTimecode(str: string, fallback: number): number {
  // Accept "mm:ss.mmm", "ss.mmm" or plain seconds.
  if (!str) return fallback;
  const trimmed = str.trim();
  const mmss = /^(\d+):(\d+)(?:\.(\d{1,3}))?$/.exec(trimmed);
  if (mmss) {
    const m = Number(mmss[1]);
    const s = Number(mmss[2]);
    const ms = mmss[3] ? Number(mmss[3].padEnd(3, '0')) : 0;
    return m * 60 + s + ms / 1000;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : fallback;
}

export function MusicClipPanel({
  audioUrl,
  videoDuration,
  value,
  onChange,
  resolveUrl,
}: MusicClipPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const regionRef = useRef<Region | null>(null);
  const [trackDuration, setTrackDuration] = useState<number>(0);
  const [isReady, setIsReady] = useState(false);
  const [startInput, setStartInput] = useState<string>('');
  const [endInput, setEndInput] = useState<string>('');

  const clip: MusicClip = useMemo(
    () => ({ ...DEFAULT_CLIP, ...(value || {}) }),
    [value],
  );

  const resolvedUrl = useMemo(() => {
    if (!audioUrl) return null;
    try {
      return resolveUrl ? resolveUrl(audioUrl) : audioUrl;
    } catch {
      return audioUrl;
    }
  }, [audioUrl, resolveUrl]);

  // ---- Wavesurfer lifecycle ------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || !resolvedUrl) return;
    setIsReady(false);
    const regions = RegionsPlugin.create();
    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 64,
      waveColor: 'hsl(var(--muted-foreground) / 0.55)',
      progressColor: 'hsl(var(--primary))',
      cursorColor: 'transparent',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      interact: false, // region owns interactions
      plugins: [regions],
    });
    wavesurferRef.current = ws;
    regionsRef.current = regions;

    ws.load(resolvedUrl).catch(() => { /* URL might be temporarily blocked */ });

    ws.on('ready', () => {
      const dur = ws.getDuration();
      setTrackDuration(dur);
      const start = Math.max(0, Math.min(clip.trimStart, dur - MIN_CLIP_LEN));
      const end = clip.trimEnd > 0
        ? Math.max(start + MIN_CLIP_LEN, Math.min(clip.trimEnd, dur))
        : dur;
      const region = regions.addRegion({
        start,
        end,
        color: 'hsla(var(--primary) / 0.18)',
        drag: true,
        resize: true,
      });
      regionRef.current = region;
      setIsReady(true);
      // Seed defaults if caller passed nothing sensible yet.
      if (!value || value.trimEnd <= 0) {
        onChange({ ...clip, trimStart: start, trimEnd: end });
      }
    });

    regions.on('region-updated', (r: Region) => {
      onChange({
        ...clip,
        trimStart: Math.max(0, r.start),
        trimEnd: Math.max(r.start + MIN_CLIP_LEN, r.end),
      });
    });

    return () => {
      try { ws.destroy(); } catch { /* noop */ }
      wavesurferRef.current = null;
      regionsRef.current = null;
      regionRef.current = null;
    };
    // Re-create only when the source URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedUrl]);

  // Keep region in sync when value changes externally (e.g. presets).
  useEffect(() => {
    const r = regionRef.current;
    if (!r || !isReady) return;
    if (Math.abs(r.start - clip.trimStart) > 0.01 || Math.abs(r.end - clip.trimEnd) > 0.01) {
      try { r.setOptions({ start: clip.trimStart, end: clip.trimEnd }); } catch { /* noop */ }
    }
  }, [clip.trimStart, clip.trimEnd, isReady]);

  // Reflect current clip into text inputs.
  useEffect(() => {
    setStartInput(formatTimecode(clip.trimStart));
    setEndInput(formatTimecode(clip.trimEnd));
  }, [clip.trimStart, clip.trimEnd]);

  // ---- Handlers ------------------------------------------------------------
  const commitStart = useCallback(() => {
    const parsed = parseTimecode(startInput, clip.trimStart);
    const clamped = Math.max(0, Math.min(parsed, Math.max(0, clip.trimEnd - MIN_CLIP_LEN)));
    onChange({ ...clip, trimStart: clamped });
  }, [startInput, clip, onChange]);

  const commitEnd = useCallback(() => {
    const parsed = parseTimecode(endInput, clip.trimEnd);
    const cap = trackDuration > 0 ? trackDuration : parsed;
    const clamped = Math.min(cap, Math.max(clip.trimStart + MIN_CLIP_LEN, parsed));
    onChange({ ...clip, trimEnd: clamped });
  }, [endInput, clip, onChange, trackDuration]);

  const clipLen = Math.max(0, clip.trimEnd - clip.trimStart);
  const maxOffset = Math.max(0, videoDuration - (clip.loop ? MIN_CLIP_LEN : clipLen));
  const overflow = !clip.loop && clip.startTime + clipLen > videoDuration + 0.01;

  const setPreset = (kind: 'start' | 'middle' | 'end') => {
    if (kind === 'start') return onChange({ ...clip, startTime: 0 });
    if (kind === 'end') return onChange({ ...clip, startTime: Math.max(0, videoDuration - clipLen) });
    return onChange({ ...clip, startTime: Math.max(0, (videoDuration - clipLen) / 2) });
  };

  // ---- Render --------------------------------------------------------------
  if (!audioUrl) return null;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Scissors className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Musik-Ausschnitt & Position</h4>
      </div>

      {/* Waveform + region */}
      <div className="rounded-md border border-border/60 bg-muted/20 p-2">
        <div ref={containerRef} className="w-full" />
        {!isReady && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <Music className="h-3 w-3" />
            Waveform wird geladen…
          </div>
        )}
      </div>

      {/* Trim inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Von (im Track)</Label>
          <Input
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            onBlur={commitStart}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            placeholder="00:00.000"
            className="font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Bis (im Track)</Label>
          <Input
            value={endInput}
            onChange={(e) => setEndInput(e.target.value)}
            onBlur={commitEnd}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            placeholder="00:00.000"
            className="font-mono"
          />
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Ausschnitt: <span className="font-medium text-foreground">{clipLen.toFixed(2)}s</span>
        {trackDuration > 0 && <> · Track gesamt {trackDuration.toFixed(2)}s</>}
      </div>

      {/* Video offset */}
      <div className="space-y-2 pt-2 border-t border-border/60">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Start im Video</Label>
          <span className="text-xs font-mono text-muted-foreground">
            {formatTimecode(clip.startTime)}
          </span>
        </div>
        <Slider
          value={[Math.min(clip.startTime, maxOffset)]}
          min={0}
          max={Math.max(0.01, maxOffset)}
          step={0.05}
          onValueChange={([v]) => onChange({ ...clip, startTime: Math.max(0, Math.min(v, maxOffset)) })}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setPreset('start')}>Anfang</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setPreset('middle')}>Mitte</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setPreset('end')}>Ende</Button>
        </div>
      </div>

      {/* Loop toggle */}
      <div className="flex items-center justify-between pt-2 border-t border-border/60">
        <div>
          <Label className="text-sm">Bis Video-Ende loopen</Label>
          <p className="text-xs text-muted-foreground">
            Wiederholt den Ausschnitt nahtlos bis das Video endet.
          </p>
        </div>
        <Switch
          checked={clip.loop}
          onCheckedChange={(v) => onChange({ ...clip, loop: v })}
        />
      </div>

      {overflow && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/40 p-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Ausschnitt endet vor Video-Ende ({videoDuration.toFixed(1)}s). Aktiviere „Loopen" oder verschiebe den Startpunkt.
          </span>
        </div>
      )}
    </Card>
  );
}
