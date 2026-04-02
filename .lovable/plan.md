

## Feature: Originalton-Regler in Schritt 2 (KI-Analyse)

### Was

Ein einfacher Toggle/Schalter direkt über oder unter dem Video-Preview in Schritt 2, mit dem man den Originalton des Videos ein- und ausschalten kann.

### Umsetzung

**`src/components/directors-cut/steps/SceneAnalysisStep.tsx`**

1. Einen `isMuted`-State hinzufügen (`useState(false)`)
2. Das native `<video>`-Element (Zeile 657) mit dem `muted`-Attribut verbinden: `muted={isMuted}`
3. Unter dem Video-Preview (nach Zeile 679) einen kleinen Kontrollbereich einfügen:
   - Ein Volume-Icon (🔊/🔇) + Switch-Toggle mit Label "Originalton"
   - Optional: einen Lautstärke-Slider (0–100%) für feinere Kontrolle

```text
┌─────────────────────────────┐
│        Video Preview        │
│                             │
└─────────────────────────────┘
  🔊 Originalton  [━━━━━━●━━]  72%
```

### Betroffene Datei

- `src/components/directors-cut/steps/SceneAnalysisStep.tsx` — State + UI-Elemente hinzufügen

