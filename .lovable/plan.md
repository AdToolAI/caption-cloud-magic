

# Plan: Von ~95% auf 97%+ Loft-Film Qualität — UMGESETZT ✅

## Kern-Problem identifiziert & behoben

Die Ursache für die persistierenden menschlichen Figuren lag im **Script-Generator**, der explizit Menschen in den `visualDescription`-Texten anforderte. Positiv-Prompts schlagen Negativ-Prompts immer.

## Durchgeführte Änderungen

### ✅ Schritt 1: Script-Generator — visualDescription-Schema umgestellt
- `generate-universal-script/index.ts`: Schema von `[WER/WAS] + [TUT WAS]` auf `[OBJEKT/SZENE] + [ZUSTAND/DETAIL] + [UMGEBUNG] + [BELEUCHTUNG]` geändert
- Explizite Regel: NIEMALS Menschen, Personen, Silhouetten, Hände, Finger oder Körperteile beschreiben
- Beispiel geändert auf "A modern desk with monitors... empty workspace"

### ✅ Schritt 2: Anti-Personen Prompting in Bild-Generator verstärkt
- `auto-generate-universal-video/index.ts`: antiTextSuffix erweitert um "replace human subjects with empty furniture/equipment/space"
- `generate-premium-visual/index.ts`: fullPrompt-Präpend erweitert um "Remove ALL human subjects"
- `generate-premium-visual/index.ts`: STYLE_PROMPTS von "stylized human figures" auf "empty workspaces/environments" umgestellt

## Geschätzter Stand: ~97%
