## Ziel

Wenn im Briefing N Charaktere angegeben sind (2–4), soll **mindestens eine Szene** entstehen, in der **alle N** gemeinsam auftreten. Skaliert nach Storyboard-Länge (mehr Szenen → ggf. mehr Ensemble-Momente).

## Root Cause (aktueller Zustand)

- `compose-video-storyboard` (Edge Function) entscheidet frei pro Szene, welche Charaktere im Shot sind. Es gibt aktuell **keine harte Regel**, dass alle Briefing-Charaktere mindestens einmal gemeinsam vorkommen müssen.
- `syncCastFromPrompt.ts` gleicht nur nachträglich Prompt ↔ `characterShots` ab — löst aber nicht das Problem, wenn der LLM einen Charakter komplett auslässt.

## Fix (2-stufig)

### Stufe 1 — Storyboard-Prompt-Härtung (Kern-Fix)

In `supabase/functions/compose-video-storyboard/index.ts`:

1. **Ensemble-Regel in den System-Prompt einbauen** (auf DE + EN + ES lokalisiert, konsistent mit bestehender i18n):
   > „Wenn das Briefing N ≥ 2 Charaktere enthält, MUSS mindestens eine Szene ein Ensemble-Shot sein, in dem alle N Charaktere gemeinsam sichtbar auftreten (Wide/Group-Shot). Bei Storyboards mit ≥ 6 Szenen: mindestens 2 Ensemble-Momente. Cap: max. 4 Charaktere pro Szene (Nano Banana 2 / Vidu Q2 Limit)."

2. **Post-Validation** nach Storyboard-Rückgabe:
   - Zähle über alle Szenen: welche `characterId`s tauchen in mindestens einer Szene mit `characterShots.length === N` auf?
   - Falls **keine** Ensemble-Szene existiert und `characters.length ≥ 2`: wähle heuristisch die passendste Szene (bevorzugt Hook/CTA oder Szene mit den meisten bereits gesetzten Slots) und ergänze fehlende Slots + hänge Namen an den Prompt („… gemeinsam mit {names}").
   - Log-Event: `storyboard_ensemble_repair` (Debug/Observability).

### Stufe 2 — Client-Side Safety Net

In `src/lib/motion-studio/syncCastFromPrompt.ts`:
- Aktuelle Name-Match-Heuristik bleibt (nicht anfassen).
- **Neue Funktion** `ensureEnsembleScene(scenes, characters)` (idempotent): prüft nach Storyboard-Load, ob mindestens eine Szene alle Charaktere hat. Falls nicht → markiere passende Szene und ergänze `characterShots`. Wird in `ClipsTab`/`SceneCard` beim initialen Storyboard-Ingest aufgerufen (nicht bei jedem Render).
- Setzt `shotType: 'full'` als Default (konsistent mit bestehendem Verhalten).

## Skalierung

| Szenen im Storyboard | Ensemble-Szenen (Mindestanzahl) |
|---|---|
| 2–3                  | 1                               |
| 4–5                  | 1                               |
| 6–8                  | 2                               |
| 9+                   | 2                               |

Konservativ — kein Overload, keine „jede Szene alle Charaktere"-Regel (bricht cinematographische Solo-Shots).

## Nicht im Scope

- Änderungen an `compose-video-clips` / `compose-scene-anchor` — die Cast-Slot-Verarbeitung bleibt gleich.
- Änderungen am Nano-Banana-2 / Vidu-Q2 4-Cast-Cap.
- Manuelle User-Kontrolle „diese Szene = Ensemble" — kann später als UI-Toggle nachgezogen werden.

## Technische Details

**Files:**
- `supabase/functions/compose-video-storyboard/index.ts` — System-Prompt + Post-Validation-Block
- `src/lib/motion-studio/syncCastFromPrompt.ts` — neue `ensureEnsembleScene` Funktion (additiv)
- Aufrufer der Storyboard-Ingestion (ClipsTab / VideoComposerDashboard) — 1 Zeile Integration

**Migrations:** keine (rein Logik).

**Analytics:** neues Event `storyboard_ensemble_repair` mit `{scenes_total, characters_briefed, repaired_scene_id}` in `analytics.ts`.
