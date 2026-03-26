

## Fix: Video nicht abspielbar — "NoSuchKey" S3 Fehler

### Ursache

In `render-with-remotion/index.ts` (Zeilen 497-576) wird nach dem Lambda-Aufruf die Antwort `{ type: "success", renderId, bucketName }` als **fertiges Rendering** interpretiert. Tatsaechlich bedeutet diese Antwort nur, dass `renderMediaOnLambda()` den Render-Job **gestartet** hat — die Datei `renders/{renderId}/out.mp4` existiert noch nicht.

Die Funktion:
1. Konstruiert sofort eine Output-URL (`renders/u5mx64mcjs/out.mp4`)
2. Markiert `video_renders` als `completed` mit dieser URL
3. Speichert in `video_creations` mit dieser nicht-existierenden URL
4. Gibt `status: 'completed'` ans Frontend zurueck

Das Frontend erwartet eigentlich den Webhook-Flow (Zeile 348-368 in PreviewExportStep.tsx: es setzt `status: 'rendering'` und wartet auf Realtime-Updates). Aber weil die Edge Function `completed` zurueckgibt, wird die UI verwirrt.

**Zusaetzlich**: Der `media_assets` Insert schlaegt fehl wegen Check-Constraint (`source` muss `'upload'` oder `'url'` sein, nicht `'remotion-render'`).

### Aenderungen

#### `supabase/functions/render-with-remotion/index.ts` (Zeilen 497-576)

Nach dem erfolgreichen Lambda-Response:

1. **Nicht als completed markieren** — stattdessen nur den echten `renderId` in `video_renders.content_config` speichern (Status bleibt `rendering`)
2. **Keine Output-URL konstruieren** — die URL kommt spaeter vom Webhook mit dem echten `outputFile`
3. **Kein `video_creations` Insert** — das macht bereits der Webhook (Zeile 200-208 in `remotion-webhook/index.ts`)
4. **Kein `media_assets` Insert** — entfernen (schlaegt sowieso fehl wegen Check-Constraint)
5. **Response aendern**: `status: 'rendering'` statt `'completed'`, keine `video_url`

Konkret werden Zeilen 512-565 ersetzt durch:

```typescript
// Update render record with real renderId (webhook will mark as completed)
await supabaseAdmin.from('video_renders').update({
  content_config: {
    ...customizations,
    credits_used: credits_required,
    real_remotion_render_id: realRenderId,
  },
}).eq('render_id', pendingRenderId);

console.log('✅ Updated render record with real renderId, waiting for webhook...');
```

Response (Zeilen 567-578):
```typescript
return new Response(JSON.stringify({
  ok: true,
  render_id: pendingRenderId,
  real_render_id: realRenderId,
  status: 'rendering',
  message: 'Video-Rendering laeuft. Webhook benachrichtigt bei Fertigstellung.'
}), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
```

### Ergebnis
- Edge Function startet den Render und gibt `status: 'rendering'` zurueck
- Frontend setzt korrekt auf "rendering" und wartet auf Realtime-Updates
- Webhook feuert wenn Render fertig ist, setzt echte `outputFile` URL, speichert in `video_creations`
- Video ist dann tatsaechlich abspielbar und downloadbar

### Datei
1. `supabase/functions/render-with-remotion/index.ts` — Premature-Completion entfernen, auf Webhook vertrauen

