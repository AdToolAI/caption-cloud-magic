

# Fix: S3-Pfad-Mismatch nach invoke-remotion-render

## Gefundener Bug

Der Workflow hat einen **kritischen S3-Pfad-Mismatch**, der dazu fuehrt, dass das fertige Video nie gefunden wird:

### Der Ablauf aktuell

1. `auto-generate-universal-video` erstellt einen `pendingRenderId` (z.B. `k8m2x9fn4a`)
2. Lambda-Payload wird mit `outName: 'universal-video-k8m2x9fn4a.mp4'` erstellt
3. `invoke-remotion-render` ruft Lambda auf und bekommt `realRenderId` zurueck (z.B. `a3b7c9d2e1`)
4. `invoke-remotion-render` **ueberschreibt** `video_renders.render_id` von `k8m2x9fn4a` auf `a3b7c9d2e1`
5. `invoke-remotion-render` setzt `result_data.renderId = 'a3b7c9d2e1'` in `universal_video_progress`
6. Frontend bekommt `a3b7c9d2e1` und pollt `check-remotion-progress` damit
7. `check-remotion-progress` sucht auf S3 nach `universal-video-a3b7c9d2e1.mp4`
8. **ABER**: Die Datei heisst `universal-video-k8m2x9fn4a.mp4` (aus dem outName)!

### Ergebnis: Video wird NIE gefunden

- Die S3-Datei hat den pendingRenderId im Namen (weil outName so gesetzt wurde)
- Die Suche verwendet den realRenderId (weil die DB und progress aktualisiert wurden)
- Diese IDs sind unterschiedlich -- das Video kann nie gefunden werden

### Positiv: progress.json funktioniert

- Lambda schreibt `renders/a3b7c9d2e1/progress.json` (mit realRenderId)
- `check-remotion-progress` sucht `renders/a3b7c9d2e1/progress.json` (mit realRenderId)
- Das matcht -- Fortschrittsverfolgung funktioniert korrekt

## Loesung

Die Loesung ist einfach: **render_id in der DB NICHT ueberschreiben**. Der `pendingRenderId` bleibt die kanonische ID, weil er zum S3-Dateinamen passt. Der `realRenderId` wird separat gespeichert fuer progress.json-Lookups.

### Aenderung 1: `supabase/functions/invoke-remotion-render/index.ts`

**Zeile 127-133** -- render_id Update ENTFERNEN:

Vorher:
```
if (realRenderId && realRenderId !== pendingRenderId) {
  await supabase.from('video_renders').update({
    render_id: realRenderId,
    status: 'rendering',
  }).eq('render_id', pendingRenderId);
}
```

Nachher:
```
// render_id NICHT ueberschreiben! pendingRenderId = outName auf S3
// realRenderId nur in content_config speichern fuer progress.json-Lookups
if (realRenderId && realRenderId !== pendingRenderId) {
  await supabase.from('video_renders').update({
    status: 'rendering',
    content_config: {
      ...existingConfig,
      lambda_render_id: realRenderId,
    },
  }).eq('render_id', pendingRenderId);
}
```

**Zeile 136-143** -- result_data mit BEIDEN IDs:

Vorher:
```
result_data: { renderId: realRenderId || pendingRenderId, bucketName }
```

Nachher:
```
result_data: { renderId: pendingRenderId, lambdaRenderId: realRenderId, bucketName }
```

So bleibt `pendingRenderId` die primaere ID fuer S3-Output und DB-Lookup, waehrend `realRenderId` fuer progress.json verfuegbar ist.

### Aenderung 2: `supabase/functions/check-remotion-progress/index.ts`

**progress.json Lookup (Zeile 381)** -- Zusaetzlich den `lambda_render_id` pruefen:

Wenn `renders/${effectiveRenderId}/progress.json` nicht gefunden wird (weil effectiveRenderId = pendingRenderId), als Fallback `renders/${renderData.content_config.lambda_render_id}/progress.json` versuchen.

```
// Primary: try with effectiveRenderId
let progressKey = `renders/${effectiveRenderId}/progress.json`;
// ...
// Fallback: try with lambda_render_id from DB
if (!progressResponse.ok && renderData?.content_config?.lambda_render_id) {
  const lambdaKey = `renders/${renderData.content_config.lambda_render_id}/progress.json`;
  // ... retry with this key
}
```

### Keine weiteren Aenderungen noetig

- Frontend-Polling mit `pendingRenderId` matcht den S3-Dateinamen
- DB-Lookup mit `pendingRenderId` matcht die `video_renders.render_id` Spalte
- Webhook-CustomData enthaelt `pending_render_id` und funktioniert weiterhin

## Zusammenfassung

```text
Vorher (kaputt):
  outName: universal-video-PENDING.mp4
  DB render_id: REAL (ueberschrieben)
  Frontend pollt mit: REAL
  S3-Suche: universal-video-REAL.mp4  --> NICHT GEFUNDEN

Nachher (fix):
  outName: universal-video-PENDING.mp4
  DB render_id: PENDING (unveraendert)
  Frontend pollt mit: PENDING
  S3-Suche: universal-video-PENDING.mp4  --> GEFUNDEN
  progress.json: renders/REAL/progress.json --> GEFUNDEN (via lambda_render_id Fallback)
```

### Dateien die geaendert werden

1. **EDIT**: `supabase/functions/invoke-remotion-render/index.ts` -- render_id nicht ueberschreiben, beide IDs in result_data
2. **EDIT**: `supabase/functions/check-remotion-progress/index.ts` -- progress.json Fallback mit lambda_render_id

