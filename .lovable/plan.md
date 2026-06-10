# Welle C — Native Sync.so Segments + Speaker Selection

Ersetzt den aktuellen "3× Pass + Preclip + Crop + ffmpeg-Mux"-Pfad durch den **offiziell** dokumentierten Sync.so-Weg für Multi-Speaker-Szenen: **ein einziger** `/v2/generate`-Call mit `segments`-Array und `active_speaker_detection` pro Segment. Löst direkt den aktuellen Bug (nur Sprecher 1 animiert, Sprecher 2+3 frozen) und halbiert die Sync-Kosten bei ≥2 Sprechern.

---

## Ziel

- Bei **n ≥ 2 Sprechern** in einer Dialog-Szene: 1 Hailuo-Plate → **1 Sync.so-Generation** mit `segments[]` → fertig. Kein Preclip, kein Crop, kein eigener Mux.
- Bei **n = 1 Sprecher**: unverändert (bestehender Single-Pass-Pfad).
- FaceMap-Daten (bereits in `frame_face_cache` / `plate_face_cache`) werden 1:1 als `bounding_boxes` an Sync übergeben — keine Auto-Detect-Lotterie.

---

## Architektur (neuer Pfad)

```text
compose-dialog-scene
        │
        ▼  (plate + drehbuch + face_map)
  dialog_shots row (1 row pro Szene statt 1 row pro Turn)
        │
        ▼
render-sync-segments-native   ◄── NEU (ersetzt -audio-mux)
        │  baut EINEN Sync-Call:
        │   input: [plate.mp4, audio_t1, audio_t2, ...]
        │   segments: [{startTime, endTime, audioInput.refId,
        │              optionsOverride.active_speaker_detection.bounding_boxes_url}]
        │  ▼
        sync.so /v2/generate  (model=lipsync-2, eine Generation-ID)
        │
        ▼
sync-so-webhook  → patcht dialog_shots.clip_url direkt
                    (kein ffmpeg, kein zweiter Mux-Step)
```

---

## Scope der Änderungen

### A) Neue Edge Function `render-sync-segments-native`
- Input: `scene_id`
- Lädt `dialog_shots` (1 row) + alle `turns[]` (startTime/endTime/audio_url/speaker_id) + FaceMap pro Sprecher
- Pro Sprecher: schreibt eine `bounding_boxes.json` nach Storage-Bucket `sync-bounding-boxes/<scene_id>/<speaker_id>.json` (per-frame `[x1,y1,x2,y2]` oder `null`)
- Baut **einen** Sync.so-Request:
  - `input`: Plate-Video + n Audio-Inputs mit `refId = turn_<i>`
  - `segments[]`: pro Turn `{ startTime, endTime, audioInput: { refId }, optionsOverride: { active_speaker_detection: { bounding_boxes_url: "<signed url>" }, occlusion_detection_enabled: true } }`
  - `model: "lipsync-2"`, optional `lipsync-2-pro` bei "premium"-Plan
- Speichert `sync_generation_id` in `dialog_shots`
- Idempotenter Credit-Refund bei 4xx/5xx (gleiches Schema wie bisher)

### B) `sync-so-webhook` Anpassung
- Erkennt neuen Render-Typ (`render_mode = 'segments-native'`)
- Bei Completion: lädt `output_url` direkt nach `clip_url` + setzt Status `done` — überspringt die `render-sync-segments-audio-mux`/ffmpeg-Stage komplett.

### C) `compose-dialog-scene` / `poll-dialog-shots`
- Neuer Branch: wenn `turns.length >= 2` → `render-sync-segments-native` aufrufen statt 3× `dispatch-syncso-pass`.
- Single-Speaker (`turns.length === 1`) bleibt unverändert auf bestehendem Pfad.
- `dialog_shots`-Schema bekommt optionale Felder: `render_mode TEXT DEFAULT 'passes'`, `sync_generation_id TEXT`.

