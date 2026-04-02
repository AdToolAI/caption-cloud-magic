

## Fix: Untertitel noch teilweise sichtbar — Crop-Bereich und Slider erweitern

### Analyse

Der Hard-Crop funktioniert grundsätzlich (Untertitel sind "fast verschwunden"), aber:

1. **Crop-Bereich zu klein**: Das "Mittel"-Preset schneidet nur 12% ab. Manche Untertitel (besonders mit Schatten/Glow) ragen darüber hinaus.
2. **Kein `bottomBandPercent`-Slider**: Der User kann Zoom und Offset manuell anpassen, aber nicht direkt den Crop-Bereich vergrößern. Diese drei Werte müssen synchron sein.
3. **Presets zu konservativ**: "Stark" = 18% reicht bei großen/stilisierten Untertiteln nicht.

### Lösung

**1. `bottomBandPercent`-Slider hinzufügen** (`CapCutSidebar.tsx`)
- Neuer Slider "Zuschnittbereich" (4–30%) direkt unter den Presets
- Beim Verschieben werden Zoom und Offset automatisch berechnet (wie in der Edge Function):
  - `zoom = 1 / (1 - bottomBandPercent / 100)`
  - `offsetY = -(bottomBandPercent / 2)`
- Das ist der **einzige Slider, den der User wirklich braucht** — die anderen (Zoom, Offset) werden daraus abgeleitet und können optional als "Erweitert" darunter bleiben.

**2. Presets anpassen** (`directors-cut-draft.ts`)
- `light`: 8% (statt 6%)
- `medium`: 14% (statt 12%)  
- `strong`: 22% (statt 18%)
- Alle mit automatisch berechneten Zoom/Offset-Werten

**3. Automatische Erkennung: höheren Safety-Margin** (`director-cut-detect-subtitle-band/index.ts`)
- Safety-Margin von 2% auf 4% erhöhen
- Minimum `bottomBandPercent` auf 10% setzen (statt 4%)

### Betroffene Dateien

1. `src/components/directors-cut/studio/CapCutSidebar.tsx` — `bottomBandPercent`-Slider als Hauptregler
2. `src/lib/directors-cut-draft.ts` — Preset-Werte erhöhen
3. `supabase/functions/director-cut-detect-subtitle-band/index.ts` — Safety-Margin erhöhen

