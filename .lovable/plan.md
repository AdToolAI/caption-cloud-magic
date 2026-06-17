
# v129.7 — Replay-Verifikation: `omit_sync_mode` bei sync-3

## Ziel
Hypothese aus dem v129.6-Bundle bestätigen: Der `generation_unknown_error` für Job `683ef7ad-c3c9-4282-ade9-0e3b66dc9086` wird ausgelöst durch die Kombination `sync_mode: "cut_off"` (lipsync-2-Vokabular) im sync-3-Request. **Kein** Live-Pipeline-Eingriff — nur isolierter Replay-Track gegen Sync.so.

## Befund-Recap (aus dem Bundle)
- Model: `sync-3`, Status: FAILED, `error_details`: generischer "Something went wrong"
- Options: `sync_mode=cut_off` + `active_speaker_detection.coordinates=[360,363]` + `frame_number=50`
- Assets reachable (✓ 200/200) → keine Asset-Korruption
- Memory `mem://architecture/lipsync/sync-3-doc-strict-options-v106` dokumentiert: sync-3 erlaubt nur `sync_mode` (in einem bestimmten Set) + `active_speaker_detection`; falsche Mode-Werte triggern reproducibly `provider_unknown_error`

## Scope — was passiert
1. **Replay-Run via Forensik-Sheet → Tab "Replay"** mit Preset `omit_sync_mode` gegen den Original-Job.
2. **Ergebnis-Auswertung:** `syncso_replay_log` zeigt entweder
   - ✅ `succeeded` → Hypothese bestätigt → Trigger für v129.8 Production-Strip-Plan
   - ❌ erneut `generation_unknown_error` → Hypothese widerlegt, weiter mit Preset `bboxes` (active_speaker_detection via bounding_boxes_url) als nächste Bisect-Stufe
   - ⚠️ anderer Error (z.B. 400 mit klarer Message) → noch besser, da deterministischer

## Was wir prüfen / vorbereiten (Mini-Implementation)
Bevor du den Replay-Button klickst, müssen 2 kleine Dinge sicher sein:

### A) `syncso-replay` Preset `omit_sync_mode` existiert und ist korrekt
- Datei prüfen: `supabase/functions/syncso-replay/index.ts`
- Erwartet: Preset entfernt `sync_mode` aus dem Original-Payload **und lässt** `active_speaker_detection` und `model: sync-3` unverändert
- Falls Preset nicht existiert oder Defaults überschreibt → minimal-invasiver Fix nur in dieser Funktion

### B) Face-Probe HTTP_400 ignorieren (für jetzt)
- Wir behandeln den Probe-Bug **nicht** in v129.7 — die Hauptfrage (sync_mode-Konflikt) lässt sich ohne Face-Count beantworten, da `active_speaker_detection` mit harten Koordinaten gesendet wurde (Face-Detection findet auf Sync.so-Seite ohnehin nicht statt)
- Tracking-Eintrag dafür in v129.8 separat

## Akzeptanzkriterien
1. Replay läuft erfolgreich durch `syncso-replay` und legt einen Eintrag in `syncso_replay_log` an (separater Webhook, **kein** Live-Pipeline-Touch)
2. Im Forensik-Sheet ist der Replay-Status sichtbar (provider_status + error_details des Replays)
3. Klare Verdict-Aktualisierung: "Hypothese sync_mode bestätigt/widerlegt"

## Explizit NICHT in Scope
- Keine Änderung an `compose-dialog-scene` / `poll-dialog-shots` / Live-Dispatch
- Keine DB-Migration
- Kein Production-Strip von sync_mode (das wäre v129.8, **erst nach** grünem Replay)
- Kein Face-Probe-Fix

## Verifikation
1. UI: Forensik-Sheet → Tab "Replay" → Preset `omit_sync_mode` → Run
2. DB: `SELECT preset, provider_status, error_details, options FROM syncso_replay_log WHERE source_job_id = '683ef7ad-...' ORDER BY created_at DESC LIMIT 1`
3. Edge Function Logs `syncso-replay` + `syncso-replay-webhook` auf Fehler prüfen

## Files (voraussichtlich)
- Read-only Inspektion: `supabase/functions/syncso-replay/index.ts` (zur Verifikation, dass Preset existiert)
- Falls Preset fehlt: minimaler Patch an dieser Datei
- `src/components/admin/SyncsoForensicsSheet.tsx` nur falls Replay-Tab den Preset nicht anbietet