### D) Storage-Bucket `sync-bounding-boxes` (privat)
- Pro Sprecher 1 JSON-File mit `{ "bounding_boxes": [[x1,y1,x2,y2] | null, ...] }`
- Signed-URL (1h TTL) wird in den Sync-Request injiziert
- RLS: nur Owner + service_role

### E) Memory-Update
- `mem://architecture/lipsync/sync-so-pro-model-policy` ergänzen: Pricing-Formel ändert sich von `9 × n_speakers × seconds` zu `9 × seconds` (egal wie viele Sprecher), da nur **eine** Generation läuft.
- `mem://features/video-composer/dialog-shot-pipeline` ergänzen: neuer `segments-native` Render-Mode.

---

## Was bleibt unverändert

- `compose-dialog-scene` (Plate-Generation per Hailuo)
- `frame_face_cache` / `plate_face_cache` (FaceMap-Daten)
- Welle A (Locks, Watchdog, Idempotenz)
- Single-Speaker-Pfad
- Sync.so-Webhook-Secret + Auth
- Credit-Refund-Garantie

## Was wird obsolet (bleibt aber als Fallback eingebunden)

- `dispatch-syncso-pass` (Per-Speaker-Call) — nur noch Fallback wenn `render_mode='passes'` explizit gesetzt ist
- `render-sync-segments-audio-mux` (Crop + ffmpeg-Mux) — nur noch Fallback
- Preclip-Generation (`renderPassFacePreclip`) — entfällt im neuen Pfad

→ Wir entfernen sie **nicht** sofort. Feature-Flag `dialog_render_mode` in `system_config` schaltet zwischen `segments-native` (Default) und `passes` (Fallback).

---

## Migration & Rollout

1. **Migration**: 2 neue Spalten an `dialog_shots` (`render_mode`, `sync_generation_id`), neuer Storage-Bucket `sync-bounding-boxes`, Feature-Flag.
2. **Deploy**: `render-sync-segments-native`, `sync-so-webhook` (patch).
3. **Test auf bestehender Szene** `e451083e-2c89-46e9-8228-8164583167f2` mit `force_remux=true` + `render_mode=segments-native` (kein neues Plate nötig, neuer Sync-Call).
4. **Verifikation**: Download Output → Frame-Stack bei t=1s/4s/7s → alle 3 Münder müssen sich bewegen.
5. **Rollout**: Feature-Flag global auf `segments-native`. Alter Pfad bleibt 2 Wochen als Fallback.

---

## Kosten- & Risiko-Impact

| | Alt (3 Passes + Mux) | Neu (Segments-Native) |
|---|---|---|
| Sync.so Calls / 9s-Szene | 3 × €0.81 = €2.43 | 1 × €0.81 = **€0.81** |
| ffmpeg-Mux | ja (Edge-Funktion, ~20s) | **nein** |
| Lambda-Crop-Math | ja (Bug-Quelle) | **nein** |
| Speaker-Targeting | eigene Logik (kaputt) | **Sync nativ** (offiziell) |
| Code-Pfade | 4 Funktionen | 1 Funktion |

---

## Out of Scope

- Single-Speaker-Pfad (bleibt)
- Sync.so-Pro vs Standard (orthogonal, weiter über Plan-Code gesteuert)
- Welle B (parallele Passes) — wird durch Welle C **überflüssig**, aber nicht aktiv entfernt
- HeyGen / Cinematic-Sync-Pfad (anderer Engine-Typ)

---

## Erfolgskriterien

1. Szene mit 3 Sprechern: alle 3 Münder animiert in finalem `clip_url`.
2. Sync.so-Credit-Verbrauch pro Szene exakt `ceil(seconds) × 9` Credits (unabhängig von n).
3. `dialog_shots.render_mode='segments-native'` für neue Szenen, alte Szenen weiter mit `passes` bedienbar.
4. Refund bei Sync-Failure idempotent verbucht.
