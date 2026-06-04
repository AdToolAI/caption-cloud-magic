---
name: Multi-Character Lip-Sync Pipeline Hardening (v33)
description: Strict single-flight lock in compose-dialog-segments, timeline-preserving audio (lead-in trim disabled), hard plate-probe preflight for 3+ speakers, serial dispatch for 3+ speaker fan-out, and orphan-job cleanup in sync-so-webhook.
type: architecture
---

**Trigger (Juni 2026)**: Szene `1a9bf866-61fb-4952-8f33-e45985097b6e` (3 Sprecher) ist sauber failed gelandet, aber alle 3 Passes endeten mit `provider_unknown_error` von Sync.so. Logs zeigten drei strukturelle Eigenfehler in unserer Pipeline, die Sync.so reproduzierbar in den `unknown error` zwingen:

1. **Doppel-Dispatch**: zwei Pass-0-Jobs (`e52aba3c…`, `e05d92c4…`) innerhalb von 76 ms. Spätere Webhook-Meldung: `job ... not in passes[]`. `compose-dialog-segments` hatte keinen Single-Flight-Lock obwohl `try_acquire_dialog_lock` existiert.
2. **Audio-Lead-In-Trim verschiebt absolute Sprecher-WAVs**: für Matthew/Kailee wurden ~2.45s/3.82s entfernt. Die isolierten Sprecher-Tracks sind aber silence-padded auf 9s, damit ihre absolute Timeline zur 9s-Plate passt. Mit `sync_mode='cut_off'` führt der zeitliche Versatz zu Sync.so-FAILED.
3. **`plate=probe-failed` → still auf 1280x720 fallen**: Face-Koordinaten landeten daneben, Sync.so antwortete mit `unknown error`.
4. **Aggressive Fan-Out-Parallelität**: 3 Passes parallel pro Szene erhöhte Race-Risiko + Provider-Stress.

**v33 Fixes**:

1. **`compose-dialog-segments` Strict Single-Flight**: direkt nach `scene_id`-Validierung wird `try_acquire_dialog_lock(_ttl_seconds: 90)` aufgerufen. Bei Contention sofort `202 scene_lock_busy` — kein „proceed without lock" mehr für diese Funktion. Release in `finally`-Block am Ende des `serve()`-Handlers, damit jeder Return-Pfad (auch frühe 422/202) den Lock freigibt.

2. **Audio-Trim DEAKTIVIERT für v25 Fan-Out**: der gesamte `trimWavLeadIn`-Block (v28/v29) ist entfernt. Lead-In wird nur noch informativ geloggt; `repair_audio` ist zur Zeit ein No-Op (TODO: timeline-erhaltende kanonische Re-Enkodierung implementieren, die nur den 44-Byte-WAV-Header neu schreibt ohne Frames zu droppen).

3. **Hard-Preflight für 3+ Sprecher bei `plate=probe-failed`**: `compose-dialog-segments` failt jetzt mit `plate_probe_failed_3plus_speakers` + idempotentem Refund, wenn `probeMp4Dims` null liefert und `speakers.length >= 3`. 1/2-Sprecher behalten den 1280x720-Fallback.

4. **Serial Dispatch für 3+ Sprecher**: `fanOutAllowed = passes.length <= 2`. Bei 3+ Sprechern wird nur Pass 0 initial dispatched; der Webhook chained Pass 1..N-1 nacheinander beim COMPLETE-Event (`pendingIdxs[0]`). 2-Sprecher fan-outen weiter parallel.

5. **Webhook Orphan-Cleanup**: `sync-so-webhook` bei `job not in passes[]` jetzt: `releaseInflightSyncJob()` + best-effort `DELETE /v2/generations/{id}`. Verhindert lecke Sync.so-Concurrency-Slots und bezahlte Generations ohne State.

**Unverändert**: v23 Server-Owned State, v24 Unified Multi-Pass, v25 Fan-Out Architektur, v30 coords-pro-box Retry-Ladder, v31 FaceMap-BBox, v32 Circuit-Loop-Fix. Pricing weiterhin `ceil(durSec) × 9 × N_passes`.

**Bekannter offener Punkt**: timeline-erhaltende WAV-Reparatur (kanonisches Re-Encoding ohne Frame-Drop). `repair_audio` Flag ist nur noch Logging.
