# Duplicate Cast Slots in Production Plan — Fix

## Problem
In der Production-Plan-Sheet erscheint gelegentlich derselbe Charakter zweimal in einer Szene (z. B. zwei Slots, beide „Matthew Dusatko"). Ursachen:

1. **Pass A/B kann zwei mentionKeys emittieren, die auf denselben `characterId` resolven** (`@sarah` + `@sarah-dusatko` → beide Sarah, oder Fuzzy-Fill-Pass mappt einen unaufgelösten Slot nachträglich auf einen bereits vorhandenen Charakter).
2. **Local Fill-Pass (Zeile ~1400–1440)** setzt fehlende `characterId` nach — dedupliziert danach aber nicht. Zwei Slots kollabieren auf dieselbe ID, bleiben aber beide in `scene.cast`.
3. **Ensemble-Repair** (Server + Client) prüft Duplikate nur beim *Hinzufügen* neuer Slots. Bestehende Duplikate werden nicht bereinigt; zusätzlich kann Repair einen weiteren Slot anhängen, wenn ein vorhandener Slot zu diesem Zeitpunkt noch `characterId=null` hatte (unterschiedlicher Dedup-Key).

## Fix

### 1. Zentraler Dedup-Helper
Neue Utility `dedupePlanSceneCast(cast)` in `src/lib/video-composer/briefing/planCastDedup.ts`:
- Key = `characterId` (lowercased) falls vorhanden, sonst `normalizeAssetKey(mentionKey || characterName)`.
- Ersten Treffer behalten, spätere Duplikate droppen.
- `shotType`, `voiceId`, `characterName` vom ersten Slot behalten; bevorzugt den Slot mit `characterId != null` (falls die Reihenfolge das nicht garantiert, ein Merge-Pass, der Slots mit ID vor solche ohne ID priorisiert).

### 2. Server-Pipeline (`supabase/functions/briefing-deep-parse/index.ts`)
Dedup an drei Stellen aufrufen (idempotent):
- Direkt nach Pass B Mapping (~Zeile 750).
- Nach dem Local Fill-Pass (~Zeile 1440).
- Am Ende von `ensureProductionPlanEnsembleServer` nach dem Hinzufügen — Duplikate bereinigen, falls Repair welche erzeugt.

Zusätzlich in `ensureProductionPlanEnsembleServer`: `hasAll`/`coverage` verwenden bereits `characterId || mention`, das bleibt. Nach dem Push in `cast` einmal deduplizieren, bevor `sc.cast = cast` geschrieben wird.

### 3. Client-Pipeline
- `src/lib/video-composer/briefing/ensurePlanEnsemble.ts`: nach dem `cast.push`-Loop denselben Dedup-Helper auf `cast` anwenden.
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx`: beim Hydrate (Initial + nach Änderungen) einmal durch alle Szenen laufen und Dedup anwenden, damit auch Legacy-Pläne aus der DB sauber angezeigt werden.
- `src/hooks/useApplyProductionPlan.ts`: vor dem Mapping in `planSceneToComposerScene` denselben Dedup auf jede Szene anwenden, damit `characterShots` niemals denselben `characterId` doppelt enthält.

### 4. Telemetrie
In allen drei Server-Aufrufen zählen, wie viele Duplikate entfernt wurden, und einmal loggen:
`console.log('[briefing-deep-parse] plan_cast_dedup', { removed, stage })`.

## Umfang
- 1 neue Datei: `src/lib/video-composer/briefing/planCastDedup.ts`
- Edits: `briefing-deep-parse/index.ts`, `ensurePlanEnsemble.ts`, `ProductionPlanSheet.tsx`, `useApplyProductionPlan.ts`
- Deploy: `briefing-deep-parse`

## Validierung
Briefing mit 3 Avataren, 5 Szenen. Erwartung: keine Szene hat zwei Cast-Slots mit demselben `characterId`; UI-Screenshot zeigt jeden Avatar max. einmal pro Szene; mindestens eine Ensemble-Szene mit allen 3 Avataren bleibt erhalten.
