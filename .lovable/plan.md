## Problem

Vocal-Track-Generierung schlägt fehl mit Replicate 422:
`"input: prompt is required"` von `minimax/music-1.5`.

Unser Edge Function `generate-music-track` sendet aktuell:
```ts
input: { lyrics, song_description }
```
Das Replicate-Schema von `minimax/music-1.5` erwartet aber `prompt` (Style-Description) + `lyrics`. `song_description` ist kein gültiges Feld.

## Fix (1 Datei)

`supabase/functions/generate-music-track/index.ts` (Zeilen 288–296):

```ts
output = await replicate.run('minimax/music-1.5', {
  input: {
    lyrics: lyrics!.trim(),
    prompt: styleDesc,        // ← war: song_description
  },
});
```

Keine weiteren Änderungen. Kein UI-Impact, keine Migration, kein Preisimpact.

## Verify

Nach Deploy: neuen Vocal-Track (MiniMax) erzeugen und in `supabase--edge_function_logs` prüfen, dass keine 422 mehr auftritt und `output` ein Audio-URL liefert.
