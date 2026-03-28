

## Fix: Timing-Offset hat keinen sichtbaren Effekt im Preview

### Ursache (diesmal wirklich gefunden)

Das Problem ist **architektonisch**, nicht logisch. Der Code-Flow ist korrekt — das Transition-Fenster verschiebt sich mathematisch mit dem Offset. Aber:

1. Das Quellvideo ist **ein durchgehender Stream**. Szene 3 endet bei z.B. 15.0s im Source, Szene 4 startet bei 15.0s.
2. Bei +2.0s Offset: Transition-Fenster öffnet sich erst bei 16.94s (= 15.0 + 2.0 - 0.06).
3. **Aber**: Der Video-Decoder spielt bei 15.0s bereits Szene 4's Inhalt ab — der visuelle Schnitt im Quellvideo ist sofort sichtbar.
4. Die Boundary-Logik verhindert zwar einen Seek (wartet auf `effectiveBoundary`), aber das Video zeigt trotzdem schon den nächsten Szeneninhalt.
5. Wenn das Transition-Fenster bei 16.94s endlich öffnet, ist der visuelle Schnitt längst passiert → der Offset hat keinen sichtbaren Effekt.

```text
Quellvideo:    [===Szene 3===|===Szene 4===]
                             ^ 15.0s: Decoder zeigt schon Szene 4

Transition-Fenster (+2s):    |----[Fenster]-------|
                                  ^ 16.94s        ^ 17.9s
                                  Zu spät — Szene 4 läuft schon seit 2s!
```

### Lösung: "Frame-Freeze" des Outgoing-Frames bei positivem Offset

Wenn ein positiver Offset existiert, muss der letzte Frame der ausgehenden Szene **eingefroren** und als Overlay angezeigt werden, bis das Transition-Fenster beginnt:

```text
Quellvideo:    [===Szene 3===|===Szene 4===]
Frame-Freeze:                |FREEZE FRAME|
Transition:                               [crossfade → Szene 4]
                             ^ 15.0s      ^ 16.94s             ^ 17.9s
```

### Implementation

**1. `useFrameCapture.ts` erweitern: Auch den letzten Frame jeder Szene capturen**

Zusätzlich zum ersten Frame der Incoming-Szene wird der letzte Frame jeder Outgoing-Szene (bei `original_end_time - 0.05`) als ImageBitmap gespeichert. Key: `"outgoing-" + scene.id`.

**2. `useTransitionRenderer.ts`: Frame-Freeze-Phase vor dem Transition-Fenster**

Neue Logik im rAF-Loop:
- Wenn `offset > 0` und `time >= original_end_time` und `time < tStart` (vor dem Transition-Fenster):
  - Canvas zeigt den Outgoing-Frame (freeze frame)
  - Canvas opacity = 1, Video darunter verdeckt
  - `found = true`, damit keine Styles zurückgesetzt werden
- Wenn `time >= tStart`: Normaler Transition-Ablauf wie bisher

**3. `DirectorsCutPreviewPlayer.tsx`: Boundary-Logik anpassen**

- Bei positivem Offset: Video **nicht** am Szenenende halten, sondern weiterlaufen lassen (ist bereits so)
- `findSceneBySourceTime` akzeptiert bereits die nächste Szene per exact match → kein Seek nötig
- Sicherstellen, dass `lastSceneIndexRef` während der Freeze-Phase nicht auf die nächste Szene springt

**4. Export: Remotion-Template prüfen**

Remotion nutzt `<TransitionSeries>` mit expliziten Frames — dort ist der Offset einfacher: Die Transition-Position wird um `offset * fps` Frames verschoben.

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/components/directors-cut/preview/useFrameCapture.ts` | Outgoing-Frame-Capture hinzufügen |
| `src/components/directors-cut/preview/useTransitionRenderer.ts` | Frame-Freeze-Phase vor Transition-Fenster |
| `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` | Scene-change während Freeze unterdrücken |

### Ergebnis
- Positiver Offset: Outgoing-Szene wird visuell "eingefroren" bis der Übergang startet
- Negativer Offset: Übergang startet früher (funktioniert bereits)
- Kein Stottern, kein Loop — nur ein zusätzliches Canvas-Overlay in der Freeze-Phase
- Export und Preview zeigen denselben zeitlichen Übergang

