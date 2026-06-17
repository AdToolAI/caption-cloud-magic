
# v129.5-revised — Provider Input Experiment Track (strikt isoliert, Production-entkoppelt)

## Urteil & Grundprinzip

GO als reines Labor-/Forensik-Werkzeug. **Replay ist vollständig entkoppelt von Produktion.** Kein Pfad führt zurück in `composer_scenes`, `dialog_shots`, `syncso_dispatch_log`, Refund-System oder Watchdog. v129.4 Terminalisierung bleibt unverändert aktiv.

## Was v129.5 NICHT ist
- Keine Auto-Retry-Logik in der Live-Pipeline.
- Keine Pre-Dispatch-Heuristik.
- Keine Änderung an `compose-dialog-segments`, `sync-so-webhook`, `lipsync-watchdog`, `computeFaceCrop`, v129.1/.2.1/.3/.4 Invarianten.
- Keine erneute Crop-Forensik (aktueller Bucket ist `risk: clean`, ein Face, gültige Koordinaten — orthogonal zu v129.2).

## 1. Support-Bundle-Generator (`syncso-support-bundle`)

Input: `{ pass_id }` oder `{ dialog_shot_id }`. Admin-only.

Output: signierte URL auf 24h-temporäres Objekt in `support-bundles`-Bucket. Inhalt JSON + optional 3-Frame-PNG-Strip:

**Pipeline-Snapshot:**
- Original `provider_input_fingerprint` (v129.4b)
- v129.1 plate_coords + v129.2.1 ambiguity snapshot
- sanitisierte Original-Payload (API-Key redacted, **webhookUrl entfernt**)
- alle `_v105_probe / _v106_probe / _v1291` Felder aus `dialog_shots.passes[]`

**Provider Truth via GET /v2/generate/:provider_job_id:**
- `status`, `error`, **`errorCode` / `error_code`**, `model`, `options`, `input`, `outputUrl`
- `created_at`, `completed_at`
- Raw Response JSON

Wenn GET ebenfalls keinen `errorCode` liefert: prominent als `provider_truth.error_code_missing: true` ins Bundle → das ist der Sync.so-Support-Befund.

**Asset-Verifikation (server-side re-fetch):**

Video:
- HTTP status + content-type + content-length
- `sha256`
- ffprobe: `duration`, `fps`, `frame_count`, `width`, `height`, `codec`, `pix_fmt`
- 3-Frame Contact Sheet (0%, 50%, 100%) optional als PNG-Strip

Audio:
- HTTP status + content-type + content-length
- `sha256`
- ffprobe: `duration`, `sample_rate`, `channels`, `codec`
- RMS/Loudness, `lead_in_sec`, `voiced_end_sec`, `tail_silence_sec`

**Reproducer:**
- `curl`-Snippet als String mit API-Key-Placeholder
- exakter Payload-Dump (mit ersetztem webhookUrl auf `<REPLAY-WEBHOOK-URL>`)

## 2. Admin Replay-Endpoint (`syncso-replay`)

Body: `{ pass_id, preset, overrides_json?, reason }`. Auth: `service_role` ODER User mit `has_role('admin')`.

**Strikte Isolations-Regeln (hart):**
- Replay-Payload setzt `webhookUrl` auf **separaten `syncso-replay-webhook` Endpoint** (NICHT den Production-Webhook). Falls Sync.so webhookUrl auch optional ohne erlaubt, kann es alternativ komplett weggelassen werden → Polling via GET.
- Replay schreibt ausschließlich in `syncso_replay_log`. Niemals `composer_scenes`, `dialog_shots`, `syncso_dispatch_log`, Wallet, Refund-System, Watchdog.
- `provider_job_id` aus Replay wird in eigenem Feld `replay_provider_job_id` gespeichert — niemals in einem Produktions-Mapping-Lookup.

**Guardrails:**
- Max 1 gleichzeitiger Replay pro Admin (Redis-Lock oder DB-Lock).
- Max 5 Replays pro `pass_id` pro Stunde.
- Pre-Dispatch: ffprobe auf beide Asset-URLs muss success liefern; sonst Abbruch ohne Provider-Call.
- Response enthält geschätzte Sync.so-Kosten; Client muss `confirm: true` mitschicken.
- Vollständiger Audit-Trail in `syncso_replay_log`.

**Override-Presets (1 Klick = 1 Call, kein Try-All):**

| # | Preset | Overrides | Zweck |
|---|---|---|---|
| 1 | **Exact Reproducer** | `{}` | Payload byte-nah (gleiches model/audio/video/options/ASD/sync_mode). Reproduziert `provider_unknown_error`? |
| 2 | **Omit sync_mode** | strip `sync_mode` | Ist `cut_off` der Trigger? |
| 3 | **sync_mode: loop** | `{ sync_mode: "loop" }` | Labeled: Timing-Experiment, ändert Output-Dauer-Logik vs. cut_off |
| 4 | **bounding_boxes_url** | `{ asd: "bounding_boxes_url" }` (server generiert konstantes Box-Array über alle Frames aus plate_coords) | Isoliert: scheitert sync-3 generell oder nur an `frame_number + coordinates`? |
| 5 | **auto_detect** | `{ asd: "auto_detect" }` | Labeled: **unsafe / not production candidate**, nur Labor |
| 6 | **lipsync-2-pro** | `{ model: "lipsync-2-pro" }` | Modellwechsel-Vergleich |
| 7 | **lipsync-2** | `{ model: "lipsync-2" }` | Modellwechsel-Vergleich |

Empfohlene Test-Reihenfolge (im UI als nummerierte Liste, kein Auto-Loop): 1 → 2 → 3 → 4 → 5 → 6/7.

