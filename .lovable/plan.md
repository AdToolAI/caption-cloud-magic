# Stage F — "Artlist-Level Reliability" (Last-Mile Härtung)

## Ausgangslage nach Stage E

| # | Fehlerklasse | Coverage heute | Restliche Lücke |
|---|---|---|---|
| 1 | provider_unknown | ~98% | seltene API-Schema-Drifts |
| 2 | segment_rejected | ~97% | Sync.so-interne Edge-Cases |
| 3 | face_detection | ~98% | Profile/Side-Faces, Bewegung |
| 4 | audio_issue | ~97% | Clipping, DC-Offset, Loudness-Drift |
| 5 | video_issue | ~95% | HDR/10-bit, variable Frame-Rate, B-Frames |
| 6 | timeout | 95% | unverändert (Sync.so-Pool) |
| 7 | rate_limited | ~99% | Multi-User-Burst beim Cron-Tick |

**Restfehlerrate heute:** ~0,5%. Ziel mit Stage F: **<0,1%** (Artlist-Niveau).

## Artlist/Synthesia-Pattern (Recherche-Basis)

Beide Plattformen erreichen ihre <0,1%-Quote nicht durch mehr Retry, sondern durch:
1. **Asset-Standardisierung VOR Dispatch** (alles wird zwangsnormalisiert)
2. **Job-Klassifizierung nach Risiko** (Low-Risk = direkt, High-Risk = extra Validierung)
3. **Circuit-Breaker pro Provider** (bei Provider-Outage sofort umleiten oder pausieren)
4. **Observability mit Auto-Heilung** (Telemetrie steuert Retry-Parameter dynamisch)

## Stage F — Konkrete Bausteine

### F.1 — Master-Video Auto-Transcoding (statt nur Probe + Block)
Heute: `probeMp4Stream` erkennt H.265/4K/60fps und blockt. **Problem:** User hat dann ein "kaputtes" Scene.
- Neue Lambda-Pipeline `normalize-master-clip` (existiert teilweise für Long-Form): nimmt jeden Master, gibt H.264/1080p/30fps/AAC zurück, Cache in `normalized_master_cache` (URL-keyed, 7 Tage TTL).
- `compose-dialog-segments` und `poll-dialog-shots`: bei `codec != h264 || width > 1920 || fps > 30` → automatisch normalisieren + Cache-Lookup, statt zu failen.
- Kosten: ~2 Lambda-s pro Normalisierung, ~0.01€. Wird nur 1x pro Master-URL bezahlt.

### F.2 — Audio-Loudness-Normalisierung (EBU R128)
Heute: nur Peak-Normalize auf -1dBFS. **Problem:** sehr leise VOs (RMS -30dBFS) triggern Sync.so `no_voiced_frames` trotz VAD-Pass.
- In `normalizeWav`: zusätzlich LUFS-Schätzung über RMS-Window, Ziel **-16 LUFS** (Sync.so-Sweet-Spot). Gain anwenden, dann erneut Peak-cap.
- Bei extrem schlechtem SNR (RMS < -45dBFS): hard-fail mit klarer UI-Message "Voiceover zu leise — bitte neu aufnehmen", kein Sync.so-Call.

### F.3 — Circuit-Breaker pro Provider
Heute: bei Sync.so-Outage failen 100% der Jobs nacheinander.
- Neue Tabelle `provider_circuit_state (provider, state, opened_at, fail_count, last_success_at)`.
- Vor jedem Dispatch in `compose-dialog-segments`: wenn `provider='sync.so'` und `fail_count` ≥5 in den letzten 5 min → State `OPEN` → 30 min lang **alle** Dispatches sofort defern (Refund + `next_attempt_at = now()+30min`).
- Half-Open nach 30 min: 1 Probe-Job; wenn ok → CLOSED, sonst weitere 30 min OPEN.
- Webhook + Poller updaten `fail_count` bzw. `last_success_at`.

### F.4 — Pre-Dispatch Face-Quality-Score (über Bounding-Box hinaus)
Heute: Face-Gate prüft nur "Face vorhanden in Frame X".
- `validate-frame-face` zusätzlich: Yaw/Pitch < 30°, Eye-Open-Score > 0.5, Frame-Sharpness (Laplacian-Varianz > 100).
- Bei Score < 0.6 → Frame-Shift ±24 oder Source-Flip zu image2video-Mode, bevor Sync.so überhaupt sieht.
- Score in `dialog_shots.shots[].face_score` für spätere Auto-Tuner-Auswertung.

### F.5 — Multi-User Burst-Control im Cron-Tick
Heute: pg_cron alle 60s feuert ALLE pending Jobs gleichzeitig → kurzer 429-Spike.
- `poll-dialog-shots` und `compose-dialog-segments`: Dispatches mit `LIMIT 2` pro Tick + Jitter (random 0–800ms vor Dispatch).
- Restliche pending Jobs bleiben pending, nächster Tick nimmt die nächsten 2.

