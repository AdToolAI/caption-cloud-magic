

# Plan: Von ~88% auf 90%+ Loft-Film Qualität

## Identifizierte Probleme (aus Screenshots)

1. **Text wird abgeschnitten in Feature-Szenen** — Das Panel ist rechts ausgerichtet (`alignItems: flex-end`), aber der Charakter steht ebenfalls rechts. Titel wie "Messbarer F..." werden vom Charakter verdeckt.

2. **Inkonsistenter Bildstil zwischen Szenen** — Feature-Szene zeigt Illustration/Cartoon-Stil, während andere Szenen fotorealistisch wirken. Ursache: Die `sceneStyleHints` in der Edge Function überschreiben den gewählten `visualStyle` je nach Szenentyp unterschiedlich stark.

3. **SVG-Charaktere noch nicht aktualisiert** — Die Phase-13-Verbesserungen (detaillierte Kleidung, Ken-Burns, Layout-Variation) sind im Code, aber das Remotion Lambda Bundle wurde noch nicht redeployed.

## Umsetzung

### Schritt 1: Feature-Szene — Charakter-Position vs. Text-Position entflechten
Das Feature-Panel ist rechts, der Charakter ist auch rechts — Kollision. Lösung: Feature-Szenen bekommen den Charakter **links** statt rechts, damit Text und Charakter sich nicht überlappen.

**Datei:** `src/remotion/templates/UniversalCreatorVideo.tsx` — `getContextBasedPosition()` (Zeile 2801)
- Änderung: `feature` gibt `'left'` statt `'right'` zurück
- Feature-Text-Panel `maxWidth` von `75%` auf `65%` reduzieren für zusätzlichen Puffer

### Schritt 2: Visuellen Stil-Konsistenz erzwingen
Der `sceneStyleHints`-Block in der Edge Function gibt szenenspezifische Stimmungen vor, aber die überschreiben teilweise den gewählten `visualStyle`. Lösung: Den `visualStyle` als dominanten Stil-Anker im Prompt verstärken und `sceneStyleHints` abschwächen, damit sie nur atmosphärische Ergänzungen sind.

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts` (Zeile 814-816)
- Den Prompt umstrukturieren: `visualStyle` wird als erstes, starkes Signal gesetzt
- `sceneStyleHints` werden als "subtle mood hint" nachgestellt
- Suffix hinzufügen: `"IMPORTANT: Maintain exact same visual art style across all scenes."`

### Schritt 3: Feature-Panel maxWidth anpassen
Das Feature-Panel hat `maxWidth: 75%`, was bei langen Titeln nicht reicht wenn der Charakter rechts steht. Nach Schritt 1 (Charakter links) kann das Panel auf `70%` bleiben, aber wir stellen sicher, dass `textOverflow: 'ellipsis'` nicht den Titel abschneidet, sondern der Titel komplett passt.

**Datei:** `src/remotion/templates/UniversalCreatorVideo.tsx` — `getGlassStyle()` Feature-Case (Zeile 2215-2227)

### Schritt 4: Bundle-Redeploy Hinweis
Nach den Code-Änderungen muss das Remotion Lambda Bundle neu deployed werden (r56), damit Ken-Burns, Layout-Variation und die verbesserten SVG-Charaktere beim nächsten Render aktiv sind.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/remotion/templates/UniversalCreatorVideo.tsx` | Feature: Charakter links, Panel-Width anpassen |
| `supabase/functions/auto-generate-universal-video/index.ts` | Stil-Konsistenz im Prompt erzwingen |

## Erwartetes Ergebnis
- Kein abgeschnittener Text mehr in Feature-Szenen
- Einheitlicher visueller Stil über alle Szenen hinweg
- Nach Bundle-Redeploy: Ken-Burns, detaillierte Charaktere, Layout-Variation aktiv
- **Geschätzter Stand: ~92-93%**

