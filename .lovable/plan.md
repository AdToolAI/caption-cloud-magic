

# r53: Nuklear-Diagnostik — Schwarze Szenen definitiv finden

## Erkenntnis

Deine Korrektur ist wichtig: **Szenen 2 und 5** sind schwarz, nicht 1 und 4. Die Forensik zeigt:

```text
Animations: [popIn, slideUp, bounce, popIn, bounce]
Scene 2 = slideUp → SCHWARZ
Scene 3 = bounce → SICHTBAR  
Scene 5 = bounce → SCHWARZ
```

**Gleiche Animation (bounce) = unterschiedliches Ergebnis.** Das beweist: es liegt NICHT an der Animation, NICHT am Background-Typ. Bisherige Fixes (r47-r52) haben alle am falschen Problem gearbeitet.

## Mögliche echte Ursachen

1. **Timing-Konflikt**: Die Summe der gerundeten Szenen-Frames (`ceil(duration * fps)`) übersteigt die Composition-`durationInFrames`. Szenen, die über das Ende der Composition hinausgehen, werden schwarz.

2. **Szene-spezifische Daten**: Etwas in den Szenen-Daten (Textlänge, spezielle Zeichen, Dauer) löst einen stillen Fehler im r42-Bundle aus.

3. **SceneTransition Fade-Out**: Jede Szene hat `transition.type: 'fade'`, was am Ende jeder Szene `opacity: 0` setzt. Zusammen mit der nächsten Szene `fadeIn` kann es ein schwarzes "Loch" geben.

## Plan: Zwei Maßnahmen

### 1. Alles auf Minimum setzen (in Edge Function)
- `animation: 'none'` für ALLE Szenen (kein Animation-Code-Path)
- `transition.type: 'none'` für ALLE Szenen (kein Fade in/out)
- `background.type: 'color'` mit einzelner Farbe (kein Gradient-Parsing nötig)
- `disableSceneFx: true`, `disableAnimatedText: true`, `disableMorphTransitions: true` — ALLES aus

### 2. Komplette Forensik speichern
In `content_config` das gesamte Szenen-Array mit allen Feldern speichern:
- Alle Szenen-Durations + berechnete Frames
- `totalSceneFrames` vs `compositionDurationInFrames` (erkennt Timing-Mismatch)
- `sceneTypes`, `sceneDurations`, `sceneStartTimes`

### Erwartete Ergebnisse
- **Wenn Fix funktioniert**: Problem lag in Transitions/Animations/Gradient-Rendering
- **Wenn IMMER NOCH schwarze Szenen**: Problem liegt definitiv in Timing/Sequencing — dann wissen wir genau wo

### Dateien
- `supabase/functions/auto-generate-universal-video/index.ts` — Szenen maximally vereinfachen + Forensik
- Deploy Edge Function

### Build-Tag
`r53-nuclear-diagnostic-2026-03-10`

