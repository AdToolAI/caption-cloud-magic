## Bug

`compose-dialog-segments` wirft beim Start des Lip-Sync-Renderings einen `ReferenceError: Cannot access 'state' before initialization`.

Ursache: Im letzten Fix wurde der Plate-Dimension-Probe-Block (Zeilen ~533–545) eingefügt, der auf `state.passes[0].input_url`, `state.source_clip_url` und `state.video_width/height` zugreift. Die Variable `state` wird aber erst viel später (Zeile 1048) deklariert → TDZ-Crash, kein einziger Pass startet, UI zeigt "Lip-Sync fehlgeschlagen".

## Fix

In `supabase/functions/compose-dialog-segments/index.ts` den Probe-Block so umschreiben, dass er die bereits vorhandenen Variablen nutzt:

- `platePrimaryUrl` = `sourceClipUrl` (Master-Plate, schon oben aus `scene.lip_sync_source_clip_url || scene.clip_url` aufgelöst). Bei Retry/Advance fällt das ohnehin auf den ursprünglichen Master-Plate zurück — genau die Dimensionen, die wir für coords-Skalierung wollen.
- `videoDims` Fallback aus `prevState` lesen (`prevState.video_width/height`) statt aus `state`. `prevState` ist zu diesem Zeitpunkt schon definiert (Zeile 843).

Damit:

```ts
const platePrimaryUrl = sourceClipUrl;
let plateDims: { width: number; height: number } | null = null;
if (platePrimaryUrl) {
  plateDims = await probeMp4Dims(platePrimaryUrl);
}
const videoDims = plateDims ?? {
  width: Number((prevState as any)?.video_width) || 1280,
  height: Number((prevState as any)?.video_height) || 720,
};
```

Außerdem: Den Probe-Block hinter die Stelle verschieben, an der `sourceClipUrl` und `prevState` bereits sicher definiert sind (also nach Zeile 843), damit auch bei zukünftigen Umbauten kein TDZ mehr möglich ist. Konkret: den `// ── Face-targeting`-Block (Zeilen 504–576) komplett hinter den `prevState`-Block (nach Zeile 868) ziehen, sodass die Reihenfolge ist:

1. Wallet-Charge
2. `prevState` / `passes` aufbauen
3. Face-Map + Plate-Probe + speakerCoords berechnen (kann jetzt `prevState` lesen)
4. Sync.so-Dispatch wie gehabt

## Recovery

Nach Deploy: betroffene Szene wurde bereits auf `pending` zurückgesetzt — User klickt erneut "Lip-Sync neu rendern".

## Files

- `supabase/functions/compose-dialog-segments/index.ts` — Probe-Block umschreiben + Face-Targeting-Block nach `prevState`-Setup verschieben
- `mem/features/video-composer/sync-segments-dialog-pipeline` — kurzer Hinweis zur Reihenfolge `prevState → faceMap/probe`