
Ziel: Den Preview-Player zeitlich wieder mit der echten Szenengrenze synchronisieren. Aktuell sehe ich zwei konkrete Ursachen im Code, die genau zu deinem Fehlerbild passen: Der erste Übergang wird beim Start nicht sauber vorbereitet, und der Player verwendet an mehreren Stellen noch alte 5%-LeadIn-Annahmen bzw. das falsche Ende-Fenster für den Szenenwechsel.

1. Hauptursache 1: Preview-Player nutzt noch altes Timing-Modell
- In `DirectorsCutPreviewPlayer.tsx` wird zwar der gemeinsame Resolver benutzt, aber `findActiveTransition()` baut weiterhin Hilfswerte mit `leadIn: rt.duration * 0.05`.
- Das ist nicht mehr konsistent mit dem Resolver, der jetzt 50/50 arbeitet.
- Dadurch ist die Boundary-/Advance-Logik im Player semantisch verschoben, obwohl der Resolver korrekt ist.

2. Hauptursache 2: Szenenwechsel orientiert sich am falschen Punkt
- Im Playback-Loop wird ohne aktive Transition bei `effectiveBoundary = matchedRT ? matchedRT.tEnd : srcEnd` auf die nächste Szene gesprungen.
- `tEnd` ist aber das Ende des Übergangsfensters, nicht die eigentliche Schnittstelle.
- Das führt leicht dazu, dass die visuelle Zuordnung von Base-/Incoming-Video und Timeline “driftet”, besonders bei späteren Übergängen.

3. Hauptursache 3: Erster Übergang wird nicht vorgewärmt
- Das Incoming-Video wird erst gesucht, wenn `findActiveTransition()` schon aktiv ist.
- Beim ersten Übergang fehlt dadurch oft die Vorbereitungsphase; Ergebnis: der erste Effekt erscheint gar nicht oder startet zu spät/unsauber.
- Dafür brauchen wir ein kleines Preload-/Preseek-Fenster vor `tStart`.

4. Geplanter Fix
- `DirectorsCutPreviewPlayer.tsx`
  - Alle internen Hilfswerte auf den Resolver zurückführen, keine 5%-Restannahmen mehr.
  - Boundary-/Advance-Logik auf `originalBoundary + offsetSeconds` ausrichten statt auf `tEnd`.
  - Beim Start und nach manuellen Seeks den aktuellen bzw. nächsten Transition-Kontext sauber initialisieren, damit Übergang 1 vorbereitet ist.
  - Die Scene-Tracking-Logik so anpassen, dass Base-Video nicht schon vorzeitig als nächste Szene interpretiert wird.
- `useTransitionRenderer.ts`
  - Incoming-Video nicht erst bei aktivem Übergang seeken, sondern bereits kurz vor `tStart`.
  - Optional kleine Guard einbauen: Transition erst sichtbar machen, wenn das Incoming-Video seek-ready ist, damit der erste Übergang nicht “verschluckt” wird.
- `transitionResolver.ts`
  - Wahrscheinlich keine neue Architektur nötig; ich würde nur prüfen, ob die Sequential-Clamp beim ersten/zweiten Fenster ungewollt Timing verschiebt. Falls ja, wird nur diese Clamp präzisiert, nicht die ganze Resolver-Logik neu gebaut.

5. Erwartetes Ergebnis
- Übergang 1 wird sichtbar und sauber vorbereitet.
- Übergang 2 und 3 starten nicht mehr zu früh, sondern exakt um die reale Szenengrenze plus eingestelltem Timing-Offset.
- Preview verhält sich konsistenter zur Export-Logik statt ein eigenes leicht verschobenes Laufzeitmodell zu haben.

6. Technische Details
- Verdächtige Stellen:
  - `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` Zeilen um `findActiveTransition`, `leadIn`, `effectiveBoundary`, `pendingSceneAdvanceRef`
  - `src/components/directors-cut/preview/useTransitionRenderer.ts` bei `seekIncoming()` und Aktivierung erst innerhalb des aktiven Fensters
- Wichtigster Architektur-Fix:
```text
Resolver = einzige Wahrheit
Preview-Advance = an echter Boundary
Incoming-Video = vor tStart vorbereitet
Keine 5%-Schattenlogik mehr im Player
```
