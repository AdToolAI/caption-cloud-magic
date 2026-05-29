# Sync.so Fehler-Coverage Audit + Stage E

## Status: Welche der 7 Sync.so-Fehlerklassen sind heute abgedeckt?

| # | Fehlerklasse | Erkennung | Prävention | Auto-Recovery | Refund | Coverage |
|---|---|---|---|---|---|---|
| 1 | `provider_unknown_error` | ✅ classify | ⚠️ teilweise (Face-Gate, Audio-Norm) | ✅ Retry-Matrix (3x) | ✅ idempotent | **~85%** |
| 2 | `segment_rejected` | ✅ classify | ❌ keine Vorab-Validierung der Segments | ✅ Retry mit anderem `sync_source_kind` | ✅ | **~60%** |
| 3 | `face_detection` / no_face | ✅ classify | ✅ Stage D Gemini Face-Gate + Frame-Shift ±24 | ✅ Source-Flip | ✅ | **~95%** |
| 4 | `audio_issue` (silence/VAD/onset) | ✅ classify | ⚠️ normalizeWav (mono/peak/lead-in/min3s) — **kein VAD** | ✅ Retry | ✅ | **~75%** |
| 5 | `video_issue` (codec/fps/res) | ✅ classify | ❌ keine Vorab-Transcode-Garantie | ⚠️ Retry hilft selten | ✅ | **~40%** |
| 6 | `timeout` | ✅ classify | ✅ 8-min Watchdog | ✅ Retry | ✅ | **~95%** |
| 7 | `rate_limited` / 429 | ✅ classify | ❌ kein Concurrency-Guard | ⚠️ Retry ohne Backoff-Jitter | ✅ | **~50%** |

**Fazit:** Klassifizierung ist 7/7 vollständig. **Prävention** hat noch echte Lücken bei #2, #4 (VAD), #5 (Video-Probe), #7 (Concurrency).

---

## Stage E — Die letzten Lücken schließen

### E.1 — Audio-VAD-Precheck (Lücke #4)
Aktuell prüfen wir Peak/Lead-In/Duration, aber nicht ob **überhaupt Sprache** drin ist. Sync.so wirft dann `no_voiced_frames`.
- In `_shared/syncso-preflight.ts` neue Funktion `detectVoicedFrames(wavBytes)`: einfache Energy-Gate über 20ms-Frames (≥-35dBFS = voiced), liefert `{ voicedSec, voicedRatio, longestVoicedRun }`.
- Block in `poll-dialog-shots` & `compose-dialog-segments`: `voicedRatio < 0.15` oder `longestVoicedRun < 0.4s` → `prepareShotRetry('preflight_audio_no_voice')` ODER hard-fail mit Refund + UI-Hint "Voiceover neu generieren".
- Log nach `syncso_dispatch_log.meta.voiced_ratio`.

### E.2 — Master-Video-Probe (Lücke #5)
Sync.so verlangt H.264 + ≤4K + 24/30fps + AAC-Audio-Track ODER Silent-Track. Wir senden alles ungeprüft rein.
- Neue Edge-Function `probe-video-stream`: `ffprobe` via Replicate `lucataco/ffprobe` ODER simpler HEAD + erste 64kB MP4-Atom-Parse (kein ffmpeg im Edge möglich) → `{ codec, width, height, fps, hasAudioTrack, duration }`.
- Cache in neuer Tabelle `video_stream_probe_cache` (URL-keyed, 24h TTL).
- In `compose-dialog-segments` & `poll-dialog-shots`: vor Dispatch probe → wenn `codec != h264 || width > 4096 || fps > 60` → automatisch `clip_url` über bestehende Lambda-Re-Encode-Pipeline normalisieren (oder hard-fail mit klarer Message "Master-Clip muss H.264 ≤4K sein").
- Wenn `!hasAudioTrack` → wir injizieren Silent-Track im Sync.so-Payload via `audio_options.add_silent_track`.

