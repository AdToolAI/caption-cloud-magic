

## Fix: Video nicht in Mediathek + AWS Rate Limit

### Problem 1 — Video wird nicht in der Mediathek gespeichert

Die Edge Function `render-with-remotion` (Zeile 530-537) schreibt in `video_creations` mit falschen Spaltennamen:
- `video_url` → Spalte existiert nicht, korrekt ist `output_url`
- `template_name` → existiert nicht, muesste in `metadata` gespeichert werden
- `render_engine` → existiert nicht, gehoert ebenfalls in `metadata`
- `title` → existiert nicht als Spalte

Deshalb schlaegt das Insert still fehl (Supabase ignoriert unbekannte Spalten oder wirft einen Fehler, der im `catch` verschluckt wird). Die Log-Meldung "Saved to Media Library" ist truegerisch — der Insert-Fehler wird nicht korrekt geloggt.

### Problem 2 — AWS Concurrency Limit beim zweiten Render

Ein 4K-Video mit 810 Frames wird auf 8 parallel Lambda-Worker verteilt. Wenn sofort ein zweiter Render gestartet wird, sind die Lambdas noch belegt → "Rate Exceeded". 

**Loesung**: `framesPerLambda` erhoehen, damit weniger Lambdas genutzt werden (z.B. max 3 statt 8). Zusaetzlich im Frontend einen Cooldown nach erfolgreichem Render einbauen.

### Aenderungen

#### 1. `supabase/functions/render-with-remotion/index.ts` — Media Library Insert fixen

Zeile 530-550: Insert korrigieren mit den richtigen Spalten:

```typescript
await supabaseAdmin.from('video_creations').insert({
  user_id: userId,
  output_url: outputUrl,
  status: 'completed',
  credits_used: credits_required,
  quality: quality,
  aspect_ratio: aspect_ratio,
  format: format,
  metadata: {
    title: customizations?.projectTitle || 'Video',
    template_name: componentName,
    render_engine: 'remotion',
    render_id: realRenderId,
    source: 'universal-creator',
  },
});
```

Zusaetzlich: den `catch`-Block verbessern, damit Insert-Fehler sauber geloggt werden (`.insert().select()` verwenden und den Error pruefen).

#### 2. `supabase/functions/_shared/remotion-payload.ts` — Lambda-Concurrency reduzieren

`framesPerLambda` erhoehen (z.B. auf 270), damit maximal 3 Lambdas gestartet werden statt 8. Das reduziert Concurrency-Konflikte massiv.

### Dateien
1. `supabase/functions/render-with-remotion/index.ts` — Insert-Spalten korrigieren + Error-Logging
2. `supabase/functions/_shared/remotion-payload.ts` — framesPerLambda anpassen

