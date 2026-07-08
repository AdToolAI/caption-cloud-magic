## Diagnose

Es ist kein gewünschtes Verhalten, sondern ein Logik-Bruch zwischen zwei Pipelines:

1. **Der letzte Fix sitzt im Storyboard-Generator** (`compose-video-storyboard`).
   Der Screenshot zeigt aber den **Production Plan / Briefing-Parser** (`briefing-deep-parse`). Dieser hat eine eigene Cast-Logik und umgeht den Storyboard-Fix teilweise.

2. Im Production-Plan-Prompt steht aktuell sinngemäß: **max. 2 Sprecher pro Szene** und Talking-Head gerne auf **einen Cast** pinnen. Bei 3 gewählten Avataren arbeitet diese Regel gegen die neue Ensemble-Anforderung.

3. Wenn die Analyse timed out oder teilweise fehlschlägt, baut der Client einen lokalen Fallback-Plan. Dieser nimmt aktuell praktisch nur den **ersten Avatar** als Cast. Deshalb ist es „ab und zu korrekt und ab und zu fehlerhaft“: je nachdem, ob AI-Pass A/B sauber durchläuft, ein Retry greift oder der lokale Fallback angezeigt wird.

4. Die neue `ensureEnsembleScene`-Safety-Net-Funktion existiert, ist aber für den Production-Plan-Pfad noch nicht zuverlässig integriert.

## Zielverhalten

Wenn im Briefing / Picker 2–4 Avatare gewählt sind:

- Es darf weiterhin Solo- und 2er-Szenen geben.
- Aber mindestens eine Szene muss alle gewählten Avatare enthalten.
- Bei längeren Plänen ab 6 Szenen sollen mindestens zwei Ensemble-Szenen entstehen.
- Diese Regel muss im **Production Plan**, im **lokalen Fallback** und beim **Plan anwenden** greifen.

## Umsetzung

### 1. Production-Plan-Parser härten

In `briefing-deep-parse`:

- Die alte Regel „Max 2 speakers per scene“ so anpassen, dass sie nur für normale Dialog-/Talking-Head-Szenen gilt.
- Neue harte Regel ergänzen:
  - bei 2–4 Cast-Avataren mindestens eine Ensemble-Szene mit allen Cast-Mitgliedern
  - bei ≥6 Szenen mindestens zwei Ensemble-Szenen
  - Ensemble-Szenen müssen Wide/Group-Shots sein, keine Close-ups
- Nach Pass A und/oder nach Pass B eine deterministische Reparatur einbauen:
  - erkennt alle verfügbaren Cast-Avatare aus `## Cast` / Library
  - prüft, ob genug Szenen alle Cast-Mitglieder haben
  - wenn nicht, wählt Hook/CTA oder die beste vorhandene Szene
  - ergänzt fehlende `cast[]` Slots, setzt `engine: cinematic-sync`, `lipSync: true`, `framing: wide/medium-wide`
  - erweitert `anchorPromptEN`, damit alle Namen auch im Prompt vorkommen

### 2. Lokalen Fallback reparieren

In `useStoryboardTransition.buildLocalFallbackPlan`:

- Nicht nur `briefing.characters[0]` verwenden.
- Alle ausgewählten Briefing-Charaktere bis max. 4 als Cast-Slots bauen.
- Mindestens eine Fallback-Szene als Ensemble-Szene erzeugen.
- Bei 6+ Szenen zweite Ensemble-Szene ergänzen.

### 3. ProductionPlanSheet Safety Net

Vor dem Anzeigen oder spätestens vor „Plan anwenden“:

- Plan normalisieren: wenn 2–4 aktuelle Briefing-Charaktere existieren und keine Ensemble-Szene im Plan ist, wird eine Szene automatisch ergänzt.
- Das passiert idempotent, damit manuelle Änderungen nicht mehrfach dupliziert werden.
- Die UI zeigt danach direkt den korrigierten Cast, nicht erst nach dem Anwenden.

### 4. Plan → Composer Mapping absichern

In `useApplyProductionPlan`:

- Vor `planSceneToComposerScene` nochmal prüfen, ob der Plan die Ensemble-Regel erfüllt.
- Falls nicht, Cast-Slots im Plan ergänzen, damit `characterShots[]` wirklich alle Avatare enthält.
- Warnung/Telemetry ergänzen, falls ein Lip-Sync-/Cinematic-Sync-Plan wieder nur einen Cast-Slot bekommt.

### 5. Verhalten validieren

Mit einem Testfall „3 Avatare, 3–5 Szenen“ prüfen:

- Production Plan zeigt mindestens eine Szene mit allen 3 Avataren.
- Nach „Plan anwenden“ hat die entsprechende Composer-Szene `characterShots.length === 3`.
- Kein Fallback-Pfad erzeugt mehr nur den ersten Avatar.

## Ergebnis

Danach ist die Ensemble-Regel nicht nur im Storyboard-Generator vorhanden, sondern entlang der tatsächlichen Pipeline abgesichert: Briefing-Analyse → Production Plan → Plan anwenden → Composer-Szenen.