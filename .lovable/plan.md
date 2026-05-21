## Diagnose

Die schlechte Lip-Sync-Qualität ("erster Charakter gar nicht, zweiter halb") hat **zwei Ursachen**:

### 1. Die betroffene Szene benutzt noch die Legacy-Pipeline

Scene `7b93dffc-…`:
- `dialog_shots = NULL`
- `clip_url = https://api.sync.so/v2/generations/e94ccd0d…/result`
- `replicate_prediction_id = sync:e94ccd0d…`

Das ist Output vom alten **`compose-twoshot-lipsync`** (Zwei-Pass Sync.so auf einem gemeinsamen Master-Plate mit per-Sprecher `segments_secs`-Fenstern). `compose-dialog-scene` wurde für diese Szene nie aufgerufen — Edge-Logs leer.

Bei diesem Verfahren ist genau das Symptom typisch, das du siehst:
- Pass 1 (Char A) clamped sein Fenster → Mund nur in seinen Turns animiert; in Char Bs Turns „resting".
- Pass 2 (Char B) läuft auf Pass-1-Output → überschreibt Char As Mundbereich teils mit, Frame-Drift bei kurzen Turns sichtbar.

### 2. Selbst die neue `compose-dialog-scene`-Pipeline stitcht nicht

In `poll-dialog-shots` Step 5 (Zeilen 449–477):

```
if (shots.length === 1) clip_url = shots[0].lipsync_url
else                    clip_url = sourceClip          // ← Original-Plate ohne Lipsync!
```

Bei 2+ Sprechern werden alle per-Turn Sync.so-Outputs (`shots[].lipsync_url`) **verworfen**, weil Edge Runtime kein `ffmpeg` darf. Die Szene würde also auf den lipsync-losen Master-Plate fallen — noch schlechter als die Legacy-Variante.

→ Beide Pfade liefern derzeit kein „Artlist-Level" Multi-Speaker Lipsync.

## Plan

### A. Per-Turn Lipsync wirklich stitchen (echtes Multi-Cut Ergebnis)

Neue Edge Function **`stitch-dialog-shots`**:
- Input: `scene_id`
- Liest `dialog_shots.shots[]` (alle `status='ready'`) + `master_audio_url`
- Sortiert nach `startSec`, baut eine Sequenz aus den per-Turn `lipsync_url`s und füllt Lücken zwischen `endSec[i]` und `startSec[i+1]` mit dem Original-Plate (oder dem letzten Frame der vorherigen Hailuo-Plate) als Listener-Shot.
- Triggert **Remotion Lambda** (über das vorhandene `invoke-remotion-render` / `render-with-remotion`) mit einer schmalen Composition `DialogShotSequence`, die jeden Shot als `<OffthreadVideo>` rendert und das `master_audio_url` als globale Audiospur muxt.
- Schreibt das Ergebnis als finales `clip_url` zurück, setzt `dialog_shots.stitched_url`, `lip_sync_status='done'`.

Damit werden die per-Turn Sync.so-Mund-Animationen jedes Sprechers wirklich in den finalen Clip kompositiert — Char A in seinen Turns als A-Shot mit echter Lipsync, Char B in seinen Turns als B-Shot mit echter Lipsync. Das ist die Artlist/Reaktionsshot-Optik.

### B. `poll-dialog-shots` Stitching-Block ersetzen

- Step 5 (lines 449–477) ruft am Ende statt der Fake-Done-Logik die neue `stitch-dialog-shots` Function via `EdgeRuntime.waitUntil(fetch(...))` an.
- Pipeline-Status wandert in einen neuen Zustand `'stitching'`, bis Lambda fertig ist.
- 1-Shot-Path bleibt wie heute (kein Stitch nötig, `lipsync_url === clip_url`).

### C. Legacy-Pfad endgültig deaktivieren

Verbleibende Aufrufer von `compose-lipsync-scene` / `compose-twoshot-lipsync` umlenken:

1. `src/components/video-composer/ClipsTab.tsx:467` ruft noch `compose-lipsync-scene` auf → ersetzen durch `compose-dialog-scene` + Reset-Block (`lip_sync_status='pending'`, `dialog_shots=null`).
2. In `compose-clip-webhook` Rescue-Pfad sicherstellen, dass nur `compose-dialog-scene` aufgerufen wird (laut grep schon der Fall).
3. Edge Functions `compose-twoshot-lipsync` / `poll-twoshot-lipsync` / `twoshot-lipsync-watchdog` bleiben deployed, aber bekommen einen 410-Gone-Short-Circuit am Anfang (`return 410` + Log), damit nichts mehr lautlos im Hintergrund läuft.

