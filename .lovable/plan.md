## Problem

Beim Wechsel ins Storyboard läuft die Briefing-Analyse, aber statt des Plan-Feldes erscheint nur der rote Toast **„Briefing-Analyse fehlgeschlagen / Plan-Validierung fehlgeschlagen"**. Ursache: `briefing-deep-parse` liefert einen Plan, den die strenge Zod-Schema (`ProductionPlan`) ablehnt – z. B. weil das AI-Modell ein `engine` außerhalb der Enum-Liste setzt (`"ai-hailuo"`, `"runway"` …), `durationSec` ausserhalb `1–60` liefert, `musicCue.energy` einen freien Text statt Enum hat, oder einzelne Scene-Felder schlicht fehlen. Da wir hart `throw` werfen, wird kein Plan-Sheet geöffnet und der Nutzer sieht keine Details. Zusätzlich gibt es keine Edge-Logs zum Debuggen.

## Ziel

1. Der Nutzer kommt **immer** ins Plan-Sheet, auch wenn einzelne Felder „schief" zurück­kommen.
2. Konkrete Fehlerursache wird sichtbar (statt generischem Toast).
3. Lipsync-Pipeline bleibt unangetastet.

## Lösung (4 Schichten)

### 1. Server-seitige Normalisierung in `mergeManifestAndResolution`
- `engine`: auf zulässige Werte mappen (`heygen`, `cinematic-sync`, …); alles andere → `'auto'`. Aliasse: `ai-heygen→heygen`, `b-roll→broll`, `sync→sync-polish`.
- `durationSec`: `clamp(1, 60)`; fehlende → `5`.
- `musicCue.energy`: in Enum-Whitelist filtern, sonst entfernen.
- `dialogTurns`: leere Texte / fehlende Speaker rauswerfen; max 20.
- `brollHints`: Strings trimmen, leere raus, max 12.
- `cast`/`location`: undefined-Felder strippen (verhindert spätere Zod-Probleme).
- `performance.energy`: clamp 1–5.

Damit landet im Client ein Objekt, das die Zod-Schema in 99 % der Fälle akzeptiert.

### 2. Client-seitige Recovery in `useStoryboardTransition`
- Statt `safeParse → throw`: erst `ProductionPlan.safeParse(data.plan)`. Bei Fail:
  - Detaillierte `console.error` mit `parsed.error.flatten()`.
  - **Per-Szene-Recovery**: `data.plan.scenes` einzeln durch `PlanScene.safeParse()` schicken, kaputte Szenen verwerfen (mit Warnung), Rest weiterverwenden.
  - Wrapper-Objekt mit den überlebenden Szenen erneut durch `ProductionPlan.safeParse`. 
  - Wenn ≥ 1 Szene überlebt → Plan-Sheet öffnet (mit Warn-Toast „X Szenen konnten nicht übernommen werden").
  - Nur wenn 0 Szenen überleben → roter Toast + Fallback-Navigation.

### 3. Bessere Fehler-Sichtbarkeit
- Toast-Description: erste 1–2 Zod-Issue-Pfade (`scenes[0].engine: invalid_enum_value`).
- Edge-Function: `console.log('[briefing-deep-parse] manifest scenes:', n, 'plan scenes:', n, 'unresolved:', m)` direkt vor dem `Response`, damit zukünftige Fehler in den Function-Logs sichtbar sind.

### 4. Schema-Lockerung an einem Punkt
- `PlanScene.engine` bekommt zusätzlich `.catch('auto')` (statt nur `.default`), damit ein Fremdwert nicht das ganze Scene-Parsing kippt.
- `PlanScene.durationSec`: `.catch(5)` analog.
- Keine weiteren Schema-Aufweichungen – die anderen Felder sind bereits optional.

## Lipsync-Schutz

Reine UI-/Validation-Reparatur. Es werden weder `dialog_shots`, `syncso_*` noch `compose-video-clips` angefasst. Die Guards in `useApplyProductionPlan` (`isProtected`) bleiben aktiv: Plan-Apply überschreibt nie eine bereits gerenderte/lipsynced Szene.

## Geänderte Dateien

- `supabase/functions/briefing-deep-parse/index.ts` — Normalisierung in `mergeManifestAndResolution` + Telemetrie-Log.
- `src/hooks/useStoryboardTransition.ts` — Per-Szene-Recovery + bessere Fehlermeldung.
- `src/lib/video-composer/briefing/productionPlan.ts` — `engine`/`durationSec` mit `.catch(...)` härten.

## Was bewusst NICHT passiert

- Kein Refactor der 2-Pass-Pipeline.
- Keine Änderung am Prompt (das funktioniert sonst korrekt).
- Kein Eingriff in Composer-Storyboard-Rendering.
- Keine neuen Felder im Schema.

Soll ich es so umsetzen?
