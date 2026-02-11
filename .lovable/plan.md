
# Fix: Falsches Format (YouTube statt Reels) + Completion-Erkennung

## Problem 1: Format wird ignoriert

Die Consultation-AI fragt in Phase 19 nach dem Format. Der User waehlt z.B. "9:16 fuer TikTok/Reels". Die `extractRecommendation` Funktion speichert das als:

```text
format: "9:16 für TikTok/Reels"   // Roher User-Text
```

Aber `auto-generate-universal-video` erwartet:

```text
briefing.aspectRatio: "9:16"   // Cleaner Wert
```

Das Problem: `extractRecommendation` setzt `format`, nicht `aspectRatio`. Wenn das Ergebnis an `onConsultationComplete` weitergegeben wird, gibt es kein `aspectRatio`-Feld, und der Backend-Fallback greift: `briefing.aspectRatio || '16:9'` -- immer YouTube-Format.

## Problem 2: UI zeigt immer 3 Format-Karten

Die `STEPS`-Liste in `UniversalAutoGenerationProgress.tsx` hat 3 Render-Schritte hardcoded:

```text
{ id: 'render-16-9', label: '16:9', description: 'YouTube / Website' },
{ id: 'render-9-16', label: '9:16', description: 'TikTok / Reels' },
{ id: 'render-1-1', label: '1:1', description: 'Social Feed' },
```

Egal was der User waehlt, alle drei werden als Schritte angezeigt. Es wird aber nur EIN Format gerendert.

## Problem 3: Progress bleibt bei ~92% haengen

Nach dem asynchronen Lambda-Aufruf wird `universal_video_progress` nie auf `completed` gesetzt. Der Webhook aktualisiert nur `video_renders`, kennt aber die `progressId` nicht. Das Client-Side S3-Polling erkennt zwar Completion (wenn `out.mp4` existiert), aber die UX ist verwirrend weil der Fortschritt zwischen 90-99% stehen bleibt bis das Polling greift.

---

## Loesung

### Aenderung 1: Format korrekt extrahieren

**Datei:** `supabase/functions/universal-video-consultant/index.ts`

In `extractRecommendation` (Zeile 535-551):
- Den rohen User-Text parsen und den Aspect-Ratio-Wert extrahieren (z.B. "9:16 fuer TikTok/Reels" wird zu "9:16")
- Sowohl `format` als auch `aspectRatio` setzen
- `outputFormats` als Array setzen

```text
// Vorher:
format: userResponses[18] || '16:9',

// Nachher:
const rawFormat = userResponses[18] || '16:9';
const aspectRatio = rawFormat.includes('9:16') ? '9:16' 
  : rawFormat.includes('1:1') ? '1:1'
  : rawFormat.includes('4:5') ? '4:5'
  : '16:9';

return {
  ...bestehendeFelder,
  format: aspectRatio,
  aspectRatio: aspectRatio,
  outputFormats: [aspectRatio],
};
```

### Aenderung 2: UI auf gewaehltes Format beschraenken

**Datei:** `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

Statt 3 hardcoded Render-Schritte wird nur EIN Render-Schritt angezeigt, basierend auf dem gewaehlten `aspectRatio` aus dem `consultationResult`:

```text
// Vorher: 3 feste Render-Steps
{ id: 'render-16-9', label: '16:9', ... },
{ id: 'render-9-16', label: '9:16', ... },
{ id: 'render-1-1', label: '1:1', ... },

// Nachher: 1 dynamischer Render-Step
{ id: 'rendering', label: selectedFormat, description: formatDescription }
```

Die STEPS-Liste wird dynamisch gebaut basierend auf `consultationResult.aspectRatio`. Das reduziert die Steps von 8 auf 6 und zeigt nur das tatsaechlich gerenderte Format.

### Aenderung 3: Webhook soll universal_video_progress aktualisieren

**Datei:** `supabase/functions/remotion-webhook/index.ts`

Wenn der Webhook eine `pending-` Render-ID erkennt, soll er pruefen ob es einen `universal_video_progress`-Eintrag mit dieser renderId in `result_data` gibt, und ihn auf `completed` setzen:

```text
// Nach dem Update von video_renders:
// Suche universal_video_progress mit passender renderId
const { data: progressEntries } = await supabaseAdmin
  .from('universal_video_progress')
  .select('id, result_data')
  .eq('status', 'rendering')
  .limit(10);

for (const entry of progressEntries) {
  if (entry.result_data?.renderId === pendingRenderId) {
    await supabaseAdmin.from('universal_video_progress').update({
      status: 'completed',
      progress_percent: 100,
      current_step: 'completed',
      result_data: { ...entry.result_data, outputUrl: outputFile },
    }).eq('id', entry.id);
    break;
  }
}
```

---

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `universal-video-consultant/index.ts` | `extractRecommendation`: aspectRatio korrekt aus User-Text parsen |
| `UniversalAutoGenerationProgress.tsx` | Nur das gewaehlte Format als Render-Step anzeigen (statt alle 3) |
| `remotion-webhook/index.ts` | `universal_video_progress` auf completed setzen bei Render-Completion |

## Erwartetes Ergebnis

- Wenn der User "9:16 fuer TikTok/Reels" waehlt, wird tatsaechlich im 9:16-Format gerendert
- Die UI zeigt nur einen Render-Step mit dem korrekten Format (z.B. "9:16 - TikTok / Reels")
- Nach Lambda-Completion aktualisiert der Webhook den Progress auf 100%, sodass die UI zuverlaessig zum fertigen Video navigiert
