
Problem

Die Übergänge sind im UI auswählbar, werden aber in der Vorschau nicht gerendert, weil die IDs an zwei Stellen unterschiedlich interpretiert werden:

- Im `CutPanel` wird ein Übergang aktuell auf die eingehende Szene gespeichert (`sceneId={scenes[i + 1].id}`)
- Der gemeinsame Resolver (`resolveTransitions`) sowie der Preview-Player erwarten Übergänge aber auf der ausgehenden Szene (`scene.id`)

Dadurch findet der Renderer zur Szenengrenze oft keinen passenden Übergang, obwohl im Panel einer gesetzt wurde.

Plan

1. Übergangs-Zuordnung vereinheitlichen
- In `src/components/directors-cut/studio/sidebar/CutPanel.tsx` die Transition-Blöcke auf die ausgehende Szene mappen
- Also den Block zwischen Szene 1 und 2 an `sceneId={scene.id}` statt `scenes[i + 1].id` hängen
- Anzeige, Auswahl, Dauer-Slider und Entfernen damit alle dieselbe ID-Logik verwenden

2. Bestandsdaten kompatibel machen
- In `src/pages/DirectorsCut/DirectorsCut.tsx` beim Laden/Initialisieren der Transitions eine kleine Normalisierung einbauen
- Ziel: alte Drafts oder bereits gespeicherte Übergänge, die noch auf die eingehende Szene zeigen, automatisch auf die ausgehende Szene umlegen
- So funktionieren bestehende Projekte weiter, ohne dass der Nutzer alle Übergänge neu setzen muss

3. Default-/Auto-Logik konsistent halten
- Prüfen und angleichen, dass Standard-Transitions und AI-/AutoCut-Flows ebenfalls konsequent die ausgehende Szene referenzieren
- Damit Sidebar, Preview und Resolver dieselbe Datenstruktur verwenden

4. Preview-Rendering dadurch freischalten
- `DirectorsCutPreviewPlayer.tsx` und `transitionResolver.ts` müssen voraussichtlich nicht grundlegend geändert werden, weil sie bereits konsistent auf “outgoing scene” aufgebaut sind
- Nach der Datenkorrektur sollten Fade, Crossfade, Slide, Wipe usw. wieder sichtbar werden

Betroffene Dateien
- `src/components/directors-cut/studio/sidebar/CutPanel.tsx`
- `src/pages/DirectorsCut/DirectorsCut.tsx`

Technische Details
```text
Aktuell:
[Szene A] -- Übergang -- [Szene B]
                |
           gespeichert als sceneId = Szene B

Renderer erwartet:
[Szene A] -- Übergang -- [Szene B]
                |
           gespeichert als sceneId = Szene A
```

Ergebnis
- Übergänge werden wieder sichtbar in der Vorschau
- Bereits gesetzte Übergänge in laufenden Projekten bleiben nutzbar
- CutPanel, Draft-Loading und Preview verwenden dieselbe Logik
