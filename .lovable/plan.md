

# Fix: wall_clock Timeout bei invoke-remotion-render Aufruf

## Problem

Die Logs zeigen klar: `auto-generate-universal-video` laeuft bereits 2,5 Minuten, wenn sie `invoke-remotion-render` aufruft. Dann wird sie nach ~3 Minuten 20 Sekunden vom Deno-Runtime gekillt (`early_drop`), BEVOR die Antwort zurueckkommt. Das verursacht "Unexpected end of JSON input".

`invoke-remotion-render` selbst laeuft erfolgreich durch (shut down um 17:01:32), aber der Aufrufer ist schon tot.

## Loesung: Fire-and-Forget

`invoke-remotion-render` aktualisiert bereits selbststaendig alle DB-Eintraege (video_renders, universal_video_progress). Die Hauptfunktion braucht die Antwort gar nicht. Statt `await fetch(...)` einfach den Request abfeuern, Progress auf "rendering" setzen, und sofort returnen.

### Aenderung: `supabase/functions/auto-generate-universal-video/index.ts`

Zeilen 566-619 ersetzen:

Vorher:
```typescript
try {
  const renderResponse = await fetch(...);
  const renderResult = await renderResponse.json(); // <- hier stirbt die Funktion
  // ... error handling, progress update
} catch (fetchError) {
  // ... refund, fail
}
```

Nachher:
```typescript
// Fire-and-forget: invoke-remotion-render handles all DB updates itself
fetch(`${supabaseUrl}/functions/v1/invoke-remotion-render`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${supabaseServiceKey}`,
  },
  body: JSON.stringify({ lambdaPayload, pendingRenderId, userId, progressId }),
}).catch(err => console.error('Fire-and-forget fetch error (non-critical):', err));

// Progress update - invoke-remotion-render will update to 90% when Lambda responds
await updateProgress(supabase, progressId, 'rendering', 88, '🎬 Video-Rendering gestartet...');
```

Die Fehlerbehandlung (Refund, DB-Status "failed") wird bereits vollstaendig von `invoke-remotion-render` uebernommen (Zeilen 89-118 dort). Kein Datenverlust.

### Warum das funktioniert

1. `invoke-remotion-render` hat ein frisches wall_clock-Budget und laeuft unabhaengig
2. Bei Erfolg: setzt progress auf 90%, speichert renderId in DB
3. Bei Fehler: setzt progress auf "failed", speichert Fehlermeldung
4. Die Hauptfunktion muss nichts davon wissen und kann sofort beenden

### Dateien die geaendert werden

1. **EDIT**: `supabase/functions/auto-generate-universal-video/index.ts` -- await entfernen, fire-and-forget Pattern