Preset `model: "sync-2"` ist **gestrichen** (kein dokumentierter Modellname). Replay validiert vor Dispatch, dass `model ∈ {sync-3, lipsync-2-pro, lipsync-2}`.

## 3. `syncso-replay-webhook` (separater Endpoint)

`verify_jwt = false`, shared-secret (eigener), schreibt ausschließlich in `syncso_replay_log` (Felder `provider_status`, `provider_error`, `provider_error_code`, `response_json`, `output_url`, `completed_at`, `duration_ms`). Keine andere Tabelle wird angefasst.

## 4. Neue Tabelle `syncso_replay_log`

Append-only, alle FKs nur informativ (kein Cascade in Produktion):

- `id` (uuid pk)
- `pass_id` (text, informativ, kein FK)
- `scene_id` (uuid, informativ, kein FK)
- `original_provider_job_id` (text)
- `replay_provider_job_id` (text)
- `created_by` (uuid → auth.users)
- `created_at` (timestamptz)
- `override_preset` (text: exact|omit_sync_mode|loop|bboxes|auto_detect|lipsync_2_pro|lipsync_2|custom)
- `overrides_json` (jsonb)
- `sent_payload_json` (jsonb, ohne API-Key)
- `sent_payload_hash` (text, sha256)
- `video_sha256`, `audio_sha256` (text)
- `provider_status` (text)
- `provider_error` (text)
- `provider_error_code` (text, nullable — wichtig für Befund)
- `response_json` (jsonb)
- `output_url` (text, nullable)
- `completed_at` (timestamptz, nullable)
- `duration_ms` (int, nullable)
- `reason` (text)
- `notes` (text, nullable)

RLS: SELECT nur für Admins (`has_role(auth.uid(),'admin')`); INSERT/UPDATE nur `service_role`. GRANTs entsprechend.

## 5. Admin-UI

Im bestehenden Composer-Scene-Failed-Toast (sichtbar nur für Admin) ein "Forensik"-Button → öffnet Sheet:

- **Tab "Support-Bundle"**: Button "Bundle erzeugen" → Download-Link + Inline-Vorschau wichtigster Felder (errorCode, audio/video sha + ffprobe Summary, ambiguity)
- **Tab "Replay"**:
  - Pass-Select + Preset-Dropdown (1–7) + optional Free-Form-JSON
  - Pre-Dispatch-Check zeigt: ffprobe-Status beider URLs, geschätzte Kosten
  - "Replay starten"-Button erfordert Confirmation-Checkbox + `reason`-Text
  - Tabelle der letzten Replays für diesen `pass_id` mit `provider_error_code`-Spalte (rot wenn null/unknown)

Kein Auto-Loop, kein "Try all", kein "Apply to production".

## 6. Akzeptanz / harte Invarianten

Nach Implementation muss gelten:
- Replay-Call hat **niemals** Production-`webhookUrl` in der gesendeten Payload (grep im Test).
- `composer_scenes` row_count vor/nach Replay identisch für betroffene Scene.
- `dialog_shots` Payload-JSON vor/nach Replay identisch.
- `syncso_dispatch_log` neue Rows vor/nach Replay = 0.
- Wallet-Balance des Scene-Owners unverändert.
- v129.4-Watchdog wird nicht getriggert.
- Replay-Endpoint lehnt unsupported Modellnamen ab (`sync-2` → 400).
- Replay-Endpoint lehnt Calls ab, wenn Asset-ffprobe fehlschlägt.

## 7. Out of Scope (explizit)

- Kein Stage 4 A/B, Plan-D, Segments, lipsync-2-pro in Produktion, State Machine, UI-Polish außerhalb Forensik-Sheet.
- Kein automatischer Model-Fallback in Live-Pipeline.
- Keine Änderung am v129.4-Verhalten.

## 8. Files

**Neu:**
- `supabase/functions/syncso-support-bundle/index.ts`
- `supabase/functions/syncso-replay/index.ts`
- `supabase/functions/syncso-replay-webhook/index.ts`
- `supabase/migrations/*_syncso_replay_log.sql` (Tabelle + GRANTs + RLS)
- Storage-Bucket `support-bundles` (privat, 24h Lifecycle)
- `src/components/admin/SyncsoForensicsSheet.tsx`
- `docs/lipsync/v129-5-provider-experiment-track.md` (inkl. Preset-Reihenfolge, Auswertungs-Guide, Sync.so-Support-Bundle-Template)
- `mem/architecture/lipsync/v1295-provider-experiment-track.md`

**Bearbeitet (klein, vor Edit lesen):**
- `mem/index.md` (1 Zeile)
- `.lovable/plan.md`
- Composer-Scene-Failed-Toast-Komponente (1 Admin-only Button)

## 9. Canary

1. Support-Bundle für aktuellen Failed Pass (Sarah/Pass 1) erzeugen. Befund: enthält Provider-Truth via GET, `errorCode`, sha256s, ffprobe.
2. Exact Replay (Preset 1). Erwartung: reproduziert `provider_unknown_error` außerhalb Live-Pipeline.
3. Replay-Log enthält neue Row mit `replay_provider_job_id ≠ original`.
4. `composer_scenes` / `dialog_shots` / Wallet unverändert (verifiziert per Query).
5. Manuell, einzeln nach Bedarf: Presets 2 → 3 → 4 → 5 → 6/7. Ergebnis-Matrix in Doku festhalten.
6. Erst wenn Antwort vorliegt ("ist `cut_off` der Trigger?" / "ist `frame_number+coordinates` der Trigger?" / "ist `sync-3` der Trigger?"): separater Plan v129.6 für Produktionsfix oder Sync.so-Support-Ticket.
