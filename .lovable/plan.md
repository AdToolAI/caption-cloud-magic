

# Phase 8c: Video-Dauer-Fix + Quick-Reply-Bug

## Problem 1: Video nur 20 Sekunden statt 60
**Ursache:** Die `extractRecommendation` in `universal-video-consultant/index.ts` gibt das Feld `duration: 60` zurueck. Der Script-Generator (`generate-universal-script/index.ts`) erwartet aber `briefing.videoDuration`. Da `videoDuration` undefined ist, wird `Math.floor(undefined / scenesCount)` = `NaN` und die AI generiert kurze Default-Szenen (~4s pro Szene = ~20s total).

**Fix:** Zwei Stellen absichern:
1. **`universal-video-consultant/index.ts`** (Zeile 639): Zusaetzlich `videoDuration: duration` im Return-Objekt von `extractRecommendation` setzen
2. **`generate-universal-script/index.ts`** (Zeile 355): Fallback hinzufuegen: `briefing.videoDuration || briefing.duration || 60`

## Problem 2: Quick Replies verschieben sich bei Tippfehler
**Ursache:** Quick-Reply-Buttons werden auf ALLEN vergangenen Assistant-Nachrichten angezeigt, nicht nur auf der letzten. Wenn der User eine Antwort tippt, bleiben die alten Buttons sichtbar und erzeugen visuelles Rauschen.

**Fix:** In `UniversalVideoConsultant.tsx` (Zeile 476): Quick Replies nur auf der **letzten** Assistant-Nachricht anzeigen:
```typescript
const isLastAssistantMessage = index === messages.map((m, i) => 
  m.role === 'assistant' ? i : -1).filter(i => i >= 0).pop();
```

## Dateien

| Datei | Aenderung |
|-------|----------|
| `universal-video-consultant/index.ts` | `videoDuration: duration` im Return-Objekt |
| `generate-universal-script/index.ts` | Fallback `videoDuration \|\| duration \|\| 60` |
| `UniversalVideoConsultant.tsx` | Quick Replies nur auf letzter Nachricht |

Kein S3-Redeploy noetig -- nur Edge Function Deployment + Frontend-Aenderung.

