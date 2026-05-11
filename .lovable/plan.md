## Diagnose

Logs der Edge Function `compose-twoshot-lipsync` für Szene `cf97d027…`:

```
16:21:21  pass 1/2  Matthew Dusatko  → Sync.so/lipsync-2 (Replicate)
16:22:48  pass 2/2  Sarah Dusatko    → Sync.so/lipsync-2 (Replicate)
16:24:08  ERROR Http: connection closed before message completed
```

Beide Passes liefen ~80s + ~80s + Re-Hosting + Continuity-Vision-Call > **~3 Minuten Wall-Clock synchron in einem HTTP-Request**. Edge Functions kappen die Verbindung deutlich vor dem Ende → der Client sieht „Edge Function returned a non-2xx status code", obwohl die Pipeline serverseitig vermutlich noch läuft (oder mittendrin abgebrochen wurde, ohne `lip_sync_status='failed'` zu setzen → Szene bleibt auf `running` hängen → Auto-Trigger startet nicht neu).

Das ist exakt das in der Stack-Overflow-Knowledge dokumentierte Muster: zu lang laufende synchrone Edge Function → `EdgeRuntime.waitUntil` + sofort 202 zurückgeben + Frontend pollt DB.

Unser Auto-Trigger-Hook (`useTwoShotAutoTrigger`) **pollt die DB ohnehin alle 8s**. Wir müssen also nur die schwere Arbeit in einen Background-Task schieben und sofort `202 { accepted: true }` zurückgeben — das Frontend nutzt das Ergebnis nie direkt aus dem HTTP-Response, sondern liest `lip_sync_status` / `clip_url` aus `composer_scenes`.

## Plan

### 1. `compose-twoshot-lipsync` zu Async-Pattern umbauen
- Sanity-Checks (Auth, Scene laden, Wallet, Replicate-Key) bleiben **synchron** vor dem Return — damit echte 4xx (z.B. fehlende Credits, fehlendes Voiceover) sofort beim Aufrufer landen.
- Direkt nach den Checks: `lip_sync_status='running'`, `twoshot_stage='lipsync_1'` setzen, Credits reservieren.
- Den heavy block (zwei sequentielle `replicate.run("sync/lipsync-2")`-Calls + Re-Host in `composer-clips` Bucket + Continuity-Vision-Call + finales DB-Update) in eine Funktion `runLipSyncPipeline(...)` extrahieren.
- Aufruf via `EdgeRuntime.waitUntil(runLipSyncPipeline(...).catch(async (e) => { await refund(...); }))`.
- Sofort `Response 202 { accepted: true, scene_id, status: 'running' }` zurückgeben.
- Bei jedem Fehler im Background-Task: `lip_sync_status='failed'`, `clip_error=<reason>`, `twoshot_stage='failed'` + Refund — damit der Auto-Trigger nicht in einer Endlos-`running`-Schleife hängt.

### 2. Stale-`running`-Recovery im Auto-Trigger-Hook
`useTwoShotAutoTrigger` filtert aktuell nur Szenen mit `lip_sync_status IN (NULL, 'pending')`. Bei einem alten Hänger (Status bleibt auf `running` ohne `lip_sync_applied_at`) feuert nichts mehr — manueller Reset nötig.

Erweitern: Wenn `lip_sync_status='running'` UND `updated_at` älter als **6 Minuten** UND `lip_sync_applied_at IS NULL` → Status auf `pending` zurücksetzen, Inflight-Lock leeren, dann normaler Trigger-Pfad. So räumt das System sich nach jedem Background-Crash selbst auf.

### 3. Sofort-Recovery für die aktuell hängende Szene `cf97d027…`
Per Migration den jetzigen Hänger zurücksetzen (`lip_sync_status=NULL`, `twoshot_stage=NULL`, `lip_sync_applied_at=NULL`, `clip_error=NULL`), damit der neue Async-Trigger sie sauber neu rendern kann. `clip_url` (silent video) bleibt erhalten. **Falls Credits beim Aborted-Run abgebucht wurden:** Wallet-Refund `+ COST` per Migration einmalig nachholen.

### 4. UI-Feinschliff in `ComposerSequencePreview`
Aktuelles „🎬 Lip-Sync wird vorbereitet…"-Badge erweitern: bei `lip_sync_status='failed'` rotes Badge „Lip-Sync fehlgeschlagen — wird neu angestoßen" zeigen, statt dass der User nur den Toast sieht. Globales VO weiter muten, solange `lip_sync_applied_at` fehlt.

### 5. Verifikation
1. Deploy `compose-twoshot-lipsync`.
2. Migration ausführen (Reset Szene `cf97d027…` + Refund falls nötig).
3. Im Composer Voiceover-Tab öffnen — Auto-Trigger-Hook feuert nach max 8s.
4. Edge-Function-Logs prüfen: kein „connection closed" mehr (Function returnt sofort 202).
5. DB-Polling: nach ~3min `lip_sync_applied_at` ≠ NULL, `clip_url` ≠ silent, `audio_plan.twoshot.useExternalAudio = true`.
6. Im Preview Szene 1 abspielen → beide Charaktere sprechen abwechselnd in voller Szenenlänge.

## Technische Details

**Geänderte Dateien:**
- `supabase/functions/compose-twoshot-lipsync/index.ts` — Refactor zu `EdgeRuntime.waitUntil` + 202-Response + Background-Refund-Pfad bei jedem Fail
- `src/hooks/useTwoShotAutoTrigger.ts` — Stale-`running`-Detection (>6min ohne `lip_sync_applied_at` → reset to `pending`)
- `src/components/video-composer/ComposerSequencePreview.tsx` — Failed-Badge zusätzlich zum Pending-Badge
- `supabase/migrations/<ts>_reset_twoshot_lipsync_recovery.sql` — Reset Szene `cf97d027…` + Wallet-Refund einmalig

**Out of Scope:** `compose-twoshot-audio` (läuft schnell, kein Timeout-Problem), `compose-lipsync-scene` (Single-Speaker, bekommt das gleiche Async-Muster nur falls später nötig — separat behandeln), die Lip-Sync-Pass-Logik selbst (funktioniert laut Logs korrekt, scheitert nur am HTTP-Timeout).