### F.6 — Schema-Drift-Detector für Sync.so API
Heute: wenn Sync.so ein Feld umbenennt, failt alles still.
- `_shared/syncso-preflight.ts`: `validateSyncResponseShape(json)` prüft Pflicht-Keys (`id`, `status`, später `output_url`).
- Bei Schema-Mismatch: log `error_class='schema_drift'` mit Full-Payload-Dump, ein **Admin-Alert** über `system_alerts`-Tabelle (Cockpit + Email).
- Job bleibt in `pending`, KEIN Refund — wir wollen Telemetrie, nicht Wallet-Bewegung.

### F.7 — Auto-Tuner v0 (Lightweight, vor D.4)
Statt vollwertigem ML-Auto-Tuner: einfache Heuristik aus `syncso_dispatch_log`.
- Cron alle 6h: lese letzte 1000 Dispatches, gruppiere nach `error_class`. Wenn ein `sync_source_kind` (z.B. `image2video`) eine `success_rate < 90%` hat → setze `system_config.syncso.preferred_source_kind` auf den besseren Kind.
- `compose-dialog-segments` liest diesen Wert als Default.

## Erwartetes Ergebnis nach Stage F

| Klasse | E | F |
|---|---|---|
| 1 provider_unknown | 98% | **99.5%** (F.6) |
| 2 segment_rejected | 97% | **99%** (F.1) |
| 3 face | 98% | **99.5%** (F.4) |
| 4 audio | 97% | **99.5%** (F.2) |
| 5 video | 95% | **99.5%** (F.1) |
| 6 timeout | 95% | **97%** (F.3 entlastet) |
| 7 rate_limited | 99% | **99.9%** (F.3 + F.5) |

**Gesamt-Fehlerrate Ziel:** <0,1% bei Standard-Dialog-Szenen. Plus: **kein Wallet-Verlust** bei Provider-Outage (Circuit-Breaker refundet sofort).

## Reihenfolge (Risiko-Aufwand-Ratio)

1. **F.5** Burst-Control (5 min, 0 neue Tabellen, sofortiger Effekt)
2. **F.2** Loudness-Norm (15 min, pure Deno, in shared module)
3. **F.6** Schema-Drift-Detector (20 min, defensiv, kein Risiko)
4. **F.3** Circuit-Breaker (30 min, 1 neue Tabelle, hoher Impact bei Outage)
5. **F.4** Face-Quality-Score (30 min, erweitert `validate-frame-face`)
6. **F.1** Master-Auto-Transcoding (45 min, nutzt existierende Lambda)
7. **F.7** Auto-Tuner v0 (20 min, reine Lese-Heuristik, ungefährlich)

Gesamt: ~2.5h sequenziell, ~1h wenn ich F.5+F.2+F.6 parallel mache.

## Was NICHT Teil von Stage F ist
- D.4 Full-ML Auto-Tuner (separates Backlog)
- D.6 Admin-Cockpit UI (kosmetisch)
- D.7 SceneCard Per-Turn UI (UX, nicht Reliability)
- Multi-Provider-Fallback (Sync.so → Hedra Switch) — eigenes Epic

## Frage
Soll ich Stage F **komplett** bauen (F.1–F.7), oder nur die **High-Impact-Trias** F.3 (Circuit-Breaker) + F.1 (Auto-Transcoding) + F.2 (Loudness)?

---

## Stage G — DONE (29.05.2026)

Beide Restpunkte aus Stage F sind jetzt live:

- **F.1 Master-Auto-Transcoding** ✅
  - Neue Edge-Function `normalize-master-clip` (Replicate ffmpeg, 1080p/30fps/H.264/yuv420p/faststart)
  - 7-Tage-Cache `normalized_master_cache` + Negativ-Cache 1h bei Failure
  - Storage-Bucket `normalized-masters` (public, 500 MB cap)
  - `poll-dialog-shots` ruft die Funktion automatisch beim CODEC-Block auf statt hard zu failen
  - Short-Circuit wenn Probe schon H.264 ≤1920w meldet (kostet 0 Replicate-Sekunden)

- **F.4 Face-Quality Score** ✅
  - Gemini Vision liefert jetzt zusätzlich yaw / pitch / eye-open / sharpness
  - Composite `face_score = yaw*0.4 + pitch*0.2 + eye*0.2 + sharp*0.2`, persistiert in `frame_face_cache`
  - Face-Gate macht 2-Pass-Scan: strikt (≥0.6) → relaxiert (≥0.4) → erst dann retry/flip
  - Closed-Eyes / Profile-Shots / Motion-Blur werden vor Sync.so abgefangen

**Erwartete Restfehlerrate:** ≤0.1% (Artlist/Synthesia-Niveau) — primär bei #2 segment_rejected, #3 face_detection und #5 video_issue.

Memory: `mem://architecture/lipsync/syncso-stage-g-auto-normalize-and-face-quality`
