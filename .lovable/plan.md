


# Plan: Von ~95% auf 97%+ Loft-Film Qualität — UMGESETZT ✅

## Kern-Problem identifiziert & behoben

Die Ursache für die persistierenden menschlichen Figuren lag im **Script-Generator**, der explizit Menschen in den `visualDescription`-Texten anforderte. Positiv-Prompts schlagen Negativ-Prompts immer.

## Durchgeführte Änderungen

### ✅ Schritt 1: Script-Generator — visualDescription-Schema umgestellt
- `generate-universal-script/index.ts`: Schema von `[WER/WAS] + [TUT WAS]` auf `[OBJEKT/SZENE] + [ZUSTAND/DETAIL] + [UMGEBUNG] + [BELEUCHTUNG]` geändert
- Explizite Regel: NIEMALS Menschen, Personen, Silhouetten, Hände, Finger oder Körperteile beschreiben
- Beispiel geändert auf "A tidy desk with a closed laptop, potted plants, a warm desk lamp"

### ✅ Schritt 2: Script-Generator — Text-tragende Objekte verboten (Regel 15)
- NIEMALS Dashboards, Kalender, Charts, Diagramme, Bildschirme mit Daten, Monitore mit UI, Analytics-Interfaces, Spreadsheets, Whiteboards mit Notizen beschreiben
- Stattdessen PHYSISCHE Umgebung: Möbel, Pflanzen, Lampen, Büromaterial, Architektur, Beleuchtung

### ✅ Schritt 3: Anti-Personen Prompting in Bild-Generator verstärkt
- `auto-generate-universal-video/index.ts`: antiTextSuffix erweitert um "replace human subjects with empty furniture/equipment/space"
- `generate-premium-visual/index.ts`: fullPrompt-Präpend erweitert um "Remove ALL human subjects"
- `generate-premium-visual/index.ts`: STYLE_PROMPTS von "stylized human figures" auf "empty workspaces/environments" umgestellt

### ✅ Schritt 4: Keyword-Sanitizer als Sicherheitsnetz
- `auto-generate-universal-video/index.ts`: Automatische Ersetzung von text-tragenden Keywords vor der Bildgenerierung
- "dashboard" → "desk setup", "calendar" → "organized workspace", "analytics/chart/graph" → "clean workspace"
- "monitor showing" → "monitor on a desk with", "spreadsheet" → "office supplies"

## Geschätzter Stand: ~97%
