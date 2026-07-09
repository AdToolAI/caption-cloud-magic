## Diagnose

Die 50s kommen nicht mehr primär vom UI-Toggle, sondern aus zwei verbliebenen Architekturfehlern in der Briefing-Pipeline:

1. **Server-Auto-Extend überschreibt die Briefing-Dauer**
   - Der Parser erkennt zwar `Skript-Timing verwendet · 3 Shots`.
   - Danach läuft aber `duration_auto_extend` über den vom Modell erzeugten/aufgeblähten Voiceover-Text.
   - Wenn das Modell zu viel Text in `voiceover.text` packt, wird daraus eine falsche Sprechdauer berechnet und `project.totalDurationSec` wird auf die Summe gesetzt — im Screenshot dann `Skript-Dauer verwendet · 50s`.

2. **Client-Finalisierung vertraut falschem Canonical-Meta**
   - `finalizePlanCanonical` nimmt `debug.canonical_timing.durationSec` als autoritativ, wenn Szenenanzahl und Ratio plausibel wirken.
   - Bei 3 Szenen und 50s/30s bzw. 50s/15s kann dieser Wert noch als “validiert” durchrutschen.
   - Deshalb zeigt `SafePlanNotice` grün “Plan passt zu deinem Briefing”, obwohl das Briefing eindeutig `15 Sekunden / 3 Szenen` sagt.

3. **Direkt-Parse im Sheet hat weniger Schutz als War-Room-Flow**
   - Der War-Room-Flow ruft `applyCanonicalTimingToPlan` auf.
   - Der direkte Sheet-Parse finalisiert nur den Serverplan und kann dadurch ein serverseitig falsch gestrecktes 50s-Ergebnis übernehmen.

## Ziel-Logik

Für diese Art Briefing muss gelten:

```text
Explizite Briefing-Dauer: 15s
Explizite Struktur: 3 Szenen
Sub-Shots: 0–2.5, 2.5–5, 5–7.5, 7.5–10, 10–12.5, 12.5–15

=> Production Plan: 3 Szenen à 5s
=> Board-Toggle: automatisch 15s
=> Kein Auto-Extend auf 50s
=> Kein grünes “konsistent”, wenn Canonical != Briefing
```

## Umsetzungsplan

### 1. Eine zentrale “Briefing Duration Authority” einführen
- In `src/hooks/useStoryboardTransition.ts` eine robuste Hilfslogik ergänzen/ausbauen, die aus dem originalen Briefing immer zuerst liest:
  - `Länge: ca. 15 Sekunden`
  - `In 15 Sekunden ...`
  - `3 Szenen`
  - kompakte Shotliste `0,0–2,5`, `12,5–15,0`
- Ergebnis als einzig gültige Kunden-Vorgabe behandeln: `{ durationSec: 15, sceneCount: 3, source: 'explicit-total' }`.

### 2. Server-Auto-Extend in Script-Lock begrenzen
- In `supabase/functions/briefing-deep-parse/index.ts` ändern:
  - Wenn `scriptTiming.mode === 'SHOT_MARKERS'` und eine explizite Briefing-Dauer existiert, darf `duration_auto_extend` **nicht** die Gesamtzeit über diese Dauer strecken.
  - Auto-Extend darf nur warnen/Meta schreiben, nicht `project.totalDurationSec` auf 50s setzen.
  - Für das konkrete Briefing bleibt die Server-Antwort daher `canonical.duration_seconds = 15`, nicht 50.

### 3. Client-Sheet immer gegen Originalbriefing normalisieren
- In `ProductionPlanSheet.tsx` beim direkten Parse denselben `applyCanonicalTimingToPlan`-Schritt anwenden wie im War-Room-Flow.
- Zusätzlich vor Anzeige/Apply: wenn Originalbriefing eine explizite Dauer hat, muss diese Dauer vor `finalizePlanCanonical` in den Plan geschrieben werden.

### 4. `finalizePlanCanonical` strenger machen
- `canonical_timing.source === 'explicit-total'` nur akzeptieren, wenn es aus dem **aktuellen Originalbriefing** stammt oder bereits zur Szenensumme passt.
- Stale/falsch berechnete Werte wie 50s dürfen nicht mehr proportional auf Szenen verteilt werden.
- Wenn ein Widerspruch bleibt, soll der Plan blockiert oder auf die Briefing-Dauer korrigiert werden — niemals grün als “passt” erscheinen.

### 5. Summary/Notice ehrlich anzeigen
- `BriefingPlanSummary` soll bei 15s-Briefing nicht mehr `Skript-Dauer verwendet · 50s` zeigen.
- `SafePlanNotice` soll nur grün werden, wenn `project.totalDurationSec`, Szenensumme und erkannte Briefing-Dauer wirklich zusammenpassen.

### 6. Regressionstests mit exakt deinem Briefing
- Tests ergänzen für:
  - Voller AdTool-Briefingtext mit Altersbereichen `30–50 Jahre` → 15s, 3 Szenen.
  - Server-artiger Plan mit `script_timing: 3 Shots`, `canonical_timing: 50s`, Szenen 50s → Client normalisiert zurück auf 15s.
  - Auto-Extend darf bei expliziten 15s nicht auf 50s strecken.
  - Direkt-Parse und War-Room-Parse laufen durch dieselbe Dauer-Normalisierung.

## Erwartetes Ergebnis nach Implementierung

- Dein Screenshot-Fall zeigt danach **15s**, nicht 50s.
- Der Toggle springt automatisch auf **15s** und bleibt dort.
- Der Plan zeigt **3 Szenen** mit Summe **15s**.
- Kein grüner Konsistenzhinweis mehr bei falscher Dauer.
- Falls das Skript wirklich zu lang für 15s wäre, wird das später als Warnung beim Generieren behandelt — nicht durch heimliches Strecken des Plans auf 50s.