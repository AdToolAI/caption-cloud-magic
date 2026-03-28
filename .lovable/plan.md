
## Fix: Übergänge 2 und 3 bleiben zu früh, obwohl das Bundle korrekt deployed ist

### Was ich im Code gefunden habe
Der 5/95-Timing-Fix ist bereits an allen relevanten Stellen drin:
- `DirectorsCutPreviewPlayer.tsx`
- `useTransitionRenderer.ts`
- `NativeTransitionOverlay.tsx`
- `NativeTransitionLayer.tsx`

Wenn das Problem trotzdem bleibt, liegt es sehr wahrscheinlich **nicht mehr am Bundle** und auch **nicht mehr am Lead-in/Lead-out-Split**.

### Wahrscheinliche eigentliche Ursache
Im Editor gibt es `anchorTime` pro Transition. Diese Zeit ist **absolut auf der Timeline gespeichert**.

Problem dabei:
- Wenn frühere Szenen in der Länge verändert oder verschoben werden, verschieben sich spätere Szenengrenzen.
- Die gespeicherten `anchorTime`-Werte der späteren Transitions werden aber **nicht mitverschoben**.
- Dadurch liegen Transition 2 und 3 später oft noch auf alten Timeline-Positionen und wirken dann im Preview um ~0.5s zu früh oder generell versetzt.

Dazu kommt noch ein zweites Problem:
- In `VisualTimeline.tsx` startet `onMouseDown` auf dem Transition-Dot sofort den Anchor-Drag.
- Beim Loslassen wird `anchorTime` zurückgeschrieben, selbst wenn man den Punkt nur angeklickt hat.
- So kann unbemerkt ein fixer Anchor entstehen, obwohl eigentlich nur der Transition-Dialog geöffnet werden sollte.

### Geplanter Fix
1. **Anchor nur als echte manuelle Override-Position behandeln**
   - `anchorTime` soll nur gesetzt werden, wenn der Nutzer den Punkt wirklich gezogen hat.
   - Ein normaler Klick öffnet nur den Dialog und speichert keinen Anchor.

2. **Transitions bei Szenen-Verschiebung mitsynchronisieren**
   - In `SceneEditingStep.tsx` beim `handleTimelineDurationChange`:
     - alle nachfolgenden `anchorTime`-Werte um denselben `durationDelta` verschieben
     - nur wenn ein Transition-Objekt tatsächlich einen manuellen `anchorTime` hat

3. **Optional: Anchor auf Boundary zurücksetzen**
   - Wenn ein Anchor praktisch wieder auf `scene.end_time` liegt, den Override entfernen (`anchorTime: undefined`)
   - Dann nutzt der Player wieder automatisch die aktuelle Szenengrenze

4. **Preview-Logik unverändert lassen**
   - `DirectorsCutPreviewPlayer` und Canvas-Renderer müssen vermutlich nicht erneut geändert werden
   - sie lesen bereits korrekt `transition.anchorTime ?? scene.end_time`

### Betroffene Dateien
- `src/components/directors-cut/ui/VisualTimeline.tsx`
- `src/components/directors-cut/steps/SceneEditingStep.tsx`

### Konkrete Umsetzung
```text
VisualTimeline
├─ click ohne echten Drag => nur Transition-Editor öffnen
├─ drag über kleine Schwelle => anchorTime aktualisieren
└─ kein versehentliches Persistieren mehr

SceneEditingStep
├─ scene duration ändern
├─ durationDelta berechnen
├─ nachfolgende Szenen verschieben
└─ alle manuellen transition.anchorTime Werte ab betroffenem Punkt mitverschieben
```

### Warum das die beste nächste Maßnahme ist
- erklärt, warum speziell **Transition 2 und 3** falsch liegen, obwohl Transition 1 passt
- erklärt, warum ein korrekt deploytes Bundle nichts ändert
- behebt die Ursache im Editordatenmodell statt weiter am Renderer herumzudrehen
- bewahrt die bereits funktionierenden Fixes:
  - kein Endlos-Loop
  - kein Stottern
  - smoothes Video-led Playback

### Technische Details
Ich würde konkret:
- in `VisualTimeline.tsx` eine kleine Drag-Schwelle einführen (`hasMovedRef`, z. B. 4–6px)
- `onTransitionAnchorChange` nur feuern, wenn diese Schwelle überschritten wurde
- in `SceneEditingStep.tsx` innerhalb von `handleTimelineDurationChange` zusätzlich die `transitions` mitupdaten:
  - Transition derselben Szene: Anchor relativ zur neuen Boundary optional beibehalten oder resetten
  - alle späteren Transition-Anker: `anchorTime += durationDelta`
- Anchors, die fast exakt auf der Boundary liegen, bereinigen statt dauerhaft mitzuschleppen

### Ergebnis
Nach diesem Fix sollten:
- Transition 2 und 3 wieder an der **richtigen Timeline-Position** liegen
- spätere Szenenänderungen keine versteckten Timing-Fehler mehr erzeugen
- der Preview Player weiterhin smooth und ohne Loop laufen
