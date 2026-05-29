## Symptom

Nach dem letzten Sync.so-Pass spielt das fertige Lipsync-Video bereits sauber ab, aber der globale Pipeline-Progress-Bar oben im Composer bleibt „laufend" (Phase-Pill `Clips` weiter blau-pulsierend, Gesamtprozent ~40 %, statt sauber auf 100 % zu springen und nach 3 s zu verschwinden).

## Root Cause

In `sync-so-webhook/index.ts` schreibt der finale Pass nur:
- `clip_url = finalUrl`
- `lip_sync_status = "applied"`
- `lip_sync_applied_at = nowIso`
- `twoshot_stage = "complete"`
- `dialog_shots.status = "done"`

Er aktualisiert **nicht** `clip_status`. Für Dialog-/Cinematic-Sync-Szenen wird das Master-Plate von der Edge Function selbst erzeugt und die Szene bleibt während des gesamten Sync.so-Chains in `clip_status = 'generating'`. Konsequenz im Frontend (`usePipelineProgress.ts → clipsReal`):

- `generating > 0` ⇒ `clipsReal.running = true`
- `ready < total` ⇒ `clipsReal.progress < 1`, `clipsReal.done = false`
- → `isActive` bleibt `true`, die Clips-Phase pulsiert weiter, der Balken steckt zwischen ~30–40 % fest, obwohl die Lipsync-Phase bereits `done` ist.

Die im letzten Turn ergänzte `waitingForExport`-Kappung greift hier nicht sauber, weil sie nur die Soft-Floor-Rampe stoppt, aber den Status der Clips-Phase nicht korrigiert.

## Fix

### 1. Backend (`supabase/functions/sync-so-webhook/index.ts`)

Im Final-Pass-Update zusätzlich setzen:
```
clip_status: "ready",
clip_error: null,
```
Damit ist die Master-Clip-Quelle in der DB konsistent: Szene hat `clip_url` UND `clip_status='ready'`.

(Optional zur Sicherheit auch im Retry/Failed-Branch: bei harter Failure `clip_status` unverändert lassen — der bestehende `lip_sync_status='failed'` reicht für die Failure-Erkennung im Frontend.)

### 2. Frontend Belt-and-Suspenders (`src/hooks/usePipelineProgress.ts`)

In `clipsReal` (ca. Z. 180–217) eine Szene auch dann als „ready" zählen, wenn sie zwar nicht `clipStatus==='ready'` ist, aber bereits ein finales Lipsync-Ergebnis vorliegt:

```ts
const isReadyOrLipsynced = (s: any) =>
  s.clipStatus === 'ready' ||
  (!!s.clipUrl && (
    s.lipSyncStatus === 'applied' ||
    s.twoshotStage === 'complete' ||
    s.twoshotStage === 'done'
  ));
```

`ready`, `generating` und `backendActive` entsprechend ableiten, sodass eine Szene mit `lip_sync_status='applied'` + `clip_url` nicht mehr als „generating" zählt. Dadurch funktioniert der Bar auch für ältere Rows, die noch ohne den DB-Fix gespeichert wurden, sowie für eventuelle Provider, die `clip_status` nicht selbst schreiben.

### 3. Memory-Update

`mem/features/video-composer/sync-segments-dialog-pipeline` ergänzen: „Final pass writes `clip_status='ready'` + `clip_error=null` zusätzlich zu `clip_url`/`lip_sync_status='applied'`, damit der globale Pipeline-Progress-Bar sauber auf 100 % geht und nicht in der Clips-Phase hängenbleibt."

## Out of Scope

- Keine UI-Änderungen am Bar-Layout, kein Refactor von `usePipelineProgress`.
- Kein Eingriff in Multi-Pass-Logik (Charakter-Zuordnung, `sync_mode`, Padding) — alles bereits in v5 final.
- Kein Eingriff in den Director's-Cut-Render-Overlay.
