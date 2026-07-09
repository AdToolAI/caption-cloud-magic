
# Refactor-Plan: Briefing → Storyboard Pipeline

## Kurzbewertung (Ist-Zustand)

Die Logik ist **funktional korrekt geworden**, aber **architektonisch nicht sauber**: dieselbe Aufgabe wird an 3–4 Stellen parallel gelöst. Konkret gemessen im Audit:

- **Scene-Contract-Detection**: 2× (Server + Client, regex-identisch)
- **Duration-Detection**: 2× (Server 4 Patterns, Client 7 Patterns → können divergieren)
- **Scene-Merge-to-1**: 3 unabhängige Implementierungen
- **Scene-Count-Align / Redistribution**: 3 unterschiedliche Algorithmen auf denselben Daten
- **`totalDurationSec` Schreibstellen**: 11 entlang der Pipeline
- **`finalizePlanCanonical`**: läuft **4×** pro Apply-Vorgang
- **`normalizeAssetKey`**: 4 lokale Kopien
- **`shouldInheritContinuity`**: 2 identische Kopien
- **Cast-Dedup**: 2 Implementierungen
- **`BriefingTab`** nutzt eine **komplett andere Edge-Function** (`compose-video-storyboard`) und umgeht die ganze Pipeline

**Risikohotspot**: `ProductionPlanSheet.tsx` hat einen Feedback-Loop (`useMemo safePlan` → `useEffect onUpdateBriefing` → `currentBriefing` → `safePlan` neu). Nur ein Signature-Ref verhindert die Endlosschleife.

Fazit: sauber wäre **eine Quelle der Wahrheit pro Concern**. Das ist der Plan.

---

## Ziel-Architektur

```text
BriefingTab ──► briefing-deep-parse (Edge)
                 │
                 ├─ detectScriptTimingMode
                 ├─ detectBriefingContract  ◄── EINZIGE Detection
                 ├─ Pass A (LLM) + LITERAL/SCRIPT_LOCK
                 ├─ mergeScenesToOne / align (Server-Autorität)
                 └─ Response: { plan, _meta.briefingContract }
                                    │
                                    ▼
                        useStoryboardTransition
                        (nur Transport, keine Re-Detection)
                                    │
                                    ▼
                        ProductionPlanSheet
                        • zeigt plan an
                        • Validierung READ-ONLY (Warnungen)
                        • KEIN safePlan-useMemo
                        • KEIN Write-Back auf Briefing
                                    │
                                    ▼
                        useApplyProductionPlan
                        finalizePlanCanonical()  ◄── EINMAL, hier
                        → DB-Write
```

**Kernregel**: Der Server ist die **Autorität** für Contract & Timing. Der Client **liest** `_meta.briefingContract`, transformiert nicht mehr eigenständig, sondern **validiert** und **repariert nur einmal** kurz vor dem Schreiben.

---

## Phasen

### Phase 1 — Shared Contract (Grundlage)
Neue Datei `src/lib/video-composer/briefing/briefingContract.ts` (Deno-kompatibel für Server-Import):

```ts
export interface BriefingContract {
  totalDurationSec: number;
  sceneCount: number | null;
  explicitSceneCount: boolean;
  continuousScene: boolean;
  scriptTimingMode: 'SHOT_MARKERS' | 'SPEAKER_BLOCKS' | 'FREETEXT' | 'LITERAL';
  source: 'explicit-total' | 'scene-math' | 'time-windows' | 'shot-markers' | 'board';
  windows?: Array<{ start: number; end: number }>;
}
```
Server schreibt in `plan._meta.briefingContract`. `ProductionPlan`-Zod-Schema um dieses Feld erweitern.

### Phase 2 — Server als einzige Detection-Autorität
- `detectBriefingContract()` im Edge-Function konsolidieren (heute: `detectExplicitSceneContract` + `detectExplicitBriefingTiming` + `parseSmallSceneCount`). Alle Regex-Varianten des Clients übernehmen, damit keine Divergenz mehr entsteht.
- Emit `_meta.briefingContract` in der Response.
- Server-Reihenfolge fixieren (dokumentiert im Code-Kommentar): `detect → LLM → merge → align → redistribute → sync total`. Nach `sync total` **keine** weiteren Duration-Writes.

### Phase 3 — Client entkernen
- `useStoryboardTransition.ts`: `detectSceneContract`, `detectCanonicalBriefingTiming`, `mergeScenesToSingleScene`, `alignPlanScenesToCanonicalTiming`, `applyCanonicalTimingToPlan` **entfernen**. Stattdessen: `readBriefingContract(plan)` (dünner Reader).
- `finalizePlanCanonical.ts` bleibt, **aber** liest ausschließlich `_meta.briefingContract` — keine Text-Re-Analyse mehr.
- Fallback-Plan-Builder im Hook: nutzt denselben Reader, kein eigener Detector.

