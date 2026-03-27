

## Draggable Transition-Dot für manuelle Übergangs-Position

### Ziel
Statt nur Typ und Dauer zu ändern, soll man den **Transition-Dot direkt auf der Timeline nach links/rechts ziehen** können. Der Dot steuert dann, **wann innerhalb der beiden angrenzenden Szenen der Übergang stattfindet**. So kann man problematische Übergänge manuell sauber setzen, ohne auf die KI zu warten.

### Gefundener Ist-Zustand
- `VisualTimeline.tsx` rendert den Dot aktuell nur als Klick-Button.
- `SceneEditingStep.tsx` kann bisher nur `transitionType` und `duration` je `sceneId` ändern.
- Die Preview-Logik (`DirectorsCutPreviewPlayer.tsx` + `useTransitionRenderer.ts`) verankert Übergänge fest an `scene.end_time` und kennt **keinen manuellen Offset**.

### Vorschlag
Die Transition bekommt zusätzlich eine **manuelle Anchor-Position** pro Szenenübergang, z. B. `anchorTime` oder `boundaryOffset`.

Empfehlung:
- `anchorTime: number` direkt in `TransitionAssignment`
- Fallback bleibt wie heute: wenn nichts gesetzt ist, nutze `scene.end_time`

So kann der Benutzer den Dot frei verschieben und die Render-/Playback-Logik arbeitet mit diesem echten Anker statt immer mit dem automatischen Schnittpunkt.

### Umsetzung

#### 1) Datenmodell erweitern
**Datei:** `src/types/directors-cut.ts`
- `TransitionAssignment` um optionales Feld erweitern:
  - `anchorTime?: number`
- Bedeutet: exakter Timeline-Zeitpunkt des Übergangs zwischen Szene A und B

Vorteil:
- klarer als nur ein relativer Offset
- Preview, Timeline und später Export können denselben Wert verwenden

#### 2) Timeline-Dot draggable machen
**Datei:** `src/components/directors-cut/ui/VisualTimeline.tsx`
- Neue Props ergänzen:
  - `onTransitionAnchorChange?: (sceneId: string, anchorTime: number) => void`
- Für jeden Dot:
  - Drag per `onMouseDown` + globale `mousemove`/`mouseup` Listener
  - Während Drag die Mausposition in Timeline-Zeit umrechnen
  - Den Wert auf einen sinnvollen Bereich clampen:
    - nicht vor Start der linken Szene + Sicherheitsabstand
    - nicht nach Ende der rechten Szene - Sicherheitsabstand
- Der Dot soll **visuell an seiner echten Anchor-Zeit** stehen, nicht mehr nur mittig auf der Szenengrenze
- Optional kleine Vorschau/Label während Drag:
  - z. B. `Übergang bei 12.4s`

#### 3) Parent-State sauber aktualisieren
**Datei:** `src/components/directors-cut/steps/SceneEditingStep.tsx`
- Neue Handler ergänzen:
  - `handleTransitionAnchorChange(sceneId, anchorTime)`
- Verhalten:
  - wenn Transition existiert: `anchorTime` updaten
  - wenn noch keine Transition existiert: optional direkt Standard-Transition anlegen (`crossfade`, `0.5s`) und `anchorTime` setzen
- `VisualTimeline` diese neue Prop übergeben

Zusätzlich sinnvoll:
- Wenn per Sidebar/Picker ein Übergang neu angelegt wird und noch kein `anchorTime` existiert:
  - Standard auf `scene.end_time` setzen

#### 4) Preview-Playback auf echten Anchor umstellen
**Dateien:**
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/components/directors-cut/preview/useTransitionRenderer.ts`

Aktuell:
- `boundary = scene.end_time`

Neu:
- gemeinsame Boundary-Auflösung:
  - `boundary = transition.anchorTime ?? scene.end_time`

Diese Boundary muss an **allen relevanten Stellen identisch** verwendet werden:
- `findActiveTransition`
- Base/Incoming-Sync im Playback-rAF
- `handleSeek`
- Transition-Renderer-rAF

So bleibt alles synchron:
- Timeline-Dot
- sichtbarer Übergang
- Videopositionierung

#### 5) Schutzlogik gegen kaputte Übergänge
Beim Draggen Anchor clampen, damit der Übergang technisch stabil bleibt:
- Übergangsfenster darf nicht unendlich in Nachbar-Transitions laufen
- Mindestabstand zu Szenenrändern beibehalten
- bestehendes Overlap-Clamping bleibt zusätzlich aktiv

### UX-Verhalten
- Klick auf Dot: weiterhin Übergang auswählen / Detailpanel öffnen
- Drag auf Dot: verschiebt den echten Übergangspunkt
- Dadurch kann der Nutzer problematische Übergänge 2 und 3 direkt selbst sauber nachjustieren

### Technische Kurzfassung
```text
Heute:
  boundary = scene.end_time

Neu:
  boundary = transition.anchorTime ?? scene.end_time

Dot-Position:
  left = anchorTime auf Timeline

Drag:
  Maus-X -> Timeline-Zeit -> clamp -> anchorTime speichern
```

### Betroffene Dateien
- `src/types/directors-cut.ts`
- `src/components/directors-cut/ui/VisualTimeline.tsx`
- `src/components/directors-cut/steps/SceneEditingStep.tsx`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/components/directors-cut/preview/useTransitionRenderer.ts`

### Ergebnis
- Du kannst problematische Übergänge direkt unten in der Timeline selbst verschieben
- Die Preview folgt genau dieser Position
- KI bleibt optional, aber du bist nicht mehr blockiert, wenn sie den Schnittpunkt nicht perfekt trifft

