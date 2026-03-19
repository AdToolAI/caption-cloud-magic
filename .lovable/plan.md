

# Phase 9c+: Anti-Gibberish Numbers-Only + Interview Data Fixes + Brand Visibility

## Probleme (aus Screenshots)

1. **Gibberish-Text in Bildern**: "Content-Ergreten", "Erchoiff", "Jetzt kreisiner testen!" — die Anti-Text-Anweisungen reichen nicht, weil das Modell zwischen "kein Text" und "nur Zahlen erlaubt" nicht unterscheidet
2. **Interview-Antworten verschieben sich**: `extractRecommendation()` nutzt `userResponses[0..3]` index-basiert, aber AI-System-Messages (Welcome, Retries) verschieben die Indizes
3. **Website-URL fehlt am Ende**: `websiteUrl` wird nie aus dem Interview extrahiert und nicht ins Briefing aufgenommen — `brandUrl` bleibt leer
4. **"AdTool AI" nicht sichtbar**: `companyName` und `productName` werden im Recommendation-Objekt nicht gesetzt — nur `productSummary` existiert

---

## Aenderung 1: Prompt-Haertung — nur Zahlen erlauben

**Dateien:** `generate-premium-visual/index.ts`, `auto-generate-universal-video/index.ts`

Aktuelles Anti-Text-Prefix sagt "Zero text, zero numbers" — aber Zahlen auf Dashboards/Graphen sind erwuenscht und sehen professionell aus. Das Problem ist, dass Flux nicht zwischen "keine Buchstaben" und "keine Zahlen" unterscheiden kann, wenn beides verboten ist.

**Neuer Ansatz:**
```
STRICT RULE: This image must contain ZERO letters, ZERO words, ZERO writing. 
Numbers and digits on charts/graphs ARE allowed. 
All text labels, titles, headings, button text, and UI copy must be replaced 
with abstract colored shapes or blank areas. Never generate readable or 
unreadable words in any language.
```

Dies erlaubt saubere Zahlen auf Dashboards, verbietet aber jeglichen Buchstaben-Text.

---

## Aenderung 2: Interview-Daten korrekt extrahieren

**Datei:** `supabase/functions/universal-video-consultant/index.ts`

Problem: `extractRecommendation()` nutzt:
- `userResponses[0]` = "Phase 1 Zweck" — ABER die Welcome-Message des Assistenten hat keinen User-Response-Gegenpart, wodurch alle Indizes um 1 verschoben sind
- `findResponse()` matched AI-Message-Index zu User-Response-Index, aber die Arrays sind nicht 1:1 aligned weil die erste AI-Message (Welcome) keinen User-Response hat

**Fix:** Die `findResponse()`-Funktion so anpassen, dass sie AI-Messages zu den **darauffolgenden** User-Responses matched (da der User auf die AI-Frage antwortet). Ausserdem explizit `companyName`, `productName` und `websiteUrl` extrahieren:

```typescript
// Fix: AI fragt in Message i, User antwortet in Message i (nach Welcome-Offset)
const findResponse = (keywords: string[]): string => {
  for (let i = 0; i < aiMessages.length; i++) {
    const aiMsg = (aiMessages[i] || '').toLowerCase();
    if (keywords.some(k => aiMsg.includes(k))) {
      // User antwortet auf AI-Frage i mit userResponses[i] (gleicher Index, weil Welcome keine Response hat)
      return userResponses[i] || '';
    }
  }
  return '';
};
```

Neue Felder im Return-Objekt:
```typescript
companyName: findResponse(['unternehmen', 'firma', 'marke', 'brand', 'company']),
productName: findResponse(['produkt', 'service', 'tool', 'angebot', 'dienstleistung']),
websiteUrl: extractUrl(allText), // Regex fuer URLs aus allen Antworten
```

---

## Aenderung 3: websiteUrl-Feld zum Type + Consultant + Briefing hinzufuegen

**Dateien:**
- `src/types/universal-video-creator.ts` — `websiteUrl?: string` zu `UniversalConsultationResult` hinzufuegen
- `src/components/universal-video-creator/UniversalVideoConsultant.tsx` — Fallback-Result mit `websiteUrl: ''`
- `supabase/functions/auto-generate-universal-video/index.ts` — `brandUrl` aus `briefing.websiteUrl` befuellen (bereits teilweise vorhanden)

---

## Aenderung 4: AdTool AI / Markenname sichtbar machen

**Datei:** `supabase/functions/universal-video-consultant/index.ts`

Das Recommendation-Objekt hat `productSummary` aber keine separaten `companyName`/`productName` Felder. Die Wizard-Fallback-Logik setzt diese dann auf leere Strings.

Fix: `extractRecommendation()` muss `companyName` und `productName` aus dem Interview extrahieren und zurueckgeben. Die `findResponse`-Funktion sucht nach Schluesselbegriffen wie "unternehmen", "produkt", "name" in den AI-Fragen.

---

## Aenderung 5: CTA-Szene mit Website-URL

**Datei:** `supabase/functions/generate-universal-script/index.ts`

Die `websiteUrl` muss an den Script-Generator weitergegeben werden, damit die CTA-Szene den Link "www.useadtool.ai" im Text/Narration enthaelt:
```
**Website/URL:** ${briefing.websiteUrl || '-'}
```

---

## Zusammenfassung

| Datei | Aenderung |
|-------|----------|
| `generate-premium-visual/index.ts` | Anti-Text-Prefix: Buchstaben verboten, Zahlen erlaubt |
| `auto-generate-universal-video/index.ts` | Gleicher Prompt-Fix |
| `universal-video-consultant/index.ts` | `findResponse` Offset-Fix + `companyName`/`productName`/`websiteUrl` extrahieren |
| `src/types/universal-video-creator.ts` | `websiteUrl?: string` Feld |
| `src/components/.../UniversalVideoConsultant.tsx` | `websiteUrl` in Fallback-Result |
| `generate-universal-script/index.ts` | Website-URL im Prompt |

Kein S3-Redeploy noetig — nur Edge Functions + Frontend.

