
Ziel: Den Fehler diesmal an den tatsächlich noch falschen Stellen beheben. Die aktuelle 30s-Anzeige in Schritt 3 kommt nicht aus dem Preview-Player, sondern aus widersprüchlichen Dauerberechnungen in mehreren UI-Komponenten. Zusätzlich ist der Rechts-Shift beim ersten Slide sehr wahrscheinlich ein Renderer-Reset-/Layout-Problem, das im aktuellen Hook noch nicht hart genug neutralisiert wird.

1. Echte Ursache für die 30 Sekunden
- In `DirectorsCut.tsx` ist die globale Dauer schon auf `Math.max(...end_time)` umgestellt.
- Aber in Schritt 3 wird diese Logik lokal wieder überschrieben:
  - `SceneEditingStep.tsx` berechnet `actualTotalDuration` noch als Summe aller Szenenlängen.
  - `VisualTimeline.tsx` berechnet dieselbe Dauer ebenfalls noch als Summe.
- Genau diese beiden Stellen erklären, warum Schritt 3 weiterhin 30.0s zeigt, obwohl die Parent-Komponente schon korrekt arbeitet.
- Zusätzlich nutzt `handleStartAnalysis()` in `DirectorsCut.tsx` für Frame-Extraktion und Analyse-Request weiterhin `selectedVideo.duration || 30`. Wenn die importierte Library-Dauer fehlt oder falsch ist, wird die Analyse weiterhin mit 30 Sekunden gestartet.

2. Echte Ursache für den ersten Slide-Fehler
- `useTransitionRenderer.ts` setzt zwar viele Styles zurück, aber im aktiven Slide/Push-Zweig bleibt das Base-Video ein normaler Layout-Teilnehmer.
- Bei Slide wird das Incoming-Video absolut positioniert, das Base-Video aber nicht explizit auf einen stabilen absoluten Layer gezwungen.
- Gleichzeitig werden Reset-Werte teils mit `''`/leeren Defaults statt stabilen expliziten Layoutwerten verwendet.
- Dadurch ist der erste Übergang besonders anfällig für einen Layer-Offset nach rechts, obwohl spätere Frames teilweise korrekt aussehen.

3. Konkrete Umsetzung
- `src/components/directors-cut/steps/SceneEditingStep.tsx`
  - Alle lokalen Dauerberechnungen von `sum(end-start)` auf `Math.max(...end_time)` umstellen.
  - Footer-Statistik ebenfalls auf dieselbe kanonische Dauer umstellen.
  - Sicherstellen, dass Preview, Timeline und Stats exakt dieselbe Dauerquelle verwenden.
- `src/components/directors-cut/ui/VisualTimeline.tsx`
  - `actualTotalDuration` ebenfalls auf `Math.max(...end_time)` umstellen.
  - Divider-Drag/Marker-Berechnungen auf diese kanonische Dauer synchronisieren.
- `src/pages/DirectorsCut/DirectorsCut.tsx`
  - In `handleStartAnalysis()` nicht mehr `selectedVideo.duration || 30` direkt verwenden.
  - Vor Analyse eine kanonische Quelldauer bestimmen:
    - primär `selectedVideo.duration`
    - sonst Metadaten/geladene Videodauer
    - nur als letzter Notfall 30
  - Diese Dauer für Frame-Extraktion und den Analyze-Request verwenden.
- `src/components/directors-cut/steps/VideoImportStep.tsx`
  - Die Mediathek-Karte zeigt aktuell unten rechts weiterhin `duration_in_frames / 30`.
  - Auch die Anzeige dort auf `metadata.duration_seconds` priorisieren, damit UI und tatsächliche Projekt-Dauer nicht auseinanderlaufen.
- `src/components/directors-cut/preview/useTransitionRenderer.ts`
  - Base-Video im aktiven Transition-Zweig explizit auf denselben stabilen Layer-Frame setzen wie Incoming:
    - `position: absolute`
    - `inset: 0`
    - `width/height: 100%`
    - `objectFit: contain`
  - Inaktive Resets nicht nur “leeren”, sondern deterministisch neutralisieren.
  - Damit Slide/Push den ersten Layer nicht mehr seitlich aus dem Layout schieben.

4. Warum dieser Plan diesmal gezielt ist
- Das 30s-Problem ist jetzt direkt im Code nachweisbar: Schritt 3 rechnet lokal falsch, obwohl der Parent bereits richtig rechnet.
- Das ist kein Deployment-Thema, sondern ein verbliebener Widerspruch zwischen Parent- und Child-Komponenten.
- Der Slide-Bug sitzt sehr wahrscheinlich im Layering selbst, nicht mehr in der reinen Transition-Zeit.

5. Erfolgskriterien
- Schritt 2 und Schritt 3 zeigen dieselbe Gesamtdauer.
- Die Timeline in Schritt 3 zeigt nicht mehr fest 30.0s, wenn die Szenen tatsächlich bis 32s reichen.
- Der erste Slide verschiebt das Bild nicht mehr nach rechts.
- Preview, Slider und Timeline basieren überall auf derselben Dauerlogik.

6. Technische Kurznotiz
```text
Kanonische Dauer überall:
duration = max(scene.end_time)

Nicht mehr zulässig:
duration = sum(scene lengths)
duration = duration_in_frames / 30
duration = selectedVideo.duration || 30 als versteckter Default in Unterkomponenten
```
