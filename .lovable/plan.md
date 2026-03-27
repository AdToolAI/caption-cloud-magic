

## Fix: "In Mediathek speichern" Fehler bei abgelaufenen URLs

### Problem
Die zwei Videos wurden **vor** dem Auto-Save-Webhook generiert. Ihre `video_url` zeigt auf temporäre `replicate.delivery`-URLs, die nach ~1 Stunde ablaufen. Das Edge Function gibt korrekt 410 zurück, aber:

1. Der Client-Code erkennt den Fehler nicht richtig — `supabase.functions.invoke()` wrappet non-2xx als generischen Error, die eigentliche Fehlermeldung ("temporäre URL abgelaufen") geht verloren
2. Für diese alten Videos gibt es **keine Möglichkeit mehr**, sie zu speichern — die Quelle ist weg

### Lösung

**1. `VideoGenerationHistory.tsx` — bessere Fehlerbehandlung + klare UI**

- Bei `handleSaveToLibrary`: Die Edge-Function-Antwort kommt bei non-2xx über `response.error`, aber die eigentliche JSON-Body-Nachricht muss aus `response.data` gelesen werden (Supabase SDK Verhalten)
- Für abgelaufene Videos: Statt den generischen "Edge Function returned a non-2xx status code" einen klaren Hinweis anzeigen: "Video nicht mehr verfügbar — bitte neu generieren"
- Optional: Button deaktivieren oder ausblenden für Videos, bei denen das Speichern fehlgeschlagen ist (URL abgelaufen)

**2. Fehler-Parsing im Client verbessern**

```tsx
// Aktuell: error.message = "Edge Function returned a non-2xx status code"
// Besser: Den Body parsen, der die echte Fehlermeldung enthält
const response = await supabase.functions.invoke('save-ai-video-to-library', {
  body: { generation_id: generationId },
});

// supabase SDK setzt response.data auch bei Fehlern
if (response.error || (response.data && !response.data.ok)) {
  const errorMsg = response.data?.error || response.error?.message || 'Unbekannter Fehler';
  throw new Error(errorMsg);
}
```

### Änderungen

**Datei: `src/components/ai-video/VideoGenerationHistory.tsx`**
- `handleSaveToLibrary`: Error-Parsing fixen — `response.data?.error` auslesen statt nur `response.error.message`
- Bei 410/abgelaufener URL: Sonner-Toast mit "Bitte Video neu generieren" + Retry-Button

### Erwartetes Ergebnis
- Klare Fehlermeldung "Video nicht mehr verfügbar" statt "non-2xx status code"
- User versteht, dass das Video neu generiert werden muss
- Zukünftige Videos werden via Webhook automatisch gespeichert (bereits implementiert)

