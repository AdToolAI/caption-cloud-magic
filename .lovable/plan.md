
# Strategie: Motion Studio Lip-Sync auf Artlist-Niveau

## Status quo (Diagnose)

Aktuelles Scheitern in deiner Szene (HappyHorse 1.0 + Cinematic Dialog · 2 Sprecher):
```
clip_error: dialog_missing_face_coords: samuel-dusatko, matthew-dusatko
            — Gesichts-Identitäts-Mapping nicht möglich.
```
Historischer DB-Verlauf der letzten Cinematic-Sync-Szenen zeigt drei wiederkehrende Failure-Klassen:

1. **Identity-Mapping fällt aus** — Gemini Vision findet die Gesichter im Anchor nicht eindeutig den `characterId`s zu → harter Stopp vor Sync.so.
2. **AWS Lambda Rate Limit** (vom eingefrorenen Konto) → `dialog_stitch_lambda_failed`.
3. **Sync.so Poll-Timeout** nach 12 min (Watchdog) — kein Webhook, nur Polling.

Die Pipeline (compose-dialog-scene v4 → poll-dialog-shots → ffmpeg-stitch) ist architektonisch nah an Artlist, aber **drei Schichten sind zu fragil**: Anchor-Identity, Provider-Selection und Recovery. Plus: HappyHorse 1.0 als Master-Plate ist ungetestet für Lip-Sync.

Was Artlist Studio tatsächlich tut (aus Blog/Reviews 04–05/2026):
- **Cast & Locations als Pinned References** mit Identity-Lock auf jedem Shot
- **Kling 3.0 als Default-Master** (nicht HappyHorse) → höhere Gesichtsstabilität
- **Pro Sprecher-Turn ein eigener Lip-Sync-Pass** (nicht ein Union-Fenster)
- **Replikation + Webhook**, kein langes Polling
- **Frame-aware Stitching** auf dem Original-Master, nicht Re-Encode-Kaskaden

Daraus folgt: wir bauen die Pipeline **nicht neu**, sondern härten sie in 5 klar abgegrenzten Stufen.

---

## Stufe 1 — Anchor + Identity hart machen *(Fix für aktuelle Szene)*

Ziel: `dialog_missing_face_coords` kann strukturell nicht mehr auftreten.

- `compose-scene-anchor` für ≥2-Cast-Szenen erzwingt **N Pre-Flight Retries** mit progressiv strikterem Prompt-Suffix (jeweils eine Achse: equal screen share → front-facing → no occlusion → distinct identities).
- Gemini Vision Identity Match bekommt **Portraits aller Cast-Member als Reference-Slots** mit Side-by-Side-Comparison-Prompt statt nur Frame-Inspektion.
- Auto-Rebuild faceMap aus dem letzten verfügbaren guten Anchor des Projekts, wenn neuer Anchor < N Gesichter liefert (mit Warnung, aber ohne Stop).
- "🎥 Clip + Lip-Sync neu rendern"-Button bekommt explizite **Anchor-Force-Regenerate** Flag, die den Cache der Szene **und** des Project-Anchor-Pools invalidiert.

Akzeptanz: deine aktuelle Szene (S01 Hook, Samuel + Matthew) rendert ohne `dialog_missing_face_coords`.

---

## Stufe 2 — Two-Shot-Master in Artlist-Qualität

Ziel: der Master-Plate, auf den Sync.so animiert, hat die gleiche Identitäts-Stabilität wie Artlists Cast-System.

- **Provider-Tiering für Cinematic-Dialog** explizit machen: Kling 3 Std/Pro = Tier-A (Default), Hailuo 2.3 = Tier-B (Fallback), HappyHorse 1.0 = **gesperrt** für 2+ Speaker (Identity-Drift zu hoch, das ist die Hauptursache deines aktuellen Falls).
- UI-Badge in `SceneCard`: "Empfohlen für Dialog" auf Kling, Warn-Badge auf HappyHorse mit 1-Klick-Switch.
- `compose-video-clips` hängt für Cinematic-Sync immer den `TWO_SHOT_FRAMING_SUFFIX` + "lip-ready, mouth visible, no hands near face, no microphones, no closed-mouth resting pose" an — und scrubbed Dialog-Skript aus dem visuellen Prompt (ist bereits Policy, wird aber für HappyHorse umgangen → härten).
- Pre-Flight Face-Count-Audit nutzt `_shared/face-count.ts` **vor** dem Credit-Charge, nicht danach.

---

## Stufe 3 — Per-Turn Parallel Lip-Sync (Artlist's "ein Pass pro Replik")

Die v4-Architektur in `compose-dialog-scene` ist bereits per-turn-parallel. Was fehlt für Artlist-Parität:

