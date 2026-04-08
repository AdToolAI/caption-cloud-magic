

## Plan: Szenen-Animationen (Zoom In/Out, Pan) + Geschwindigkeitsregler pro Szene

### Problem

1. **Keine Zoom/Pan-Effekte**: Es gibt keine Möglichkeit, Szenen-Animationen wie Zoom In, Zoom Out, Pan Left/Right/Up/Down zuzuweisen
2. **Kein Geschwindigkeitsregler pro Szene**: Obwohl `SceneAnalysis.playbackRate` und `SceneEffects.speed` im Typ existieren, gibt es kein UI zum Anpassen der Geschwindigkeit (0.1x – 3x)

### Lösung

**1. SceneEffects erweitern** (`src/types/directors-cut.ts`)

Neues Feld `animation` zu `SceneEffects` hinzufügen:
```
animation?: {
  type: 'none' | 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight' | 'panUp' | 'panDown' | 'zoomInSlow' | 'zoomOutSlow';
  intensity?: number; // 0-100, default 50
}
```

**2. FXPanel um zwei neue Sektionen erweitern** (`FXPanel.tsx`)

- **Szenen-Animation**: Grid mit Kacheln für None, Zoom In, Zoom Out, Zoom In (Slow), Zoom Out (Slow), Pan Left, Pan Right, Pan Up, Pan Down — nur aktiv wenn eine Szene ausgewählt ist
- **Geschwindigkeit**: Slider von 0.1x bis 3.0x mit Anzeige des Werts, Quick-Presets (0.25x, 0.5x, 1x, 2x, 3x) — pro Szene oder global

FXPanel erhält neue Props: `selectedSceneId`, `sceneEffects`, `onSceneEffectsChange`, `scenes`, `onScenePlaybackRateChange`

**3. Props-Kette verdrahten** (`CapCutSidebar.tsx` → `CapCutEditor.tsx`)

- `selectedSceneId`, `sceneEffects`, `onSceneEffectsChange` an FXPanel durchreichen
- `onScenePlaybackRateChange` Callback: setzt `playbackRate` auf der Scene und aktualisiert `end_time` basierend auf neuer Rate

**4. Preview-Player: Animation anwenden** (`DirectorsCutPreviewPlayer.tsx` oder `useTransitionRenderer`)

Im RAF-Loop die aktive Szenen-Animation als CSS-Transform auf das Video-Element anwenden (Scale + Translate, interpoliert über die Szenendauer)

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Edit | `src/types/directors-cut.ts` | `animation` Feld zu `SceneEffects` |
| Edit | `src/components/directors-cut/studio/sidebar/FXPanel.tsx` | Animations-Kacheln + Speed-Slider hinzufügen |
| Edit | `src/components/directors-cut/studio/CapCutSidebar.tsx` | Neue Props an FXPanel weiterleiten |
| Edit | `src/components/directors-cut/studio/CapCutEditor.tsx` | Speed-Change-Handler + Props an Sidebar |
| Edit | `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` | Animation-Transform im RAF-Loop |

### Ergebnis

- 9 Szenen-Animationen wählbar per Kachel im FX-Panel (nur bei selektierter Szene)
- Geschwindigkeitsregler 0.1x–3.0x mit Slider + Quick-Presets
- Animationen live in der Vorschau sichtbar
- Geschwindigkeit beeinflusst die Szenendauer korrekt

