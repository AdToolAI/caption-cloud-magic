# Alpha-Plan: Multi-Speaker Lipsync Pipeline (Sync.so v3)

## Leitprinzipien

1. **Preflight-Invariants statt Postflight-Recovery** — Was nicht vorher validiert ist, wird nicht gestartet.
2. **Eine Hypothese pro Version** — jede Stage ändert genau eine Variable.
3. **Stabilität zuerst, Speed danach** — Parallelisierung erst, wenn der Single-Pass-Pfad 5/5 grün ist.
4. **Determinismus vor Heuristik** — `sizeRatio`, `auto_detect`, "best guess" sind nur Telemetrie, nie Steuerung.
5. **Single Source of Truth** — Webhook und Watchdog lesen Variant/Model/Targeting **nur** aus `syncso_dispatch_log` (persisted attempt), nie aus Defaults.

---

## Stage 0 — Forensik & Freeze (read-only, 0 Code-Änderungen)

**Ziel:** Verstehen, was v127 tatsächlich tut, bevor wir es ersetzen.

- Dump der letzten 20 `dialog_shots` mit allen Attempts aus `syncso_dispatch_log` (variant, model, segments, response_status, latency, completion_outcome).
- Audit von `dialog_dispatch_locks`: TTL, Cleanup-Pfad, Race-Window beim Webhook-Trigger.
- Code-Walk durch den Webhook-Dispatch: woher kommt `variant`/`model` beim Re-Dispatch? Wird die persisted attempt geladen oder ein Default genommen?
- Visuelle Inspektion (3–5 Sample-Plates): Sind Center-Speaker-Münder in der Hailuo-Plate überhaupt artikuliert genug zum Syncen?
- Liefer-Artefakt: ein Markdown-Report `docs/lipsync/v127-forensics.md` mit Befunden, **keine** Code-Edits.

**Exit-Kriterium:** Wir wissen exakt, **warum** Samuel/Matthew unsynced bleiben (Targeting? Plate? Dispatch?). Erst dann Stage 1.

---

## Stage 1 — Hotfix v128 (Stabilität, keine neuen Features)

**Hypothese:** Der Retry-Loop und der Webhook-Default-Variant sind die akuten Defekte. Wenn beide weg sind, ist die Pipeline in 3–4 min grün, auch wenn Center-Sync noch nicht final korrekt ist.

Vier minimal-invasive Änderungen, alle in einem PR, einzeln revertierbar:

1. **sizeRatio downgrade auf Logging.** `sizeRatio` schreibt nur in `syncso_dispatch_log.heuristics`, triggert nie einen NOOP-Retry. Counter bleibt für spätere A/B-Auswertung.
2. **NOOP-Retry-Budget = 0.** Pass-Outcome `NOOP_DETECTED` ist terminal: kein Re-Dispatch, kein Modell-Swap, kein Lock-Renewal. Pass wird sofort als `PASS_DONE_SUSPECT` markiert (siehe Stage 3 für UI).
3. **Webhook liest Variant/Model aus persisted attempt.** Pflicht-Lookup in `syncso_dispatch_log` per `(shot_id, attempt_idx)`. Wenn der Lookup fehlschlägt → Pass `PASS_FAILED` + Refund (statt stillem Default).
4. **`dialog_dispatch_locks` härten.** TTL hart 8 min (= Sync.so-Watchdog), `expires_at`-Index, Cleanup-Cron alle 2 min, eindeutige Constraint `(shot_id, pass_idx)`. Race-Test: 2 Webhooks für denselben Pass innerhalb 100 ms → genau 1 Dispatch.

**Exit-Kriterium:** 5 konsekutive Dialog-Renders (3 Speaker, 2 Turns) ohne hängenden Pass, total ≤ 4 min. Center-Speaker-Sync darf noch falsch sein — wichtig ist, dass die Pipeline durchläuft und korrekt klassifiziert.

---

## Stage 2 — Audit-Layer v128.1 (Diagnose-Infrastruktur)

**Hypothese:** Ohne reproduzierbare Artefakte raten wir weiter. Vor jedem `sync.so` call werden die Invariants persistiert.

Pro Pass in den `composer-debug` Bucket schreiben (Pfad `<userId>/<projectId>/<sceneId>/<shotId>/<passIdx>/`):

- `preflight.json` — `{plate_url, plate_duration, plate_fps, audio_url, audio_duration, speaker_id, target_mode, target_payload, model, variant, sync_mode}`
- `faces.json` — Frame-by-Frame Face-Detect-Output (vom bestehenden `frame_face_cache`) für die ersten 1 s der Plate, inkl. bbox+confidence pro Face.
- `sync_request.json` — exakter Payload an Sync.so (ohne Secrets).
- `sync_response.json` — Sync.so-Response inkl. completion_outcome.
- Optional `preview.mp4` (5 s) wenn `completion_outcome != FULL_SYNC`.

DB: neue Spalte `syncso_dispatch_log.debug_path` (text, nullable). Cleanup-Cron: löscht Debug-Artefakte > 14 Tage.

**Exit-Kriterium:** Für jeden hängenden/falschen Pass haben wir innerhalb von 30 s die vollständige Forensik.

---

## Stage 3 — UI- und Refund-Verhalten

**Frage an User (steht offen, blockiert nicht):** Bei `PASS_DONE_SUSPECT` (sizeRatio-Warning) → silent durchlassen mit Badge, oder als Fail behandeln mit Refund?

Default-Plan bis User entscheidet:

