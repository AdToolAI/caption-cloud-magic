

# Plan: Von ~93% auf 95%+ Loft-Film Qualitat

## Verbleibende Probleme

### 1. Zahlen-Artefakte immer noch sichtbar
"139" und "21.55" erscheinen trotz der Prompt-Anderungen. Das `antiTextSuffix` muss noch aggressiver formuliert werden — die aktuelle Version wird vom Modell teilweise ignoriert, weil die Szenen-Beschreibungen (z.B. "dashboard", "analytics") Zahlen implizieren.

### 2. CTA enthalt AI-generierte Person als Silhouette
Der AI-Hintergrund der CTA-Szene zeigt einen realistischen Geschaftsmann, der mit dem SVG-Charakter kollidiert. Die CTA-Prompt-Anweisung muss explizit Personen/Silhouetten verbieten.

### 3. CTA-Text wird abgeschnitten
"Testphase!" faded am rechten Rand aus — das Glass-Panel muss breiteren Text besser handhaben.

## Umsetzung

### Schritt 1: Anti-Zahlen und Anti-Personen Prompt verstarken
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`
- `antiTextSuffix` erweitern: Auch "dashboard numbers", "analytics data", "statistics", "charts with values" explizit verbieten
- CTA `sceneStyleHint` andern zu: "clean minimal background, soft gradient or abstract bokeh, NO people, NO silhouettes, NO human figures, calm and focused"
- Fur ALLE Szenen hinzufugen: "Do NOT include any human figures or silhouettes in the background image"

**Datei:** `supabase/functions/generate-premium-visual/index.ts`
- `NEGATIVE_PROMPT` erweitern um: "human silhouette, person, people, man, woman, figure"

### Schritt 2: CTA Glass-Panel Text-Overflow fixen
**Datei:** `src/remotion/templates/UniversalCreatorVideo.tsx`
- CTA-Szene Content-Text `maxWidth` erhohen oder `whiteSpace: normal` + `wordBreak: break-word` erzwingen, damit kein Text abgeschnitten wird

### Schritt 3: Plan.md aktualisieren

## Betroffene Dateien

| Datei | Anderung |
|-------|----------|
| `supabase/functions/auto-generate-universal-video/index.ts` | Aggressiveres Anti-Zahlen + Anti-Personen Prompting |
| `supabase/functions/generate-premium-visual/index.ts` | NEGATIVE_PROMPT um Personen/Silhouetten erweitern |
| `src/remotion/templates/UniversalCreatorVideo.tsx` | CTA Text-Overflow Fix |

## Hinweis
Die Prompt-Anderungen sind sofort nach Edge-Function-Deploy aktiv. Der CTA Text-Fix erfordert ein erneutes Bundle-Deploy (r58).

## Erwartetes Ergebnis
- Keine Zahlen/Text-Artefakte in Hintergrundbildern
- Keine AI-generierten Personen-Silhouetten in CTA
- CTA-Text vollstandig sichtbar
- **Geschatzter Stand: ~95%**

