

# Plan: Von ~95% auf 97%+ Loft-Film Qualitat

## Kern-Problem identifiziert

Die Ursache fur die persistierenden menschlichen Figuren und Silhouetten in den AI-Hintergrunden liegt **im Script-Generator**, nicht im Bild-Generator. 

In `generate-universal-script/index.ts` (Zeilen 444-447) wird die KI explizit angewiesen:
- "KONKRETE Szenen mit Menschen/Produkten in realistischen Situationen"
- Schema: "[WER/WAS] + [TUT WAS] + [WO]" -- fordert menschliche Subjekte
- Beispiel zeigt "A marketing manager reviewing..."

Das erzeugt `visualDescription`-Texte wie "A person sitting at desk..." die der Bildgenerator priorisiert, egal wie stark die Negativ-Prompts sind. **Positiv-Prompts schlagen Negativ-Prompts immer.**

### Aktuelle Probleme im r58-Render:
1. **Szene 1 (Problem)**: Mensch-Silhouette am Schreibtisch im Hintergrund
2. **Szene 2 (Losung)**: Mehrere Menschen-Figuren, "#BFF" Text sichtbar
3. **Szene 3 (Feature)**: Blaue Mensch-Silhouette, Charts/Daten
4. **Szene 4 (Feature)**: Person am Schreibtisch im Hintergrund  
5. **Szene 5 (CTA)**: Hand/Finger sichtbar -- besser als vorher, aber nicht perfekt

## Umsetzung

### Schritt 1: Script-Generator anpassen (Wurzel des Problems)
**Datei:** `supabase/functions/generate-universal-script/index.ts`

Die Regeln 10-13 und das Beispiel in Zeile 461 mussen so geandert werden, dass sie **keine menschlichen Figuren** in der visualDescription anfordern, sondern stattdessen:
- Umgebungen, Objekte, Arbeitsplatze OHNE Menschen
- Schema andern zu: "[OBJEKT/SZENE] + [ZUSTAND/DETAIL] + [UMGEBUNG] + [BELEUCHTUNG]"
- Beispiel andern zu: "A modern desk with multiple monitors showing colorful interfaces, bright office with glass walls, warm natural light, shallow depth of field"
- Explizite Regel: "NIEMALS Menschen, Personen, Silhouetten, Hande, oder Korperteile in der visualDescription beschreiben. Die Szene soll die UMGEBUNG und OBJEKTE zeigen, Menschen werden als separate animierte Charaktere hinzugefugt."

### Schritt 2: Anti-Artefakt Prompting weiter verstarken
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`
- In der `antiTextSuffix` zusatzlich betonen: "Replace any human figures with empty space or furniture"
- Scene-spezifisch: Problem/Solution scenes sollen "empty workspace" oder "environment without people" fordern

**Datei:** `supabase/functions/generate-premium-visual/index.ts`
- `fullPrompt` Prapend erweitern: Vor dem eigentlichen Prompt eine Anweisung "Remove any human subjects from this scene, show only the environment and objects"

### Schritt 3: Plan.md aktualisieren

## Betroffene Dateien

| Datei | Anderung |
|-------|----------|
| `supabase/functions/generate-universal-script/index.ts` | visualDescription-Schema auf menschenfreie Szenen umstellen |
| `supabase/functions/auto-generate-universal-video/index.ts` | Anti-Personen Prompt verstarken |
| `supabase/functions/generate-premium-visual/index.ts` | Positiv-Prompt fur menschenfreie Szenen |

## Erwartetes Ergebnis
- AI-Hintergrunder zeigen nur Umgebungen, Objekte und Stimmungen -- keine Menschen
- SVG-Charaktere sind die EINZIGEN "Personen" im Bild -- kein visueller Konflikt mehr
- Keine Text/Zahlen-Artefakte
- **Geschatzter Stand: ~97%**

## Hinweis
Alle Anderungen sind Edge-Function-basiert und sofort nach Deploy aktiv. Kein Bundle-Redeploy notig.

