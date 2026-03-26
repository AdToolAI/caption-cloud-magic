

## Fix: Video-Stottern im Universal Director's Cut

### Ursache

Zwei Hauptprobleme verursachen das Stottern:

1. **Massives Debug-Logging**: `DirectorsCutPreviewPlayer.tsx` enthält ~30+ `console.log` Aufrufe in `useMemo`, `useEffect` und Event-Handlern. Diese feuern bei jeder Szenen-/Effekt-Aenderung und waehrend der Wiedergabe (z.B. bei jedem `timeupdate`-Event). Das blockiert den Main-Thread.

2. **Player-Remount bei Effekt-Aenderungen**: Zeile 379-381 erzeugt einen neuen `playerKey` bei jeder Aenderung von brightness/contrast/saturation/etc. Das zerstoert den gesamten Remotion `<Player>` und baut ihn neu auf — das Video muss jedes Mal neu buffern. Stattdessen sollten die `inputProps` reaktiv aktualisiert werden, ohne den Player zu remounten.

### Aenderungen

#### 1. `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

- **Alle `console.log`-Aufrufe entfernen** (Zeilen 106-117, 143-148, 155-156, 179, 293-301, 307-310, 333, 343, 354, 373, 415, 457, 478, 498, 510, 525, 549, 574) — ca. 30 Stellen
- **`playerKey` stabilisieren**: Statt den Key bei jedem Effekt-Slider neu zu setzen, einen festen Key verwenden. Die Effekte fliessen bereits ueber `inputProps` ein — der Player muss dafuer nicht remountet werden. Der Key sollte sich nur bei strukturellen Aenderungen aendern (z.B. `videoUrl`)
- **`onTimeUpdate` in `useEffect` Dependency stabilisieren**: Zeile 431 hat `[onTimeUpdate]` als Dependency, was den Event-Listener bei jedem Parent-Rerender neu registriert. Stattdessen `useRef` fuer den Callback verwenden

#### Vorher (playerKey):
```typescript
const playerKey = useMemo(() => {
  return `player-${effects.brightness}-${effects.contrast}-...`;
}, [effects.brightness, effects.contrast, ...]);
```

#### Nachher:
```typescript
const playerKey = useMemo(() => {
  return `player-${videoUrl}-${durationInFrames}`;
}, [videoUrl, durationInFrames]);
```

### Ergebnis
- Kein Player-Remount mehr beim Anpassen von Effekten
- Main-Thread wird nicht mehr durch Debug-Logs blockiert
- Fluessige Wiedergabe ohne Stottern

### Datei
1. `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

