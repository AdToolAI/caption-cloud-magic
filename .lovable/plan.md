## Was gerade wirklich schief läuft
Der aktuelle Screenshot beweist, dass der Plan **nicht zuverlässig durch das Final-Gate läuft**:

- Es wird weiter `Gesamtdauer 50s` und `Summe Szenen 10s` angezeigt.
- Der rote Inkonsistenz-Blocker ist nicht sichtbar.
- Der Button `Plan anwenden` ist aktiv.
- Es fehlen die `Normalisiert`-Diagnose-Chips.
- Gleichzeitig zeigt der Footer `Skript-Dauer verwendet · 50s`, obwohl die Szene-Dauern nur 10s ergeben.

Das heißt: Die bisherige Logik ist nicht lückenlos verdrahtet. Es gibt mindestens einen Pfad, der einen alten/rohen Plan direkt ins Sheet bringt oder nachträglich wieder überschreibt. Außerdem normalisiert `finalizePlanCanonical` aktuell auf einen falschen kanonischen Wert, wenn `_meta.debug.canonical_timing.durationSec` bereits falsch ist.

## Ziel
Der Zustand `50s Gesamt / 10s Szenen` darf **technisch unmöglich** werden — egal ob der Plan vom Backend, Local Fallback, Late Arrival, initialPlan, manuellem Sheet-Parse oder altem Cache kommt.

## Fix-Plan

### 1. Ein „SafePlan“-Wrapper direkt vor jedem Render
Im `ProductionPlanSheet` wird nicht mehr direkt `plan` gerendert, sondern ein abgeleiteter `safePlan`:

```text
raw plan state → finalize/sanitize → safePlan → UI + Apply
```

Damit kann selbst ein alter oder roher Plan aus irgendeinem Pfad nicht mehr ungefiltert angezeigt werden.

Wichtig:
- Projekt-Gesamtdauer im UI kommt aus `safePlan`.
- Szenenliste kommt aus `safePlan`.
- Summary-Footer kommt aus `safePlan`.
- Apply bekommt `safePlan`.
- Der Blocker prüft `safePlan`.

### 2. Final-Gate korrigieren: falsche Canonical-Dauer darf nicht gewinnen
`finalizePlanCanonical` darf `_meta.debug.canonical_timing.durationSec` nicht blind vertrauen.

Neue Regel:
- Wenn `canonical_timing.durationSec` nicht zur Szenensumme passt und keine klaren Zeitfenster/Briefing-Dauer bestätigt sind, gewinnt die Szenensumme.
- Wenn ein Plan bereits konkrete Szenendauern hat, dann gilt: `project.totalDurationSec = sum(scenes)`.
- Nur ein validierter Briefing-Timing-Wert darf Szenen proportional umverteilen.

Damit wird `50s` nicht mehr aus einem fehlerhaften Chip übernommen, wenn die Szenen real nur 10s ergeben.

### 3. Hard-Blocker unabhängig vom State machen
Der Blocker wird nicht mehr davon abhängig sein, ob das letzte `setPlan(...)` korrekt lief.

Neue Regel:
- Wenn irgendein Plan, der im Sheet sichtbar wäre, `project.totalDurationSec !== sum(scenes)` hat, wird automatisch vor Render repariert.
- Wenn Reparatur nicht möglich ist, ist `Plan anwenden` deaktiviert.
- Button-Disable und Warnbox verwenden exakt dieselbe Berechnung.

### 4. Apply darf nie einen rohen Plan verwenden
`handleApply` nimmt nicht mehr `plan`, sondern ausschließlich `safePlan`.

Zusätzlich:
- Direkt vor `applyPlan(...)` wird nochmal finalisiert.
- Wenn danach noch inkonsistent: Abbruch mit Toast, kein Storyboard-Write.

### 5. Summary-Chips müssen echte Daten anzeigen
`BriefingPlanSummary` darf nicht mehr einen falschen `canonical_timing.durationSec` als Wahrheit anzeigen, wenn er vom Projekt/Szenensumme abweicht.

Neue Anzeige:
- `Skript-Dauer verwendet · Xs` nur, wenn X auch wirklich angewendet wurde.
- Sonst: `Szenensumme verwendet · Ys` oder Debug-Hinweis.
- `Skript-Timing verwendet · N Shots` muss mit `safePlan.scenes.length` übereinstimmen.

### 6. Ensemble-Leak final schließen
Im Screenshot steht noch:
`Samuel, Matthew, Sarah and Kailee share the scene together...`

Das heißt: Der Scrubber greift für diese Szene nicht, wahrscheinlich weil `dialogTurns`/Speaker nicht eindeutig vorhanden sind oder Script-Lock nicht erkannt wird.

Neue Regel:
- Wenn Script-Timing aktiv ist und Szene nur eine Sprecher-Zeile oder `Shot 1A — Sprecher 1` enthält, werden Ensemble-Phrasen immer aus `anchorPromptEN`, `aiPrompt`, `description`, `voiceover.text` und `action` entfernt.
- Keine Ensemble-Injektion in Script/Literal-Plänen.

### 7. Regressionstest für exakt deinen Screenshot-Zustand
Ein Test wird ergänzt:

```text
Input: project.totalDurationSec = 50, scenes = [2.5, 2.5, 5]
Expected:
- UI/SafePlan zeigt totalDurationSec = 10
- durationInconsistent = false nach Reparatur
- Apply nutzt 10s
- Summary zeigt nicht mehr „Skript-Dauer 50s“
```

Zusätzlich:
- Solo-Szene mit Ensemble-Prompt wird gescrubbt.
- Script-Lock verhindert Cast-Injektion.

## Warum das diesmal anders ist
Bisher haben wir die Plan-Erzeugung repariert. Der Screenshot zeigt aber, dass die UI/Apply-Schicht trotzdem einen alten oder falschen Plan anzeigen kann.

Dieser Fix setzt die Sicherheit **nicht nur am Eingang**, sondern direkt an der letzten möglichen Stelle:

```text
Alles, was angezeigt oder angewendet wird, muss durch safePlan.
```

Damit ist es egal, ob Backend, Local Fallback, Late Arrival oder Cache Mist liefert — die Oberfläche kann den widersprüchlichen Zustand nicht mehr anzeigen und nicht mehr anwenden.

## Danach prüfen wir
Mit deinem unveränderten Briefing muss gelten:
- Keine `50s / 10s`-Anzeige mehr.
- Kein aktiver Apply-Button bei Inkonsistenz.
- Kein „share the scene together“ in Solo-Shots.
- Kein falscher Canonical-Chip.
- Storyboard erhält nur normalisierte Szenen.