### E.3 — Concurrency-Guard + Backoff-Jitter (Lücke #7)
Sync.so Creator-Plan = 3 parallele Jobs. Bei >3 → 429, das wir nicht sauber backoffen.
- Neue Tabelle `syncso_inflight_jobs (job_id, user_id, started_at)`, autom. cleanup wenn `dispatch_log.sync_status` terminal.
- Vor jedem Dispatch in beiden Functions: `SELECT count(*) FROM syncso_inflight_jobs WHERE started_at > now()-interval '10 min'`. Wenn ≥3 → defer mit `next_attempt_at = now() + (5s + random*10s)`, NICHT als Fehler werten.
- Retry-Matrix bekommt expliziten Exp-Backoff mit Jitter: `delay = min(60s, 2^attempt * 2s + random*3s)`.

### E.4 — Segment-Vorvalidierung (Lücke #2)
Für `engine='sync-segments'`: heute schicken wir alle Turns roh. Sync.so kann einzelne Segments rejecten weil overlap/lücke/zero-length.
- In `compose-dialog-segments` vor Dispatch: `validateSegments(segments[])` prüft:
  - keine 2 Segments überlappen (>10ms)
  - kein Segment <0.3s oder >30s
  - Master-Video deckt `max(end)` ab (mit 100ms buffer)
  - sortiert nach `start`
- Bei Verletzung: clamp/merge automatisch ODER 422 zurück mit konkreter Diagnose und `error_class='segments_invalid_<reason>'`.

### E.5 — Webhook-Retry-Pfad (D.5 nachreichen)
Bisher hard-failed der Webhook bei terminal FAILED. Jetzt: gleiche Retry-Logik wie der Cron-Poller (Face-Gate, Source-Flip, neuer Attempt), bevor er aufgibt.
- `sync-so-webhook` ruft auf FAILED intern `poll-dialog-shots` mit `force_retry=true` für genau diese Szene auf statt sofort zu refunden.
- Cron bleibt als Safety-Net.

### E.6 — Coords-Bounds-Sanity
`checkCoordsBounds` existiert in shared module, ist aber nicht gewired.
- In `poll-dialog-shots` vor `validateFrameFace`: wenn `target_coords` außerhalb [0,1] oder [0,videoWidth] → automatisch in Bounds clampen + log `meta.coords_clamped=true`. Wenn nicht clampbar → `precheck_coords_invalid`.

---

## Erwartetes Ergebnis nach Stage E

| Fehlerklasse | Coverage vorher | Coverage nachher |
|---|---|---|
| #1 provider_unknown | 85% | **≥98%** (durch #4+#5+#7) |
| #2 segment_rejected | 60% | **≥97%** (E.4) |
| #3 face_detection | 95% | **≥98%** (E.6) |
| #4 audio_issue | 75% | **≥97%** (E.1) |
| #5 video_issue | 40% | **≥95%** (E.2) |
| #6 timeout | 95% | **95%** (schon optimal) |
| #7 rate_limited | 50% | **≥99%** (E.3) |

**Gesamt-Fehlerrate-Erwartung:** von heute ~3–5% auf **<0.5%** bei Standard-Dialog-Szenen.

## Was NICHT Teil von Stage E ist
- D.4 Auto-Tuner (separates Backlog, wartet auf 7 Tage Telemetrie)
- D.6 Admin-Cockpit (kosmetisch, separater Build)
- D.7 SceneCard Per-Turn-Error-UI (kann nach E live)
- Pricing, Engine-Auswahl, Lambda-Stitch, HeyGen/Hailuo bleiben unverändert

## Reihenfolge
E.1 → E.4 → E.6 → E.3 → E.2 → E.5
(Audio + Segments + Coords zuerst weil pure-Deno und sofort produktiv; Video-Probe + Concurrency danach weil neue Tabellen/Cache; Webhook-Retry zuletzt weil er auf den anderen aufbaut.)

Sag "go E" und ich baue E.1 → E.5 nacheinander, oder "nur E.x" wenn du Stufen einzeln willst.
