# v129.11 — Deterministic Face-Probe via Frame Extraction

## Problem (Status Quo)
Die Face-Probe schickt aktuell MP4-URLs als `image_url` an Gemini Vision → HTTP 400 → `probe_unavailable` (warn) → Dispatch geht trotzdem an Sync.so → `generation_unknown_error` → Credit weg.

Der Face-Gate ist damit **kosmetisch**, nicht **schützend**. Bevor wir einen weiteren Genery-Versuch starten, muss die Probe deterministisch funktionieren — sonst verbrennen wir wieder Credits am gleichen Symptom.

## Ziel
Face-Gate wird **echt blockierend**: Gemini bekommt ein JPEG des exakten ASD-Frames + Koordinaten und gibt ein verbindliches Urteil (`ok` / `no_face` / `not_at_coord`). Erst dann darf Sync.so dispatchen.

## Lösung

### 1. Neue Edge-Function `extract-video-frame`
- Input: `{ video_url, frame_number, fps }` (oder `time_sec`)
- Lädt MP4 per Range-Request, extrahiert den Frame via `ffmpeg` (Deno-WASM oder `npm:fluent-ffmpeg` Fallback → einfacher: `npm:@ffmpeg-installer/ffmpeg` + child_process; oder Replicate-Helper falls FFmpeg in Deno-Edge zu schwer)
- **Bevorzugt**: Server-seitige Lösung über bestehende `frame_face_cache` Tabelle + Storage-Bucket `composer-frames` (existiert bereits aus Continuity Guardian) → Upload JPEG, return public URL
- Cache: `frame_face_cache` (existiert, 13 cols) — Key: `(video_url, frame_number)`

### 2. `_shared/syncso-face-gate.ts` umstellen
- Statt `image_url: videoUrl` → erst `extract-video-frame` aufrufen, dann `image_url: jpegUrl`
- Probe sendet zusätzlich die normalisierten Koordinaten als Text-Hinweis im Prompt ("Is there a face at normalized coords x=0.5, y=0.45 with tolerance ±0.15?")
- Verdict-Mapping bleibt: `ok` → pass, `no_face` / `not_at_coord` → **hard block + refund** (status 422, `provider_error_code: no_face_pre_sync`)
- Gemini 5xx / Timeout → weiterhin silent fallback (kein false negative)
- Gemini 400 **auf gültiger JPEG-URL** → jetzt fatal (Konfig-Bug), kein silent pass

### 3. `syncso-preflight/index.ts`
- Selber Frame-Extract-Path, damit Forensik exakt das sieht, was der Gate sieht
- UI-Status: `ok` (grün) / `blocked` (rot) / `warn` (gelb, nur bei Gemini-Outage) — kein `skip` mehr im Normalfall

### 4. `compose-dialog-segments` Logging
- `syncso_dispatch_log.meta`: `frame_jpeg_url`, `face_gate_verdict`, `gemini_latency_ms`, `gemini_raw_response`
- Neuer Status: `FACE_GATE_BLOCKED` (mit refund_id) vs. `FACE_GATE_PASSED`

### 5. `SyncsoForensicsSheet.tsx` (v129.11)
- Zeigt extrahiertes Frame-JPEG inline (klein, mit ASD-Box-Overlay)
- Verdict-Badge: PASS / BLOCKED / WARN mit Begründung

## Validierung (nach Deploy)
1. Manueller Re-Dispatch für Scene `ea542657…` → erwartet: entweder PASS+erfolgreicher Sync.so-Run, oder BLOCKED (422, kein Credit-Loss).
2. Forensik-Sheet zeigt JPEG des ASD-Frames, kein `skip` / `gemini_http_400` mehr.
3. Erst wenn (1) sauber durchläuft → **neuer Genery-Versuch** mit echter Szene.

## Out of Scope
- Sync.so Payload-Änderungen
- ASD-Algorithmus-Wechsel
- Hailuo/Preclip Geometrie
- Replay-Experimente

## Risiken
- FFmpeg in Deno-Edge: ggf. zu schwergewichtig → Fallback: Frame-Extract als kleiner Node-kompatibler Replicate-Call oder über bestehenden `extract-video-frames` Helper (falls vorhanden, muss verifiziert werden).
- Gemini-Latenz +500–1500 ms pro Dispatch → akzeptabel, weil Block 9 Credits/s spart.

## Empfehlung
**Erst v129.11 implementieren, dann Genery-Re-Test.** Ein weiterer Genery-Versuch ohne echte Probe würde mit hoher Wahrscheinlichkeit erneut Credits verbrennen, ohne neue Erkenntnis zu liefern.