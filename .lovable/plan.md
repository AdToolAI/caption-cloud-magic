

## Fix: Video ins Eck verschoben + Dauer-Diskrepanz

### Problem 1: Bildschirm wird nach Slide/Push ins Eck verschoben

**Ursache**: `useTransitionRenderer` pausiert das Base-Video während der Transition (Zeile 107) und setzt es am Ende per `base.play()` fort. Aber das Base-Video steht noch bei der Freeze-Position der alten Szene. Der Player-Tick erkennt dann eine falsche Szene, und das Incoming-Video behält residuale Styles.

**Zusätzlich**: Nach Ende der Transition wird `base.style.transform = ''` gesetzt (leerer String statt `'none'`), was bei manchen Browsern nicht zuverlässig den Transform zurücksetzt.

**Fix in `useTransitionRenderer.ts`**:
- Nach Transition-Ende: Base-Video auf die **Start-Position der eingehenden Szene** seeken, nicht einfach weiterspielen lassen
- Alle Style-Resets explizit auf `'none'` statt leeren String setzen
- Incoming-Video-Styles komplett zurücksetzen inkl. `position`, `inset`, `zIndex`

### Problem 2: Dauer 32s vs 30s

**Ursache**: Zeile 503 vergleicht `videoSourceTime` (Source-Time) mit `effectiveBoundary` (Timeline-Time). Wenn `original_end_time !== end_time` (z.B. durch Szenen-Erweiterung oder wenn die Analyse andere Timestamps liefert), löst der Boundary-Check zu früh oder zu spät aus. Das verschiebt die gesamte Abspiellogik.

**Fix in `DirectorsCutPreviewPlayer.tsx`**:
- `effectiveBoundary` in Source-Time-Domain berechnen statt in Timeline-Time
- `matchedRT.originalBoundary` verwenden (das ist bereits Source-Time) statt `matchedRT.timelineBoundary`
- Alternativ: den Vergleich auf Timeline-Time umstellen, d.h. `timelineTime >= effectiveBoundary` statt `videoSourceTime >= effectiveBoundary`

### Problem 3: Transition-Timing immer noch verschoben

**Gleiche Ursache**: In `findActiveTransition` (Zeile 415) wird zuerst `videoSourceTime` getestet, dann `approxTimelineTime`. Aber der Resolver arbeitet in Timeline-Time. Wenn Source ≠ Timeline, matcht die erste Prüfung (Zeile 415) falsch oder gar nicht.

**Fix**: `findActiveTransition` immer mit **Timeline-Time** aufrufen, nie mit Source-Time.

### Konkrete Änderungen

**Datei 1: `useTransitionRenderer.ts`**
- Transition-Ende-Block (Zeile 152-173):
  - Base-Video auf `incoming.currentTime` seeken (= Start der neuen Szene)
  - `transform: 'none'`, `clipPath: 'none'` statt leere Strings
  - Incoming-Video: auch `position`, `inset`, `width`, `height`, `objectFit`, `zIndex` zurücksetzen

**Datei 2: `DirectorsCutPreviewPlayer.tsx`**
- Zeile 414-421: `findActiveTransition` NUR mit Timeline-Time aufrufen (nicht zuerst mit Source-Time)
- Zeile 499-503: `effectiveBoundary` in Source-Time-Domain berechnen: `originalBoundary + offsetSeconds` statt `timelineBoundary + offsetSeconds`, ODER den Vergleich auf `timelineTime` umstellen

### Ergebnis
- Slide/Push-Übergänge hinterlassen keine verschobenen Video-Elemente
- Dauer ist in allen Schritten konsistent
- Boundary-Crossing und Transition-Detection arbeiten in derselben Zeit-Domain

