

# r54: Bilder und sichere Animationen wiederherstellen

## Was r53 bewiesen hat
Solid-Color + keine Animationen/Transitions = keine schwarzen Szenen. Das Problem lag in der Rendering-Logik, nicht im Timing.

## Was sich ändert

### 1. Szenen-Mapping wiederherstellen (Zeilen 1289-1318)
Statt der r53-Minimalconfig werden die echten Szenen-Daten wieder verwendet:

- **Background**: Wenn `scene.imageUrl` vorhanden → `type: 'image'` mit URL. Sonst → `type: 'gradient'` mit `gradientColors` aus `scene.background` oder Brand-Colors.
- **Animation**: Blacklist für `parallax`, `popIn`, `flyIn`, `morphIn` (strukturelle Bugs im r42-Bundle). Alle anderen (`fadeIn`, `slideUp`, `slideLeft`, `slideRight`, `zoomIn`, `zoomOut`, `bounce`, `kenBurns`, `none`) erlaubt. `kenBurns` nur bei Image-Backgrounds.
- **Transition**: `fade` mit 0.5s Duration wieder aktiviert. `morph` bleibt blacklisted.
- **Text Overlays**: Volle Konfiguration mit `headline`, `text`, `animation`, `position`.
- **Sound Effects**: Wieder aktiviert via `getDefaultSoundEffect()`.

### 2. Feature-Flags normalisieren (Zeilen 1323-1332)
- `disableSceneFx` → `false` (war `true`)
- `disableAnimatedText` → `false` (war `true`)
- `disableMorphTransitions` → `true` (bleibt disabled)

### 3. Animation-Guard Logik
```text
BLACKLISTED_ANIMATIONS = ['parallax', 'popIn', 'flyIn', 'morphIn']
BLACKLISTED_TRANSITIONS = ['morph']

rawAnimation = scene.animation || getDefaultAnimation(sceneType)
if rawAnimation in BLACKLISTED → fallback 'fadeIn'
if rawAnimation == 'kenBurns' && no imageUrl → fallback 'fadeIn'
else → use rawAnimation

rawTransition = scene.transition?.type || 'fade'
if rawTransition in BLACKLISTED → fallback 'fade'
```

### 4. Forensik beibehalten
`timingDiagnostics` und `sceneTimeline` bleiben für Post-Render-Debugging.

### Datei
- `supabase/functions/auto-generate-universal-video/index.ts` — Zeilen 1289-1332 + Build-Tag
- Deploy Edge Function

### Build-Tag
`r54-restore-images-safe-animations`

