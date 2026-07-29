---
name: Autopilot Resilience (v297)
description: Autopilot scene retry (2 attempts + still-image rescue), production heartbeat/resume watchdog, and 3-scene concurrency with serialized lip-sync
type: feature
---

**Szenen-Retry** (`_shared/autopilotRetry.ts`)
- `MAX_SCENE_ATTEMPTS = 2`. Zweiter Anlauf nutzt `repairAnchorPrompt` (weniger Personen, entschärfte Bewegung) bzw. `repairMotionPrompt` (Gesichtsfokus bei Dialogszenen / Framing-Fehlern).
- Ein bereits freigegebener Anker wird beim zweiten Anlauf **nicht** neu bezahlt.
- Nach beiden Anläufen: Szene wird mit `fallback_kind='still'` als Standbild (Ken-Burns) in den Endschnitt genommen — Laufzeit bleibt erhalten, keine Motion-Credits. Nur ohne Anker wird die Szene `failed`.

**Watchdog** (`autopilot-watchdog`, pg_cron alle 3 min)
- `autopilot_productions.heartbeat_at` wird nach jeder Szene geschrieben; älter als 12 min = tot.
- Bis zu 2 Resumes über `autopilot-orchestrate` mit `{ production_id, resume: true }` (Service-Key-Auth, Szenen aus DB rekonstruiert, `completed` wird übersprungen).
- Alle Szenen fertig, aber kein Endschnitt → `autopilot-finalize` erneut. Danach: `failed` mit Begründung.

**Parallelität**
- `SCENE_CONCURRENCY = 3` Worker-Pool. Lip-Sync-Szenen laufen über einen Mutex seriell (Sync.so-Slots).
- `outOfCredits` stoppt den gesamten Pool.

Nicht angefasst: `compose-dialog-segments`, `sync-so-webhook`, geteilte Lip-Sync-Module.
