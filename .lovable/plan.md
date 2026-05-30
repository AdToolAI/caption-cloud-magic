## Was wirklich passiert (aus DB + Code verifiziert)

Bei den drei letzten Szenen mit `engine_override='cinematic-sync'` (alle 1 Sprecher: „Matthew Dusatko: …") sieht die DB so aus:

```
clip_url            = ✓ (Master-Plate gerendert)
audio_plan          = NULL          ← compose-twoshot-audio lief nie
lip_sync_source_url = NULL
lip_sync_status     = NULL
twoshot_stage       = NULL
```

Konsequenz mit der aktuellen v5-Logik:

1. `compose-dialog-segments` (v5) braucht zwingend `audio_plan.twoshot.url` + `lip_sync_source_clip_url`.
2. Der Pre-Flight-Gate in `useTwoShotAutoTrigger` (den wir gerade gebaut haben) **überspringt die Szene still**, weil beides fehlt.
3. Die UI in `SceneInlinePlayer.tsx` zeigt aber hartcodiert „Lip-Sync startet… · Sync.so · ~60 s pro Sprecher-Turn", weil das Label nur vom Engine + `clip_url` abhängt — nicht vom tatsächlichen Fortschritt. → User sieht ein Pseudo-Spinner ohne Balken, der nie weiterläuft, irgendwann „bricht ab" (Komponente unmountet beim Scrollen).

Bei 2 Sprechern funktioniert es, weil `compose-twoshot-audio` beim ersten Generieren mitläuft (gleicher Code-Pfad in `compose-video-clips`) — aber für die drei letzten 1-Sprecher-Szenen wurde es offensichtlich nie ausgeführt (Toggle nachträglich aktiviert, Engine später gewechselt, oder Prep-Block hat schweigend abgebrochen). Es gibt aktuell **keinen Pfad**, der die fehlende Audio-Plate nachträglich baut → permanenter Stuck-State.

## Was geändert wird

### 1. `src/hooks/useTwoShotAutoTrigger.ts` — Audio-Plate-Self-Heal
Neuer Pre-Stage VOR dem v5-Dispatch:

- Selektiere zusätzlich Szenen mit:
  `engine_override IN ('cinematic-sync','sync-segments')` UND `clip_status='ready'` UND `clip_url IS NOT NULL` UND `audio_plan->'twoshot'->>'url' IS NULL` UND `lip_sync_applied_at IS NULL` UND `dialog_script` enthält mind. eine `Name:`-Zeile.
- Für jede solche Szene: setze `twoshot_stage='audio'`, dann `supabase.functions.invoke('compose-twoshot-audio', { body: { scene_id, force_regenerate: false } })`.
- Inflight-Lock mit Key `audio-prep:${sceneId}` (60s TTL), damit derselbe Poll-Tick und parallele Tabs nicht doppelt feuern.
- Bei Erfolg: nichts weiter tun — der nächste Tick sieht `audio_plan.twoshot.url` ✓ + master clip ✓ und feuert v5 automatisch (bestehende Logik).
- Bei Fehler (HTTP non-2xx): `clip_error='twoshot_audio_prep_failed: <msg>'`, `twoshot_stage='failed'`. Genau diesen Code lässt der bestehende `RETRYABLE_REGEX` NICHT durch → kein Endlos-Loop.
- Watchdog: Szene mit `twoshot_stage='audio'` länger als 3 min und immer noch ohne `audio_plan.twoshot.url` → `twoshot_stage=null`, damit beim nächsten Tick ein frischer Versuch startet (genau 1x via `autoRetried`-Set, wie wir es für Sync.so schon haben).

### 2. `src/components/video-composer/SceneInlinePlayer.tsx` — ehrlicher Status
Aktuell zeigt das Overlay nur „Lip-Sync läuft…" / „Lip-Sync startet…". Neu drei Stufen, gespeist aus `twoshot_stage` + `lip_sync_status`:

```
twoshot_stage='audio'                       → „Audio wird vorbereitet…  Sync.so wartet auf Voiceover"
twoshot_stage='master_clip', lip_sync=null  → „Master-Plate fertig — Sync.so wird gestartet…"
lip_sync_status='running'                   → „Lip-Sync läuft…           Sync.so · ~60 s pro Sprecher-Turn"
twoshot_stage='failed' OR lip_sync='failed' → „Lip-Sync fehlgeschlagen — bitte erneut starten" + Retry-Button
```

Kein neuer Pipeline-Pfad, nur korrekte Labels und ein sichtbarer Ladebalken-Pulse, der schon im `audio`-Stage anläuft. Damit verschwindet das Symptom „bricht nach 30 s ab".

### 3. Keine Edge-Function- / DB- / Sync.so-Änderungen
`compose-twoshot-audio`, `compose-dialog-segments`, `poll-dialog-shots`, Sync.so-Plan, RLS, Tabellen — alles unverändert. Die v5-Pipeline selbst bleibt 1:1 (egal ob 1, 2, 3 oder 4 Sprecher), wir füllen nur die Vorbedingung nach, die bei manchen Single-Speaker-Flows fehlt, und machen den Status sichtbar.

## Dateien

- `src/hooks/useTwoShotAutoTrigger.ts` (Self-Heal-Block + Audio-Watchdog)
- `src/components/video-composer/SceneInlinePlayer.tsx` (dreistufiges Status-Label)

## Erwartung

Bei der nächsten 1-Sprecher-Szene mit `cinematic-sync`:
- Innerhalb von max. 8 s (ein Poll-Tick) fängt der UI-Balken bei „Audio wird vorbereitet…" an.
- ~10–30 s später flippt das Label auf „Master-Plate fertig — Sync.so wird gestartet…" → dann „Lip-Sync läuft…".
- Final: Szene erscheint im Storyboard, identisch zum 2-Sprecher-Flow.
