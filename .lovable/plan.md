

## Retry-Mechanismus für 429 Rate-Limit in generate-studio-image

### Problem
Die AI Gateway API gibt bei schnell aufeinanderfolgenden Bildgenerierungen einen 429 (Rate Limit) zurück. Aktuell wird dieser Fehler direkt an den Client weitergegeben.

### Lösung
In `supabase/functions/generate-studio-image/index.ts` den API-Aufruf (Zeile 130-141) in eine Retry-Schleife mit exponentiellem Backoff wrappen:

- **Max 3 Versuche** bei 429 oder 5xx Fehlern
- **Backoff**: 2s → 4s → 8s (exponentiell)
- Sofortiger Abbruch bei 402, 401 oder anderen Client-Fehlern
- Logging jedes Retry-Versuchs

### Umsetzung

**Datei: `supabase/functions/generate-studio-image/index.ts`**

Den Block ab Zeile 130 (`const response = await fetch(...)`) bis Zeile 161 ersetzen durch:

```typescript
let response: Response | null = null;
const MAX_RETRIES = 3;

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify({ model, messages, modalities: ['image', 'text'] }),
  });

  if (response.ok) break;

  // Nur bei 429/5xx retrien
  if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
    const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
    console.log(`[Studio] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms (status ${response.status})`);
    await new Promise(r => setTimeout(r, delay));
    continue;
  }

  // Nicht-retriebarer Fehler → sofort raus
  break;
}

// Danach bestehende Fehlerbehandlung (429, 402 etc.) für den Fall dass alle Retries fehlschlagen
```

### Ergebnis
- 429-Fehler werden automatisch bis zu 3× wiederholt, bevor der Nutzer einen Fehler sieht
- Kein Code-Änderung im Frontend nötig