### D. Betroffene Szene zurücksetzen

Reset für `7b93dffc-0aa2-4680-9eff-a05200ab372c`:
- `lip_sync_status = 'pending'`, `twoshot_stage = NULL`
- `clip_url = lip_sync_source_clip_url` (Original Master-Plate)
- `dialog_shots = NULL`, `replicate_prediction_id = NULL`, `lip_sync_applied_at = NULL`

Der Auto-Trigger nimmt sie dann sofort über `compose-dialog-scene` neu auf.

### E. Qualitäts-Schrauben für „Artlist-Level"

- **Hailuo-Plates pro Turn**: Prompt-Suffix erzwingt einen close-/medium-up Shot des sprechenden Charakters mit klarem Mundbereich, kamera-zugewandt, ohne Hände vor dem Mund. (Das macht `buildShotPrompt` schon teilweise — verschärfen + negativ-Prompt um `hand near mouth, microphone, occluded lips, profile shot` ergänzen.)
- **Sync.so per Shot** läuft schon mit `lipsync-2-pro` + `sync_mode='cut_off'`. `temperature` adaptiv setzen (1.0 wenn `durSec < 2.0s`, sonst 0.85) — analog zur Two-Shot-Policy in `mem://architecture/lipsync/sync-so-pro-model-policy`.
- **Listener-Shots in den Gaps**: Wenn Char A spricht, sieht man Char B als Listener-Shot (still, leichte Reaktion) — fällt im Stitch sauberer aus als hartes Cut-zu-Schwarz. Dafür benutzt `stitch-dialog-shots` die Hailuo-Plate des *jeweils anderen* Sprechers als Filler.

## Technische Details

**Neue Datei**: `supabase/functions/stitch-dialog-shots/index.ts`
- HTTP POST: `{ scene_id: string }`
- Liest Scene, baut JSON-Payload für Remotion `DialogShotSequence` Composition:
  ```json
  {
    "compositionId": "DialogShotSequence",
    "inputProps": {
      "shots": [{ "url": "...lipsync.mp4", "startSec": 0, "endSec": 2.23, "speaker": "A" }, ...],
      "fillerByCharId": { "matthew-…": "hailuo-listener-url", ... },
      "masterAudioUrl": "...master.wav",
      "totalSec": 7.05,
      "fps": 30,
      "width": 1280,
      "height": 720
    }
  }
  ```
- Ruft intern `invoke-remotion-render` auf, persistiert `dialog_shots.stitched_url` + setzt `clip_url`.

**Neue Composition**: `src/remotion/templates/DialogShotSequence.tsx`
- Pro Shot ein `<Sequence from={Math.round(startSec*fps)} durationInFrames={...}>` mit `<OffthreadVideo src={url} muted />` (Audio kommt aus Master).
- Globaler `<Audio src={masterAudioUrl} />` über die volle Komposition.
- Gaps: gleiche Logik, `src={fillerByCharId[otherChar]}` mit `playbackRate={0.95}` für ruhigen Look.

**Geänderte Dateien**:
- `supabase/functions/poll-dialog-shots/index.ts` — Step 5 ersetzen
- `supabase/functions/compose-dialog-scene/index.ts` — `buildShotPrompt` schärfen, adaptive temperature in shot-record vormerken
- `src/components/video-composer/ClipsTab.tsx` — Button umverdrahten auf `compose-dialog-scene`
- `supabase/functions/compose-twoshot-lipsync/index.ts` + 2 Geschwister — 410-Short-Circuit
- `mem/features/video-composer/dialog-shot-pipeline` — Stitch-Schritt + Listener-Filler dokumentieren

**Migration / SQL**:
- Einmaliger UPDATE-Reset für Scene `7b93dffc-…`.

## Validierung

1. Logs von `compose-dialog-scene` und `stitch-dialog-shots` erscheinen für die betroffene Szene.
2. `dialog_shots.shots[]` hat pro Sprecher-Turn einen Eintrag mit `status='ready'` und gesetztem `lipsync_url`.
3. `dialog_shots.stitched_url` ist gesetzt, `clip_url === stitched_url`.
4. Im finalen Clip: Char A spricht in seinen Turns mit sichtbarer Lippenbewegung; Char B in seinen Turns ebenfalls; in den Gaps ist der jeweils nicht-sprechende Charakter als ruhiger Listener-Shot zu sehen.
5. Edge-Logs von `compose-twoshot-lipsync` zeigen nur noch 410-Gone-Einträge, keine echten Sync.so-Calls mehr.
