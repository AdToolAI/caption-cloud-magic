# v234 — Slider ist Single Source of Truth, jetzt auch im Sheet-Rendering

## Diagnose

Der Slider im Briefing-Tab stand auf 15s, aber der Production Plan zeigt „Gesamtdauer 5s / Summe Szenen 5.1s (3 Szenen)". Ursache:

1. In `useStoryboardTransition.applyCanonicalTimingToPlan` gewinnt der Slider korrekt (v233). Dieser Pfad läuft aber nur **einmal beim Analysieren** — also mit dem Slider-Wert, der zum Analysezeitpunkt gültig war (hier: 5s).
2. Im `ProductionPlanSheet` gibt es zwar einen `safePlanResult`-Memo, der beim Ändern des Briefings neu normalisiert. Aber die **UI rendert `plan` (State), nicht `safePlan`** — 26 Referenzen auf `safePlan`, 63 auf `plan.` in der Datei. Header, "Gesamtdauer"-Row, "Summe Szenen", Szenenliste, Consistency-Chips lesen alle `plan.*`.
3. Der `useEffect [initialPlan]` setzt `plan` nur bei neuem `initialPlan`. Wenn der Slider bewegt wird, während das Sheet offen ist (oder bevor der Kunde neu analysiert), bleibt der State auf dem alten Wert stehen.
4. Zusätzlich: Der lokale `plan`-State ignoriert Slider-Änderungen des `currentBriefing`-Props komplett — daher wird der 15s-Wert nie in den State geschrieben, obwohl `safePlan` ihn intern schon kennt.

## Fix

Zwei kleine, chirurgische Anpassungen in `src/components/video-composer/briefing/ProductionPlanSheet.tsx`:

1. **Anzeige aus `safePlan` ableiten**: Alle Read-Only-Rows und Consistency-Checks (Projekt-Card, Szenen-Header, „Summe Szenen", Konsistenz-Chip, `totalPlanSec`-Berechnung) auf `safePlan ?? plan` umstellen. Editier-Handler bleiben auf `plan` (Bearbeitung schreibt weiterhin in den lokalen State).
2. **Slider-Änderung propagiert in `plan`-State**: Neuer `useEffect` mit Dependency `[currentBriefing?.duration]`, der bei Slider-Änderung `applyCanonicalTimingToPlan` auf den aktuellen `plan`-State fährt und Ergebnis zurückschreibt (nur wenn `changed === true` und keine bereits gerenderten/gelockten Szenen betroffen sind — die bestehende „no overwrite of rendered scenes"-Regel bleibt intakt).
3. **`useApplyProductionPlan`**: „Plan anwenden" arbeitet ohnehin über `safePlan` beim Apply-Pfad (Zeilen 554/603). Kein Change nötig, aber wir stellen sicher, dass der Slider-Wert final in `project.totalDurationSec` landet.
4. Version-Bump auf `CLIENT_PIPELINE_VERSION = 234`.

## Was nicht geändert wird

- `useStoryboardTransition.applyCanonicalTimingToPlan` bleibt wie in v233.
- Kein Auto-Overwrite bereits gerenderter Szenen (Lip-Sync-aktiv / rendered = frozen).
- Kein Backend-Change.

## Technische Details

- Neue Konstante `displayPlan = safePlan ?? plan` oben im Render-Block einführen; im JSX systematisch `plan.` → `displayPlan.` ersetzen, wo nur gelesen wird.
- `totalPlanSec = displayPlan.scenes.reduce(...)`.
- Slider-Sync-Effect:
  ```ts
  useEffect(() => {
    if (!plan) return;
    const { plan: next, changed } = applyCanonicalTimingToPlan(plan, currentBriefing, currentBriefing?.productDescription ?? '');
    if (changed) setPlan(next);
  }, [currentBriefing?.duration]);
  ```