- **Pre-Roll/Tail dynamisch pro Turn**: aktuell 120ms/80ms statisch → adaptiv 80–200 ms basierend auf Onset-Energie der TTS-Phrase (kurze Konsonant-Onsets brauchen mehr Lead-in als Vokal-Onsets). Berechnung in `compose-twoshot-audio` aus der bereits vorhandenen PCM-Sample-Map.
- **Temperatur-Curve** statt Schwellwert (`<2s → 1.0, sonst 0.85`): kontinuierliche Kurve `temp = clamp(0.85 + 0.4 · (1 - minTurnDur/3), 0.85, 1.15)`.
- **Pro-Turn Coordinate-Refinement**: aktuell ein Face-Center pro Sprecher für die ganze Szene. Wenn ein Turn > 4 s ist, in der Mitte ein zweites Sample auf dem Original-Master nehmen (Sprecher kann den Kopf gedreht haben) und Sync.so denselben Turn als zwei Mikro-Windows geben.

---

## Stufe 4 — Multi-Speaker (3+) als First-Class

Aktuell sauber für 2 Sprecher; 3+ läuft theoretisch, ist aber nie ausgereizt. Artlist erlaubt bis 4 Cast pro Shot.

- `compose-scene-anchor` `TWO_SHOT_FRAMING_SUFFIX` wird zu `MULTI_SHOT_FRAMING_SUFFIX(n)` mit dynamischen Composition-Hints (2 = side-by-side, 3 = wide three-shot, 4 = group medium).
- Per-character `track_url` (bereits vorhanden, derzeit nur Debug) wird für 3+ Sprecher zu Sync.so-Input umfunktioniert, falls merged WAV pro Turn zu mehrdeutig ist.
- UI: "Dialog-Cast" picker mit max-4-Slot, Reihenfolge = Sprech-Reihenfolge im Skript.

---

## Stufe 5 — Stabilität & Recovery (Sync.so Webhook + Lambda-Backoff)

Ziel: kein 12-min-Timeout, kein AWS-Rate-Limit-Crash mehr.

- **Sync.so Webhook** statt Polling: `poll-dialog-shots` registriert pro Shot eine `webhook_url` an Sync.so. Falls Webhook nach 90 s kein Signal liefert → Fallback auf Polling (heutiges Verhalten). Reduziert die Watchdog-12-min-Fälle praktisch auf 0.
- **Lambda Concurrency-Aware Stitch**: `render-dialog-stitch` checkt `aws_concurrency_budget` (existiert bereits aus DC-Policy) und queued statt sofort zu rendern, wenn < 1 Slot frei.
- **Idempotenter Refund** bereits in Policy verankert → Audit-Pass schreiben, dass alle 4 Failure-Pfade (anchor, master, sync, stitch) ihn auch wirklich auslösen (heute lückenhaft bei `dialog_missing_face_coords`).
- **Watchdog** verkürzt auf 8 min mit klarem Error-Code statt 12 min ohne Diagnose.

---

## Technisches Detail (nur für interne Referenz)

Betroffene Dateien:
```text
supabase/functions/compose-scene-anchor/index.ts        (Stufe 1, 2, 4)
supabase/functions/compose-video-clips/index.ts         (Stufe 2)
supabase/functions/compose-dialog-scene/index.ts        (Stufe 3, 5)
supabase/functions/poll-dialog-shots/index.ts           (Stufe 3, 5)
supabase/functions/compose-twoshot-audio/index.ts       (Stufe 3)
supabase/functions/render-dialog-stitch/index.ts        (Stufe 5)
supabase/functions/twoshot-lipsync-watchdog/index.ts    (Stufe 5)
supabase/functions/_shared/face-count.ts                (Stufe 1, 4)
supabase/functions/_shared/sync-so.ts                   (Stufe 3, 5)
src/components/composer/SceneCard/* (Provider-Badge)    (Stufe 2)
mem/architecture/lipsync/sync-so-pro-model-policy       (Update nach Stufe 3+5)
```
Neue DB-Spalten: keine. Neue Tabellen: keine. Schreibt nur in bestehende `composer_scenes.audio_plan` / `clip_error` / `clip_url`.

Migrationen sind nicht nötig — alles läuft in Edge-Functions + Frontend.

---

## Reihenfolge & Aufwand

| Stufe | Aufwand | Liefert dir konkret |
|---|---|---|
| 1 — Anchor/Identity härten | klein | aktuelle Szene rendert |
| 2 — Provider-Tiering + HappyHorse Lock | klein | keine "non-2xx" mehr auf 2-Sprecher-Dialog |
| 3 — Per-Turn Refinement | mittel | Artlist-vergleichbare Mund-Genauigkeit |
| 4 — Multi-Speaker 3+ | mittel | echte Dialog-Szenen (nicht nur Two-Shot) |
| 5 — Webhook + Lambda-Backoff | klein–mittel | keine 12-min-Timeouts, kein AWS-Crash |

Empfehlung: **Stufe 1 + 2 sofort zusammen** (entsperrt deine aktuelle Szene), danach **Stufe 5** (Stabilität), dann **3 + 4** (Qualität auf Artlist-Niveau).

Sag mir, ob ich mit Stufe 1+2 starten soll, oder ob du eine andere Reihenfolge willst.
