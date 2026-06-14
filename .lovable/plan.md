# v116 — Sync-3 Official Segments API (Multi-Speaker Primary)

## Ziel
Die 4-Personen-Pipeline wieder stabil zum Laufen bringen, indem wir Multi-Speaker (N≥2) **in einem einzigen Sync.so-Call** über die offizielle **Segments-API mit `sync-3`** abwickeln — exakt nach https://sync.so/docs/developer-guides/segments + speaker-selection. Der heutige v60 serielle Per-Speaker-Chain wird zum Fallback degradiert.

## Warum (Doc-Begründung)
Die Sync.so-Doku beschreibt Segments als **die offiziell empfohlene Methode** für Multi-Speaker-Szenen:
- 1 Video + N Audios (`input[]` mit `refId`).
- `segments[]` mit `startTime`/`endTime` + `audioInput.refId` + per-Segment `optionsOverride.active_speaker_detection`.
- `sync-3` Modell — von Sync.so explizit empfohlen für „multi-person, static, occluded, partial-face shots" und kann **stumme Lippen öffnen** (im Gegensatz zu lipsync-2-pro „Still Frame Limitation").
- ASD pro Segment mit `auto_detect:false` + `frame_number` + `coordinates:[cx,cy]` (oder `bounding_boxes_url` für lange/komplexe Plates).

Unser v60-Chain umgeht das mit N seriellen Calls → 4× Sync.so-Slots verbrannt, 4× Race-Risiko, lange Wallclock. v82 hat zwar `bbox-url-pro` als Primary, aber immer noch **pro Pass** statt einem einzigen Multi-Segment-Call.

## Aktueller Stand (Ist)
- `compose-dialog-segments` dispatcht heute für N≥2 **N getrennte Sync.so-Jobs** (v60 unified chain), jeder mit eigenem ASD (bbox-url-pro / coords-pro).
- v55/v56 `sync-official-segments-v55` existiert im Code als „official segments" Pfad, ist aber für N≥2 hart deaktiviert (`useV41Official = false`, FROZEN I.2).
- Webhook (`sync-so-webhook`) erwartet pro Pass einen Sync.so-Job und chained den nächsten in `pendingIdxs[0]`.

## Soll (v116)

### Dispatch-Logik (compose-dialog-segments)
1. **N=1**: unverändert (v5 single pass, sync-3 default, Preclip + auto_detect bei 1 validiertem Gesicht — v115).
2. **N≥2** neuer Primary `segments-v116`:
   - **Ein** Sync.so-Generation-Call mit:
     ```json
     {
       "model": "sync-3",
       "input": [
         { "type": "video", "url": "<plate_720p_mp4>", "refId": "plate" },
         { "type": "audio", "url": "<speaker0.wav>", "refId": "spk0" },
         { "type": "audio", "url": "<speaker1.wav>", "refId": "spk1" },
         "..."
       ],
       "segments": [
         {
           "startTime": 0.0,
           "endTime": 2.4,
           "audioInput": { "refId": "spk0" },
           "optionsOverride": {
             "active_speaker_detection": {
               "auto_detect": false,
               "frame_number": 0,
               "coordinates": [cx0, cy0]
             }
           }
         },
         "... per turn ..."
       ],
       "options": { "sync_mode": "cut_off" },
       "webhookUrl": "<sync-so-webhook>"
     }
     ```
   - **Doc-strict**: nur `sync_mode` + `active_speaker_detection`, **kein** `temperature`, **kein** `occlusion_detection_enabled` (v106).
   - **Bei plateDims + resolvedPlateIdentity** → `bounding_boxes_url` statt `coordinates` (per Segment via `optionsOverride.active_speaker_detection.bounding_boxes_url`, JSON in `composer-frames/<userId>/<projectId>/asd/<sceneId>-<turnIdx>-<ts>.json`).
   - **`audioInput` strikt `{ refId }`** (v55 — keine `startTime`/`endTime` im audioInput, Crop nur über `segments[].startTime/endTime`).

