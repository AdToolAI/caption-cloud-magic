

# Plan: Sicherstellen, dass der gewählte Stil tatsächlich in der Bildgenerierung ankommt

## Analyse

Die Code-Kette sieht korrekt aus:
1. `FilmStyleSelector` → setzt `selectedVisualStyle` (z.B. `'comic'`)
2. `handleConsultationComplete` → überschreibt `result.visualStyle = selectedVisualStyle`
3. Edge Function → nutzt `briefing.visualStyle` in `ART STYLE: comic` Prompt
4. `generate-premium-visual` → nutzt `STYLE_PROMPTS['comic']` für Flux-Bildgenerierung

**Mögliche Ursachen, warum es trotzdem gleich aussieht:**

1. **Consultant überschreibt den Stil zurück**: Der Consultant extrahiert `visualStyle` als Freitext aus dem Chat (z.B. `'modern'`). Der Wizard überschreibt das zwar, aber vielleicht nur im `lastRecommendation`-Pfad — nicht im Fallback-Pfad (Zeile 293: `visualStyle: 'flat-design'`).

2. **Kein Log zur Verifizierung**: Aktuell wird `visualStyle` nirgends geloggt — weder im Wizard noch in der Edge Function. Wir können nicht beweisen, was tatsächlich ankam.

3. **Edge Function `validateEnum` Fallback**: In Zeile 1445 wird `style: validateEnum(briefing.visualStyle, VALID_STYLES, 'modern-3d')` gesetzt. Wenn `briefing.visualStyle` nicht exakt einem der `VALID_STYLES` entspricht, wird es auf `'modern-3d'` zurückgesetzt. Der Wert `'comic'` IST in `VALID_STYLES` — aber falls der Consultant z.B. `'Comic'` (Großbuchstabe) liefert und der Wizard-Override nicht greift, fällt es auf `'modern-3d'` zurück.

## Umsetzung

### 1. Logging in der Edge Function hinzufügen
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Nach Zeile 406 ein explizites Log ergänzen:
```
console.log(`[auto-generate-universal-video] visualStyle: ${actualBriefing.visualStyle}`);
```

### 2. Logging im Wizard hinzufügen
**Datei:** `src/components/universal-video-creator/UniversalVideoWizard.tsx`

In `handleConsultationComplete` nach dem Override loggen:
```
console.log('[Wizard] Final visualStyle for generation:', result.visualStyle, 'selectedVisualStyle:', selectedVisualStyle);
```

### 3. visualStyle in Progress-Daten speichern
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

In der `briefing_json` wird der Style bereits gespeichert. Zusätzlich im Progress-Update beim Bildgenerierungsschritt den tatsächlich verwendeten Style loggen.

### 4. Sicherheitshalber: Consultant-Fallback ebenfalls überschreiben
**Datei:** `src/components/universal-video-creator/UniversalVideoWizard.tsx`

Im `handleConsultationSkip` (Zeile 257-308) ebenfalls den `selectedVisualStyle` injizieren — aktuell wird dort `visualStyle: 'flat-design'` hardcoded, und der Override-Code greift nur in `handleConsultationComplete`, nicht in `handleConsultationSkip`.

### 5. Consultant Style-Extraktion auf enum-kompatiblen Wert mappen
**Datei:** `supabase/functions/universal-video-consultant/index.ts`

Die Zeile `const visualStyle = styleResponse || 'modern';` setzt einen Freitext-Wert. Wenn der Wizard-Override greift, ist das kein Problem. Aber als Absicherung: den extrahierten Wert gegen die gültigen Styles mappen.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/auto-generate-universal-video/index.ts` | `visualStyle` explizit loggen |
| `src/components/universal-video-creator/UniversalVideoWizard.tsx` | Override-Logging + `handleConsultationSkip` Fix |

## Erwartetes Ergebnis
- Beim nächsten Testrender sehen wir in den Logs exakt, welcher `visualStyle` ankam
- Falls der Override nicht greift, finden wir sofort die Stelle
- `handleConsultationSkip` nutzt ebenfalls den gewählten Stil

