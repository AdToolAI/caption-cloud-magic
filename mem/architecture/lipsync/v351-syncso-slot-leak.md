---
name: v351 Sync.so Slot-Leak Fix
description: Orphan-Slot-Sweep gegen dauerhaft belegte Sync.so-Concurrency-Slots ("Wartet auf Sync.so-Slot 4/3")
type: architecture
---

# v351 — Sync.so Slot-Leak

## Symptom
Szene hängt auf `twoshot_stage='deferred'`, Log `DEFERRED / rate_limited`,
UI zeigt "Wartet auf Sync.so-Slot… 4/3".

## Ursache
Slots (`syncso_inflight_jobs`, `MAX_INFLIGHT = 4`) werden nur vom Webhook
freigegeben, der einen Job über `dialog_shots.passes[].job_id` auflöst.
Jeder Reset, der `dialog_shots` auf NULL setzt, während Jobs laufen,
verwaist die Zeilen → Webhook loggt `no_scene_match`, Slot bleibt belegt.

## Regeln
- `sweepOrphanInflightSyncJobs()` (`_shared/syncso-preflight.ts`) läuft in
  jedem `lipsync-watchdog`-Tick: löscht abgelaufene Zeilen und Zeilen > 4 min,
  deren `job_id` von keiner Szene mehr referenziert wird.
- `sync-so-webhook` gibt den Slot auch bei `no_scene_match`,
  `already_applied` und `canceled` frei.
- Client darf `dialog_shots: null` nie direkt schreiben, wenn aktive Passes
  existieren → `resetSceneLipSync()` aus `src/lib/lipsyncReset.ts` benutzen,
  das über die Edge-Function `reset-lipsync-scene` cancelt/refundet.
