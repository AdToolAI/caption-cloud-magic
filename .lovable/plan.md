

## Fix: Transitions auf Original-Schnittstellen verankern (Source-Time-Domain)

### Kernproblem

Alle Transition-Berechnungen laufen aktuell im **Timeline-Zeit-Raum**:

```text
video.currentTime (Source) → reverse-map → timelineTime → findActiveTransition(timelineTime)
```

Das Reverse-Mapping hat bei jedem Szenenwechsel eine Ungenauigkeit von ~0.1-0.2s (Browser-Decoder-Drift). Bei 3 Szenen summiert sich das auf ~0.5s. Transition 2 und 3 kommen deshalb zu früh.

### Lösung: Source-Time-Domain statt Timeline-Domain

Statt den Umweg über Timeline-Zeit zu nehmen, vergleichen wir `video.currentTime` **direkt** mit den originalen Schnittstellen im Quellvideo:

```text
video.currentTime (Source) → findActiveTransition(sourceTime, original_end_times)
                            ↓
                     Transition an Original-Schnitt verankert → kein Drift
```

### Konkrete Änderungen

**1. `findActiveTransition` auf Source-Domain umstellen**

Aktuell:
```typescript
const boundary = t.anchorTime ?? scene.end_time;  // Timeline-Domain
```

Neu:
```typescript
const boundary = scene.original_end_time ?? scene.end_time;  // Source-Domain
```

Die Funktion bekommt `sourceTime` statt `timelineTime` als Parameter. Da `original_end_time` im Source-Domain liegt und `video.currentTime` ebenfalls, gibt es keine Mapping-Drift.

**2. `anchorTime` komplett entfernen**

Per Nutzerwunsch: keine manuellen Anker mehr.

- Aus `findActiveTransition`: `anchorTime`-Referenz entfernen
- Aus `useTransitionRenderer`: `anchorTime`-Referenz entfernen
- Aus `NativeTransitionOverlay`/`NativeTransitionLayer`: ebenfalls
- Aus `VisualTimeline.tsx`: Anchor-Drag-UI entfernen (Dot bleibt als Klick-Button für Transition-Typ)
- Aus `SceneEditingStep.tsx`: `onTransitionAnchorChange` und Anchor-Shift-Logik entfernen

**3. `useTransitionRenderer` auf Source-Time umstellen**

Aktuell liest er `visualTimeRef.current` (Timeline). Stattdessen:
- Liest `baseVideoRef.current.currentTime` direkt (Source-Domain)
- Boundary = `scene.original_end_time ?? scene.end_time`
- Kein Mapping-Schritt mehr nötig

**4. rAF-Loop im PreviewPlayer anpassen**

`cachedActiveTrans` wird jetzt mit `videoSourceTime` statt `timelineTime` aufgerufen:
```typescript
cachedActiveTrans = findActiveTransition(videoSourceTime);
```

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `DirectorsCutPreviewPlayer.tsx` | `findActiveTransition` auf sourceTime, anchorTime entfernen |
| `useTransitionRenderer.ts` | `video.currentTime` statt `visualTimeRef`, Boundary auf `original_end_time` |
| `NativeTransitionOverlay.tsx` | Boundary auf `original_end_time`, anchorTime entfernen |
| `NativeTransitionLayer.tsx` | Boundary auf `original_end_time` |
| `VisualTimeline.tsx` | Anchor-Drag-UI entfernen, Dot nur noch als Klick-Button |
| `SceneEditingStep.tsx` | `onTransitionAnchorChange` und Anchor-Shift-Logik entfernen |

### Warum das funktioniert

- **Kein Drift**: `video.currentTime` wird direkt mit `original_end_time` verglichen — beide im selben Domain
- **Kein Mapping-Fehler**: Der fehleranfällige `sourceToTimelineTime`-Schritt wird für Transitions komplett übersprungen
- **Einfacher Code**: `anchorTime` und dessen Synchronisations-Logik fällt komplett weg
- **Alle bisherigen Fixes bleiben**: Video-led Playback, kein Loop, kein Stottern, Audio-Stabilität