### Phase 4 — ProductionPlanSheet vereinfachen
- `useMemo safePlan` **entfernen**. Sheet zeigt `plan`-State direkt.
- `useEffect` auf `initialPlan`: läuft **einmalig**, ruft `finalizePlanCanonical` **nicht** hier auf, sondern nur beim Apply.
- Validierungs-`useMemo` (READ-ONLY) liefert nur Warnungen für `SafePlanNotice`.
- `onUpdateBriefing({ duration })` Feedback-Loop **entfernen** — die Briefing-Duration ist ab Response fest, Änderungen sind reine UI-Overrides.

### Phase 5 — Apply-Pfad als einziger Finalizer
- `useApplyProductionPlan.applyPlan()` ruft `finalizePlanCanonical(plan)` **genau einmal** direkt vor dem DB-Write auf.
- Inline `dedupMap` (Zeile 318–343) durch `dedupePlanScenesCast` aus `planCastDedup.ts` ersetzen.

### Phase 6 — Helper-Konsolidierung
Neue Utility-Module, jeweils **eine** Definition:
- `src/lib/video-composer/briefing/assetKeyUtils.ts` → `normalizeAssetKey` (ersetzt 4 Kopien)
- `src/lib/video-composer/briefing/planContinuity.ts` → `shouldInheritContinuity` (ersetzt 2 Kopien)
- `src/lib/video-composer/briefing/planSceneOps.ts` → `mergeScenesToOne`, `alignSceneCount`, `redistributeSceneDurations` (ersetzt 3+3+3 Kopien; Server importiert per Deno-`npm:`-kompatiblem Pfad oder erhält einen 1:1-Mirror + Deno-Test der Verhaltensgleichheit)

### Phase 7 — BriefingTab an Pipeline anschließen
- `BriefingTab.handleGenerateStoryboard` migrieren: statt `compose-video-storyboard` → `briefing-deep-parse` → `useApplyProductionPlan`.
- Inline-Multi-Cast-Rewrite (Zeilen 349–430) **löschen** — Server macht das jetzt zentral.
- (Falls `compose-video-storyboard` andere Aufrufer hat: separaten Adapter behalten; sonst deprecaten.)

### Phase 8 — Zod-Härtung & Tests
- `PlanScene.durationSec`: `.catch(5)` durch `.default(0)` + expliziten Repair-Log-Eintrag ersetzen, damit stiller Duration-Drift sichtbar wird.
- Regressionstests erweitern (`useStoryboardTransitionTiming.test.ts`, `finalizePlanCanonical.test.ts`) auf:
  - 15s / 1 durchgehende Szene / 4 Sprecher (das aktuelle Referenz-Briefing)
  - 15s / 3 Szenen à 5s
  - LITERAL-Mode / SHOT_MARKERS / SPEAKER_BLOCKS / FREETEXT
  - Alterspannen wie „30–45 Jahre" dürfen Duration nicht kapern
- Deno-Test für Server-Detector mit denselben Fixtures (Client/Server-Parität).

### Phase 9 — Debug/Version-Chip
- `BriefingPlanSummary` zeigt `briefingContract.source` + Pipeline-Version (`v213 → v214`) prominent.
- Debug-Panel (`?debug=1`) listet die genutzte Contract-Quelle statt der aktuellen 3 separaten Detection-Blöcke.

---

## Aus dem Refactor bewusst rausgehalten
- Keine Änderungen an Rendering, Lipsync, Lambda-Config, Credits, Auth, Design-System.
- Keine neuen Features — nur Konsolidierung existierender Logik.
- Keine Schema-Migration (nur additiv: `_meta.briefingContract`).

## Erwartetes Ergebnis
- **1** Detection-Ort statt 2
- **1** Merge-/Align-Ort statt 3
- **1** Finalize-Aufruf statt 4
- **0** Feedback-Loops zwischen Sheet und Briefing-State
- **1** Edge-Function für alle Briefing-Eingänge
- Kunden-sichtbar: Kein Verhalten ändert sich; Stabilität und Nachvollziehbarkeit steigen deutlich.

## Umsetzungsreihenfolge (empfohlen, in Build-Modus)
Phase 1 → 2 → 8 (Tests grün auf altem Client) → 3 → 4 → 5 → 6 → 7 → 9.
Nach jeder Phase Tests laufen; Client bleibt kompatibel, weil neue Felder additiv sind.
