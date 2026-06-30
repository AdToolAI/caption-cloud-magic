# Fix: Lip-Sync startet trotz fehlgeschlagener Szene

## Symptom
Wenn der Master-Clip einer Szene fehlschlägt (`clip_status='failed'`, `clip_error` gesetzt, oder `twoshot_stage='failed'`), springt der Lip-Sync-Auto-Trigger in `useTwoShotAutoTrigger.ts` trotzdem an — entweder über die `audio-prep`-Stufe (optimistisch `twoshot_stage='audio'`), die `master_clip`-Brücke, oder direkt als Kandidat — sobald irgendein älterer `clip_url`/`audio_plan` noch in der Row steht.

Heute prüft jede der drei Stufen nur `clip_status && clip_status !== 'ready'`. Das schützt nicht gegen:
- `clip_status=null` + `clip_error` gesetzt (transienter Render-Fail vor Status-Update),
- `twoshot_stage='failed'` mit altem `clip_url` aus vorigem Lauf,
- `clip_status='failed'` Race: optimistic `audio-prep` Tick rennt vor dem Webhook-Update an.

## Lösung — ein einziger Realized-Scene-Guard

Wir führen `isRealizedScene(scene)` als Single-Source-of-Truth ein und verwenden ihn in **allen** Stufen, die Lip-Sync-Arbeit anstoßen.

```text
isRealizedScene(scene) :=
  clip_status === 'ready'
  AND typeof clip_url === 'string' AND clip_url.length > 0
  AND !clip_error
  AND twoshot_stage !== 'failed'
  AND lip_sync_status !== 'failed'
  AND lip_sync_status !== 'canceled'
```

Alles andere ist „nicht realisiert" → kein Audio-Prep, kein Stage-Advance, kein Lip-Sync-Candidate. Punkt.

## Änderungen

### 1. Neue Util: `src/lib/composer/isRealizedScene.ts`
- Reine Funktion, keine Side-Effects.
- Wird vom Hook UND von `PipelineProgressBar` benutzt, damit der Balken eine failed Szene nie als „läuft" zeigt.

### 2. `src/hooks/useTwoShotAutoTrigger.ts`
- `audioReadyButNotAdvanced` Filter: erste Zeile `if (!isRealizedScene(d)) return false;`
- `needsAudioPrep` Filter: dito, ganz oben — verhindert den optimistischen `twoshot_stage='audio'` Write, der den Balken fälschlich startete.
- `candidates` Filter (Lip-Sync Kick): dito.
- Bestehende detaillierte Checks bleiben unverändert dahinter stehen (Defense-in-Depth).

### 3. `src/components/video-composer/PipelineProgressBar.tsx` (nur Anzeige)
- `hasFailure` greift bereits — zusätzlich: `lipsyncRunning` wird nur true, wenn die Szene auch `isRealizedScene` erfüllt. So zeigt der Balken bei einem geplatzten Master-Clip sofort den Fehler statt „Lip-Sync läuft…".

### 4. Server-Seite (defensiv, ein Punkt)
- `compose-twoshot-audio/index.ts`: vor der Edge-Function-Arbeit reload der Szene → bei `clip_status === 'failed' || twoshot_stage === 'failed'` 422 mit Reason `scene_not_realized_no_lipsync` zurückgeben und KEINEN State-Write machen.
- Verhindert, dass ein Client-Race (Tick → Failure-Webhook gleich danach) doch noch `audio_plan` materialisiert.

## Was bewusst NICHT geändert wird

- `compose-dialog-scene` / `compose-dialog-segments`: haben bereits eigene Pre-Flight-Gates (`source_clip_unusable`).
- `lipsync-watchdog`, `failLipSync`, Sync.so-Webhook: unverändert.
- Bestehende Auto-Retry-Regex (`RETRYABLE_REGEX`) und Hard-Fail-Liste: unverändert.
- Refund-Pfade: unverändert.
- Cinematic-Sync v23 State-Machine (Server-Owned): unverändert.

## Validierung

1. Eine Szene mit `clip_status='failed'` + altem `clip_url` + `audio_plan.twoshot.url` darf nach Reload **keinen** Tick mehr triggern (Console: kein `[useTwoShotAutoTrigger] self-heal`).
2. PipelineProgressBar zeigt `failure`-Zustand sofort, keinen „Lip-Sync läuft"-Phantom-Spinner.
3. Manueller „Sauber neu starten"-Klick (reset-lipsync-scene) räumt failed → pending und Lip-Sync läuft beim nächsten Tick normal.
4. `compose-twoshot-audio` returns 422 `scene_not_realized_no_lipsync` bei direktem Aufruf auf failed Szene (curl-Test).

## Risiko

Minimal. Reiner Guard, kein Pipeline-Eingriff. Worst-Case-Regression: eine zu früh als „nicht realisiert" markierte Szene wird beim nächsten Tick (8s) neu evaluiert, sobald der Master-Clip-Webhook `clip_status='ready'` setzt — kein Datenverlust, kein Credit-Burn.