### State / DB
- `dialog_shots.engine = 'sync-3-segments-v116'`, `version = 116`, `audio_input_mode = 'ref_only'`.
- **Ein einziger** `sync_so_job_id` pro Szene (statt 1 pro Pass).
- `passes[]` bleibt mit N Einträgen (für Coords/Audio-URLs), aber alle teilen `sync_so_job_id`.
- Neuer Marker `dispatch_mode = 'single-call-segments'` vs `'serial-chain'` (Fallback).

### Webhook (sync-so-webhook)
- Neuer Branch `engine === 'sync-3-segments-v116'`:
  - COMPLETED → Sync.so-MP4 nach `ai-videos/composer/{userId}/{sceneId}-lipsync.mp4` rehosten, `clip_url` setzen, **keine** weiteren Passes triggern (alle Sprecher sind im selben Output enthalten).
  - FAILED / provider_unknown_error → **automatischer Fallback** auf v60 serial chain: `engine = 'sync-3-serial-v60'`, `passes` resetten, ersten Pass mit `bbox-url-pro` re-dispatchen. Refund nur wenn auch Chain-Fallback failed.
- Bestehende v60-Chain-Logik bleibt unangetastet (Fallback-Pfad).

### Frozen-Invariants Update
- I.2 ergänzen: `useV41Official` darf für N≥2 wieder `true` werden, **aber nur** über den neuen v116 Code-Pfad (Model `sync-3`, `audio_input_mode='ref_only'`, doc-strict options).
- I.9 ergänzen: kein parallel fan-out — Segments-API ist `1 Call`, nicht N parallel.
- Neue I.10: v116 Fallback-Kette MUSS bei provider_unknown_error nach v60 serial chain wechseln, sonst Refund.

### Retry-Ladder
- v116 segments-Call hat **eigene** kurze Ladder:
  1. `segments-bbox-url` (sync-3, per-segment `bounding_boxes_url`)
  2. `segments-coords` (sync-3, per-segment `frame_number+coordinates`)
  3. Fallback → v60 serial chain (`bbox-url-pro` → komplette v82-Ladder pro Pass)
  4. Refund

## Was NICHT geändert wird
- Preclip-Pfad (v115) bleibt für N=1.
- Audio-Mux (`render-sync-segments-audio-mux`) unverändert — Output ist eine MP4, kein Mux nötig.
- Pricing: `ceil(durSec) × 9 × N_speakers` Credits bleibt (Sync.so rechnet pro Speaker-Segment ab).
- Idempotenter Refund (v23 server-owned state) unverändert.
- Locked-camera Plate-Prompt unverändert.

## Betroffene Dateien
- `supabase/functions/compose-dialog-segments/index.ts` (v116-Branch + Segments-Builder + Fallback-Marker)
- `supabase/functions/sync-so-webhook/index.ts` (v116-Branch + Auto-Fallback auf v60)
- `supabase/functions/_shared/twoshot-face-map.ts` (per-Segment Coords/BBox-Resolver — kleine Erweiterung)
- `mem/architecture/lipsync/v116-sync3-official-segments-multispeaker.md` (neu)
- `mem/architecture/lipsync/FROZEN-INVARIANTS.md` (I.2/I.9 update, neue I.10)
- `mem/index.md`

## Verifizierung
1. 4-Speaker-Szene: Edge-Logs zeigen **1** `sync.so/v2/generate` POST mit `segments.length === 4` und `input.length === 5` (1 video + 4 audio). Webhook empfängt **1** COMPLETED → 1 finales MP4.
2. 2-Speaker-Szene: gleicher Pfad, `segments.length === 2`, `input.length === 3`.
3. Bei künstlich provoziertem `provider_unknown_error` (z. B. ungültige coords): Webhook setzt `engine='sync-3-serial-v60'` und dispatched ersten Pass mit `bbox-url-pro`. UI zeigt „Fallback auf serielle Chain".
4. N=1 unverändert (single v5 pass).
5. Pricing-Check: 4-Speaker × 6s = 4 × 6 × 9 = 216 credits gleich wie heute.

## Rollback
- Feature-Flag `FORCE_V60_SERIAL = true` in `compose-dialog-segments` setzt sofort zurück auf v60 Chain ohne Code-Revert.