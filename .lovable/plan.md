# Lipsync Pipeline – Cleanup nach v166 "Holy Grail"

Ziel: Toten Code, tote Admin-Tools und tote DB-Objekte aus den Failed-Eras (v41–v165) entfernen, ohne die v166-Pipeline anzufassen.

## Was bleibt unangetastet (Frozen Core)

Diese Dateien/Tabellen sind v166-aktiv und werden NICHT angefasst:

- Edge Functions: `compose-dialog-scene`, `compose-dialog-segments`, `sync-so-webhook`, `poll-dialog-shots`, `render-sync-segments-audio-mux`, `lipsync-watchdog`, `cancel-dialog-lipsync`, `reset-lipsync-scene`
- `_shared/`: `pass-face-preclip.ts`, `plate-face-identity.ts`, `dialog-lock.ts`, `dialog-speakers.ts`, `rehostPlate.ts`, `lipsync-fail.ts`, `asd-strategy.ts`, `face-frame-extract.ts`
- Templates: `src/remotion/templates/DialogStitchVideo.tsx`
- Tabellen: `dialog_dispatch_locks`, `syncso_dispatch_log`, `syncso_inflight_jobs`, `frame_face_cache`, `scene_anchor_cache`

## A) Edge Functions löschen

Tote v124-Replay/Preflight/Diagnostik-Tools (v166 ist webhook-driven, kein Replay mehr nötig):

- `compose-twoshot-audio` – legacy 2-shot Vorgänger
- `lip-sync-video` – standalone v1
- `lipsync-diagnostic` – Diagnose-Tool aus v131
- `syncso-preflight` – Preflight-Probe
- `syncso-replay` + `syncso-replay-lab` + `syncso-replay-webhook` – Replay-Pipeline
- `syncso-support-bundle` – Forensics-Exporter
- `validate-frame-face` – Frame-Face-Probe
- `normalize-master-clip` – alter Master-Normalizer

→ inkl. `supabase--delete_edge_functions` und `config.toml`-Einträge entfernen.

## B) `_shared/` Helpers löschen

Nur löschen, wenn nach (A) keine aktive Function mehr importiert:

- `face-count.ts`, `face-crop.ts`, `face-detect-mediapipe.ts` – pre-Rekognition Detektion
- `plate-face-detect.ts` – ersetzt durch `plate-face-identity.ts`
- `syncso-face-gate.ts` – legacy Gate
- `syncso-preflight.ts` – Helper für gelöschte Function
- `twoshot-face-map.ts` – legacy 2-shot Map
- `dialogPassTransition.ts` – Transition-Helper, in v166 Pipeline unused

Verifikation: nach Löschung `grep -rl <name> supabase/functions` muss leer sein.

## C) Frontend aufräumen

- Löschen:
  - `src/pages/admin/LipsyncDiagnostic.tsx`
  - `src/components/admin/SyncsoForensicsSheet.tsx`
  - `src/lib/syncReplayClassify.ts`
- Anpassen (Imports/Verwendungen entfernen, sonst unverändert):
  - `src/App.tsx` – lazy-import + Route `LipsyncDiagnostic` entfernen
  - `src/components/video-composer/SceneInlinePlayer.tsx` – `SyncsoForensicsSheet` Import + Render entfernen (Sheet ist nur Debug-UI)

Bleibt erhalten (v166-aktiv): `useTwoShotAutoTrigger`, `useResetLipSync`, `usePipelineProgress`, `PipelineProgressBar`.

## D) DB-Cleanup (separate Migration zur Genehmigung)

Drop nur Tabellen ohne Live-Code-Referenz nach (A)+(B)+(C):

```sql
DROP TABLE IF EXISTS public.syncso_replay_log CASCADE;
DROP TABLE IF EXISTS public.syncso_tuning_hints CASCADE;
DROP TABLE IF EXISTS public.lipsync_diagnostic_runs CASCADE;
DROP TABLE IF EXISTS public.plate_face_cache CASCADE;
DROP TABLE IF EXISTS public.normalized_master_cache CASCADE;
```

Außerdem: tote Cron-Jobs aus `cron.job` prüfen und unschedulen (z. B. `syncso-replay-*`, `normalize-master-cron`, falls vorhanden). Liste wird vor der Migration via `supabase--read_query` auf `cron.job` ermittelt und in derselben Migration mit `cron.unschedule(...)` entfernt.

`types.ts` regeneriert sich nach der Migration automatisch.

## E) Verifikation

Nach jedem Schritt:

1. `grep -rl <gelöschter-Name> src supabase` → muss leer sein (außer Migrations-Historie).
2. Build muss grün bleiben (läuft automatisch).
3. v166-Smoke: `compose-dialog-scene` Pfad nicht angefasst → keine Funktionsänderung erwartet.
4. Migrations-Historie (`supabase/migrations/2026052*…2026062*…`) bleibt unverändert – nur neue Migration für DROPs.

## Out of Scope

- Keine Änderung an v166-Logik, sync-3-Optionen, Bbox-JSON, FaceMap, Refund-Pfad.
- Keine Änderung an Remotion-Bundle / Lambda.
- Keine Anpassung der `HOLY-GRAIL-v166`-Memory (Cleanup wird dort nur als Appendix-Notiz nachgetragen).

## Reihenfolge der Ausführung

1. Frontend-Imports entfernen (C – sonst Build bricht nach Function-Delete).
2. `_shared/` Helpers + Edge Functions löschen (A + B) inkl. `supabase--delete_edge_functions`.
3. DB-Migration einreichen (D) – du genehmigst sie separat.
4. Memory-Index: Appendix-Bullet "v166 Cleanup – Datenmüll entfernt" in `mem/architecture/lipsync/HOLY-GRAIL-v166-complete-pipeline.md` ergänzen.