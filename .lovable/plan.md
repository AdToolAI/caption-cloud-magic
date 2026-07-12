# Fix — Kein Gibberish-Text mehr in AI-Video-Studio-Clips

## Problem
Im **AI Video Studio** (`ToolkitGenerator`) rendern die Video-Modelle (Hailuo, Kling, Veo, Sora, Seedance, HappyHorse, …) manchmal Text/Schilder/Overlays im Bild — meist unleserliches Kauderwelsch. Das wirkt unsauber. Im **Motion Studio** tritt das kaum auf und bleibt unangetastet.

## Ursache
Der finale Prompt (`ToolkitGenerator.tsx` Z. 264–280) enthält keinen expliziten „no text / no writing / no signage"-Guard. Ohne diese Direktive halluzinieren die Modelle spontan Beschriftungen (Plakate, Bauchbinden, T-Shirt-Aufdrucke, Straßenschilder).

## Änderung — punktuell und isoliert auf AI Video Studio

**1 Datei:** `src/components/ai-video/ToolkitGenerator.tsx`

Direkt vor der `body`-Konstruktion (~Z. 280) einen `noTextSuffix` an den zusammengesetzten Prompt hängen:

```
No written text, no letters, no signage, no captions, no logos, no on-screen typography, no readable characters of any language. Any incidental text in the scene must remain out of focus and illegible.
```

- Wird **nur** im AI-Video-Studio-Pfad angehängt (in `ToolkitGenerator.tsx`).
- Landet im `finalPrompt`, der an alle Provider (Hailuo / Kling / Veo / Sora / Seedance / …) geht — Modell-agnostisch, keine Registry-Änderung nötig.
- Idempotent: wird an das bereits mit `\n\n` gejointe Prompt-Ende angehängt.

## Ausdrücklich NICHT geändert
- `compose-video-clips`, `compose-scene-anchor`, `compose-dialog-segments` — Motion-Studio-Pipeline bleibt exakt wie sie ist.
- Keine Änderung an `VideoPromptOptimizer`, Cast/World-Suffix-Buildern, Shot-Director.
- Keine Registry-, DB- oder Server-Änderung.

## Verifikation
- Neuer AI-Video-Studio-Clip mit einem Prompt, der bisher zuverlässig Kauderwelschtext produziert hat (z. B. „Gründer sitzt vor Laptop" → oft T-Shirt- oder Bildschirm-Text). Erwartung: sauberes Bild ohne Schrift.
- Motion-Studio-Rendering unverändert (Regressions-Check per bestehendem Storyboard).
