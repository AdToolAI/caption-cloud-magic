

# Fix: Fire-and-Forget fetch wird nie ausgefuehrt

## Problem

Die Logs beweisen es eindeutig: `invoke-remotion-render` wurde fuer `7vxggtgl33` **nie aufgerufen**. Die DB zeigt `lambda_render_id: null` und es gibt null Logs fuer diese Render-ID.

### Warum?

Das "fire-and-forget" `fetch()` ohne `await` funktioniert nicht in Deno Edge Functions. Wenn die Funktion nach dem `fetch()`-Aufruf sofort `return` macht, wird der Deno-Prozess heruntergefahren **bevor der HTTP-Request ueberhaupt gesendet wird**. Die Promise wird einfach verworfen.

### Loesung

Die Funktion hat bereits `EdgeRuntime.waitUntil()` deklariert (Zeile 28-30). Dieses API sagt dem Deno-Runtime: "Halte den Prozess am Leben, bis diese Promise fertig ist, auch nachdem die HTTP-Response schon gesendet wurde."

Wir muessen den `fetch()`-Call in `EdgeRuntime.waitUntil()` wrappen. So kann die Funktion sofort ihre Response senden, aber der Runtime bleibt aktiv bis der fetch zu `invoke-remotion-render` abgeschlossen ist.

## Aenderung

**Datei**: `supabase/functions/auto-generate-universal-video/index.ts`

**Zeilen 566-579** aendern von:

```typescript
// Fire-and-forget: invoke-remotion-render handles all DB updates itself
fetch(`${supabaseUrl}/functions/v1/invoke-remotion-render`, {
  ...
}).catch(err => console.error('Fire-and-forget fetch error (non-critical):', err));
```

**Zu:**

```typescript
// Use EdgeRuntime.waitUntil to keep runtime alive until fetch completes
const renderPromise = fetch(`${supabaseUrl}/functions/v1/invoke-remotion-render`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${supabaseServiceKey}`,
  },
  body: JSON.stringify({
    lambdaPayload,
    pendingRenderId,
    userId,
    progressId,
  }),
}).then(res => {
  console.log(`invoke-remotion-render response status: ${res.status}`);
}).catch(err => {
  console.error('invoke-remotion-render fetch error:', err);
});

EdgeRuntime.waitUntil(renderPromise);
```

`EdgeRuntime.waitUntil()` stellt sicher, dass der Deno-Prozess den fetch-Request tatsaechlich absendet und die Verbindung nicht vorzeitig abbricht, waehrend die Funktion bereits ihre Response an den Client zurueckgegeben hat.

## Zusammenfassung

```text
Vorher: fetch() ohne await/waitUntil -> Deno killt Prozess -> Request nie gesendet
Nachher: EdgeRuntime.waitUntil(fetch()) -> Deno wartet auf fetch -> Request wird gesendet
```

### Dateien die geaendert werden

1. **EDIT**: `supabase/functions/auto-generate-universal-video/index.ts` -- fetch() in EdgeRuntime.waitUntil() wrappen

