## Problem

Die Szene `a6ce3a99…` ist **erneut** vor Sync.so geblockt, obwohl die Forensik „✅ Self-healed" anzeigt. Edge-Logs beweisen die Ursache:

```
v129.22.3_face_gate pass=1 code=probe_unavailable ok=true jpeg=no snap=no
reason=server_extractor_disabled_v129_14: edge runtime cannot run ffmpeg.wasm
DISPATCH pass=1/4 coords=[337,144] frame=52 sync_mode=cut_off
```

- Beim **Dispatch** kann die Edge-Function `compose-dialog-segments` **keinen JPEG aus dem Preclip ziehen** → Face-Gate fällt auf `probe_unavailable` zurück → Dispatch geht **ungeprüft** mit der falschen Koord `[337,144]` raus → Sync.so antwortet `generation_unknown_error`.
- Das **Forensik-Panel** läuft danach in einem anderen Pfad (mit serverseitigem Frame via `extract-video-frames` bzw. Live-Probe) → dort klappt der Snap → grünes Banner.

Ergebnis: Die Pipeline **heilt sich nur im UI, nicht im Dispatch**. Jeder echte Render bleibt am gleichen Bug hängen.

## Lösung

Den **gleichen Snap-Pfad in den Dispatch** holen, indem `compose-dialog-segments` vor jeder Pass-Dispatch garantiert eine `probe_frame_url` besitzt — entweder vom Client mitgegeben oder serverseitig gerendert.

### Schritte

1. **Server-seitiger Still-Extractor** (`_shared/face-frame-extract.ts` erweitern):
   - Neue Funktion `getOrExtractProbeFrame({ videoUrl, frameNumber, fps, sceneId, passIdx })` mit 24h-Cache in `composer-frames/probe-frames/{sceneId}-p{idx}-f{frame}.png`.
   - Primär: Replicate `lucataco/ffmpeg-extract-frame` mit `timestamp = frameNumber / fps`.
   - Fallback (wenn Replicate 404 / 5xx): Remotion Lambda `renderStillOnLambda` gegen eine Mini-Komposition `<Video src={url}/>` bei frame `frameNumber`.
   - Idempotent: prüft Bucket vor Re-Render.

2. **Dispatch-Pfad in `compose-dialog-segments`** (vor `verifyFaceBeforeDispatch`-Aufruf, ~Zeile 4275):
   - Wenn `pass.probe_frame_url` fehlt → `await getOrExtractProbeFrame(...)`, URL auf Pass schreiben.
   - `verifyFaceBeforeDispatch` erhält den neuen Parameter `prebuiltFrameUrl`.
   - `_shared/syncso-face-gate.ts`: `verifyFaceBeforeDispatch` akzeptiert `prebuiltFrameUrl` und gibt ihn an `detectFacesMediaPipe(prebuiltFrameUrls: [url])` weiter — gleicher Code-Pfad wie heute in `syncso-preflight`. Damit greift der existierende `ok_after_snap`-Zweig (Zeilen 230-289) statt `not_at_coord` zu werfen.

3. **Pass-Persistenz**: `dialog_shots`/`pass`-Row bekommt Spalte `probe_frame_url` (Migration), damit Retries und der Forensik-UI dieselbe URL benutzen — kein doppelter Extract.

4. **Refund-Sicherheit**: Bleibt unverändert. Schlägt der Extractor + Fallback komplett fehl, läuft heutiges `probe_unavailable`-Verhalten weiter (Dispatch ungeprüft, später Refund bei Sync.so-Fehler) — also keine Regression.

5. **Forensik-UI** (`SyncsoForensicsSheet.tsx`): Das grüne „Self-healed"-Banner nur dann zeigen, wenn der Snap **am Dispatch** tatsächlich angewandt wurde (`pass.coords_snapped_at IS NOT NULL` AND `dispatch_never_happened === false`). Das gestrige Banner war optimistisch — neue Logik:
   - `coords_snapped_at` gesetzt + Dispatch passiert → grün „Snap angewandt, Sync.so lief".
   - `coords_snapped_at` gesetzt + dispatch_never_happened → orange „Snap bereit, aber Dispatch fehlt — Replay nötig".
   - Snap nur in Live-Probe (nicht in DB) → blau „Snap-Kandidat erkannt, beim nächsten Render anwendbar".

## Dateien

- `supabase/functions/_shared/face-frame-extract.ts` (erweitern oder neue Helper-Datei)
- `supabase/functions/_shared/syncso-face-gate.ts` (neuer Param `prebuiltFrameUrl`)
- `supabase/functions/compose-dialog-segments/index.ts` (Frame-Extract vor Face-Gate, Pass-Update)
- `supabase/migrations/<ts>_dialog_shot_probe_frame.sql` (Spalte `probe_frame_url`)
- `src/components/admin/SyncsoForensicsSheet.tsx` (Banner-Logik präzisieren)

## Validierung

- Replay der gleichen Szene `a6ce3a99…` → Logs zeigen `v129.22.3_face_gate code=ok_after_snap snap=[457,593]` → DISPATCH mit `[457,593]` → Sync.so 200 OK.
- Neue Szene mit 4 Sprechern → alle 4 Passes haben `probe_frame_url`, keine `FACE_GATE_PROBE_UNAVAILABLE`-Einträge mehr in `sync_dispatch_log`.

## Kosten

- ~€0.001/Pass für Replicate (oder ~€0.002 für Lambda-Still), gecached pro Pass → einmalig pro Szene/Sprecher.