- `PASS_DONE_SUSPECT` → Stitch läuft mit gesyncter Spur weiter, UI zeigt gelbes Badge "Lipsync evtl. nicht angewendet (Center-Speaker)", **kein** Refund, manueller Retry-Button.
- `PASS_FAILED` (echter Sync.so-Error, Timeout, Webhook-Lookup-Miss) → Stitch nutzt Original-Plate-Audio, Auto-Refund anteilig (`ceil(passSec) * 9` credits via idempotenter Refund-Key `(shot_id, pass_idx, attempt_idx)`).
- Beide Zustände in `composer_scenes.lipsync_status` persistiert für spätere Auswertung.

---

## Stage 4 — Targeting-Korrektheit v129 (eine Hypothese pro PR)

Erst jetzt, mit Audit-Layer und stabilem Hotfix, die eigentliche Center-Speaker-Frage. **Drei isolierte A/B-Edge-Functions**, jeweils gegen denselben Preclip:

- **v129-A:** `auto_detect: true` mit `active_speaker_detection: true`, kein bounding_boxes_url.
- **v129-B:** manual coords pro Frame aus `frame_face_cache` (deterministisch, frame-genau).
- **v129-C:** `bounding_boxes_url` (NDJSON, hochgeladen vor Dispatch).

Jede Variante 10× auf identischen 5 Plates (2 Speaker, 3 Speaker, 4 Speaker, Edge: Speaker am Bildrand, Edge: Speaker mit Brille). Metriken: `completion_outcome`, visueller Sync (manuelle Bewertung 1–5), Latency p50/p95, Refund-Rate.

**Gewinner geht in Production.** Verlierer bleiben als Fallback-Chain dokumentiert, nicht als auto-failover.

**Exit-Kriterium:** Sync-Score ≥ 4/5 für Center-Speaker in ≥ 90 % der Cases.

---

## Stage 5 — Speed-Layer v130 (bounded parallelism, **erst nach** Stage 4 grün)

**Hypothese:** Mit deterministischem Targeting und stabilem State ist Parallelisierung gefahrlos. Wir parallelisieren **pro Scene über Passes**, nicht pro Shot.

1. **Globaler DB-Semaphor** `syncso_inflight_jobs` (existiert bereits): hartes Limit `MAX_INFLIGHT = 6` projekt-übergreifend. Acquire vor Dispatch, Release im Webhook/Watchdog.
2. **Per-User-Cap** zusätzlich `MAX_INFLIGHT_PER_USER = 3` um Fairness zu garantieren.
3. **Pass-Parallelisierung pro Scene:** statt sequenziell Pass 1 → 2 → 3, parallel mit `Promise.allSettled` + Semaphor-Acquire pro Pass. Stitch wartet auf alle Passes der Scene.
4. **429-Backoff:** Exponential mit Jitter (1s, 2s, 4s, 8s, max 16 s), max 3 Retries. Bei Erschöpfung → `PASS_FAILED` + Refund.
5. **Kein Pre-Warm, kein Speculative Dispatch** — Komplexität ohne klaren Gewinn.

**Erwartete Latency:** 3-Speaker × 4-Turns Scene: heute ~ 12 min sequenziell, danach ~ 3–4 min (limitiert durch Sync.so eigene Render-Time).

**Exit-Kriterium:** p95-Latency pro Dialog-Scene < 5 min, 0 % falsche Refunds, 0 % "stuck" Passes über 50 konsekutive Renders.

---

## Stage 6 — Observability & Guardrails (parallel zu allen Stages aufbauen)

- **Sentry-Cron**: `syncso-watchdog` alle 2 min, alerted bei Pass > 8 min ohne Webhook.
- **Dashboard-Karte** im QA-Cockpit: Inflight count, p50/p95 Latency 1h-Window, Refund-Rate, NOOP-Rate, PASS_DONE_SUSPECT-Rate.
- **Daily Digest** an Admin: Top 5 langsamste Scenes, Top 5 Refund-Gründe.
- **Kill-Switch** `system_config.lipsync.enabled = false` → Sync.so-Calls werden geskippt, Stitch nutzt Original-Plate, **keine** Credit-Charge.

---

## Stage 7 — Was wir explizit **nicht** tun

Verbrannt, dokumentiert, nicht wieder aufgreifen ohne neuen Trigger:

- Kein Modell-Swap als Recovery (v127-Pfad).
- Keine Segments API (Stage 8+ frühestens, wenn Single-Shot stabil > 4 Wochen).
- Kein Sync.so Pro/Standard Mix-and-Match — eine Tier pro Pipeline-Version.
- Kein clientseitiges Polling als Primärpfad — Webhook ist Primary, Polling nur Watchdog.
- Keine spekulativen Pre-Renders.

---

## Reihenfolge & Zeit-Budget

| Stage | Aufwand | Blocking für | Output |
|---|---|---|---|
| 0 Forensik | 2 h | alles | Markdown-Report |
| 1 Hotfix v128 | 4 h | Stage 2+ | grüne Pipeline (Center evtl. suspect) |
| 2 Audit-Layer | 3 h | Stage 4 | Forensik pro Pass |
| 3 UI/Refund | 2 h | Stage 4 | klare Outcome-Zustände |
| 4 Targeting v129 A/B/C | 1 Tag | Stage 5 | korrekter Center-Sync |
| 5 Speed v130 | 4 h | — | p95 < 5 min |
| 6 Observability | parallel | — | Sichtbarkeit |

**Gesamt:** ~ 2,5 Arbeitstage bis Stage 5 abgeschlossen, vorausgesetzt Stage 0 liefert keine Überraschung.

---

## Offene Entscheidungen (brauche User-Input bevor Stage 3 implementiert wird)

1. `PASS_DONE_SUSPECT` → silent + Badge, oder Fail + Refund?
2. Stage 4 A/B-Probe: dein Budget für 30 Test-Renders (~ €9) freigeben?
3. Stage 0 zuerst durchlaufen lassen, oder direkt Stage 1 Hotfix wegen Produktionsdruck?
