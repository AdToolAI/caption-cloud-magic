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

**v298 — Watchdog-Härtung**
- `autopilot-finalize` hält `heartbeat_at` über alle Stufen (Audio, Finalizing, Render-Poll alle 60 s) und lehnt Doppelaufrufe mit `already_finalizing` ab, solange eine Endschnitt-Stufe frisch atmet.
- Watchdog nutzt für Endschnitt-Stufen (`audio|voice|music|sfx|finalizing`) 30 min statt 12 min Frist — verhindert doppelten Lambda-Render.
- Alle Watchdog-Zweige setzen Heartbeat + `resume_attempts`; nach verbrauchten Versuchen wird `failed` gesetzt statt endlos neu zu finalisieren.
- Orchestrator: Resume antwortet 200 (`scenes.length` statt `body.scenes.length`); `completed_at` nur bei echtem Ende.
