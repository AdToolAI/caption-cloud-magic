

# Fix: Von Event-Modus zurueck zu RequestResponse-Modus (direkt zu AWS)

## Das Problem

AWS Lambda **Event-Invocations haben ein hartes 256KB Payload-Limit**. Unser Payload enthaelt alle Szenen mit Image-URLs, Voiceover-URLs, Subtitles, InputProps etc. - das uebersteigt sehr wahrscheinlich 256KB. AWS verwirft den Request still mit einem 202, fuehrt die Lambda aber nie aus.

**Beweis:** Nach 8+ Minuten sind BEIDE S3-Pfade noch 404:
- `universal-video-18cl7i8ejr.mp4` -> 404
- `renders/18cl7i8ejr/out.mp4` -> 404
- Kein Webhook empfangen
- Kein einziger Chunk-File auf S3

## Die Loesung

Zurueck zu **RequestResponse-Modus** (6MB Payload-Limit), aber **direkt zu AWS Lambda** (kein Edge-zu-Edge Umweg). Da wir in `waitUntil` laufen, wird die Funktion irgendwann sterben bevor Lambda antwortet - aber das ist OK:

1. Die Lambda laeuft auf AWS **unabhaengig** vom aufrufenden Client weiter
2. Der Webhook (`remotion-webhook`) meldet Completion
3. S3-Polling (`check-remotion-progress`) findet das fertige Video

Wir fuegen einen `.then()`-Handler hinzu, um die `lambda_render_id` zu erfassen falls wir die Antwort noch erhalten.

```text
Event-Modus (kaputt):
  Payload >256KB -> AWS verwirft still -> Lambda laeuft nie

RequestResponse direkt (fix):
  Payload <6MB -> Lambda startet sofort -> waitUntil stirbt irgendwann
  Lambda laeuft weiter -> Webhook/S3-Polling erkennt Completion
```

## Aenderung

### Datei: `supabase/functions/auto-generate-universal-video/index.ts`

Zeilen 572-594 aendern - von Event-Modus zu RequestResponse-Modus mit fire-and-forget Pattern:

```typescript
// RequestResponse-Modus (6MB Payload-Limit vs 256KB bei Event)
// Fire-and-forget: Lambda laeuft auf AWS weiter auch wenn waitUntil stirbt
console.log('Invoking Lambda in RequestResponse mode (fire-and-forget)...');

const lambdaPromise = aws.fetch(lambdaUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Amz-Invocation-Type': 'RequestResponse',
  },
  body: asciiSafePayload,
});

// Try to capture the real renderId if Lambda responds before waitUntil dies
lambdaPromise
  .then(async (response) => {
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lambda failed:', response.status, errorText);
      // Update progress to failed
      await supabase.from('universal_video_progress').update({
        status: 'failed', current_step: 'failed', progress_percent: 0,
        status_message: `Lambda-Fehler: ${errorText.substring(0, 200)}`,
        updated_at: new Date().toISOString(),
      }).eq('id', progressId);
      return;
    }
    const result = await response.json();
    if (result.errorMessage) {
      console.error('Lambda function error:', result.errorMessage);
      await supabase.from('universal_video_progress').update({
        status: 'failed', current_step: 'failed', progress_percent: 0,
        status_message: `Lambda-Fehler: ${result.errorMessage.substring(0, 200)}`,
        updated_at: new Date().toISOString(),
      }).eq('id', progressId);
      return;
    }
    // Store lambda_render_id for progress.json lookups
    const realRenderId = result.renderId;
    console.log('Lambda returned realRenderId:', realRenderId);
    if (realRenderId && realRenderId !== pendingRenderId) {
      const { data: existingRender } = await supabase
        .from('video_renders').select('content_config')
        .eq('render_id', pendingRenderId).maybeSingle();
      await supabase.from('video_renders').update({
        content_config: { ...(existingRender?.content_config || {}), lambda_render_id: realRenderId },
      }).eq('render_id', pendingRenderId);
    }
  })
  .catch((err) => {
    // waitUntil died or network error - Lambda still runs on AWS
    console.log('Lambda fetch terminated (expected if waitUntil expired):', err?.message);
  });

// Don't await lambdaPromise! Continue immediately.
await updateProgress(supabase, progressId, 'rendering', 90, 'Video wird gerendert...');
```

### Warum das funktioniert

1. **6MB Payload-Limit** statt 256KB - Payload passt garantiert
2. **Direkt zu AWS** - kein API Gateway Timeout dazwischen
3. **Fire-and-forget** - wir warten nicht auf die Lambda-Antwort
4. **Lambda laeuft unabhaengig** - auch wenn waitUntil den Edge Function killt
5. **Webhook + S3-Polling** erkennen Completion wie bisher
6. **Bonus: Error-Feedback** - falls Lambda schnell genug antwortet, erfassen wir Fehler

## Dateien die geaendert werden

1. **EDIT**: `supabase/functions/auto-generate-universal-video/index.ts` - Event-Modus durch RequestResponse fire-and-forget ersetzen
