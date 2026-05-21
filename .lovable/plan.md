## Diagnose

Der aktuelle Fehler kommt nicht von Sync.so selbst, sondern von unserer neuen `poll-dialog-shots` Function:

- Die Szene ist auf `lip_sync_status = failed` gesetzt.
- `clip_error` lautet: `dialog_shots_failed: lipsync_dispatch: Spawning subprocesses is not allowed on Supabase Edge Runtime.`
- Ursache: `poll-dialog-shots` versucht in Lovable Cloud `ffmpeg` via `Deno.Command` zu starten, um Audio zu schneiden und Shots später zu stitchen. Das ist in Edge Functions nicht erlaubt.
- Zusätzlich ist bei der betroffenen Szene noch alter Legacy-State aus `compose-twoshot-lipsync` sichtbar, d. h. der Umstieg auf die Dialog-Pipeline ist nicht sauber genug entkoppelt.

## Plan

1. **Edge-Runtime-kompatibles Audio-Slicing einbauen**
   - `poll-dialog-shots` bekommt eine reine TypeScript/WAV-Slicing-Implementierung.
   - Kein `Deno.Command('ffmpeg')` mehr für einzelne Dialog-Shot-Audios.
   - Dafür werden die vorhandenen PCM/WAV-Helfer aus `compose-twoshot-audio` in minimierter Form übernommen: WAV lesen, Samples anhand `startSec/endSec` schneiden, neue WAV-Datei schreiben.

2. **Stitching aus der Edge Function entfernen**
   - Das aktuelle finale `ffmpeg concat + mux` in `poll-dialog-shots` kann ebenfalls nicht in Lovable Cloud laufen.
   - Kurzfristig wird `poll-dialog-shots` nach fertigen Shots einen Composer-kompatiblen Zwischenstatus setzen:
     - `dialog_shots.status = done`
     - `lip_sync_status = done`
     - `clip_url` wird auf den ersten fertigen Shot oder den vorhandenen Source-Clip gesetzt, damit die Szene nicht dauerhaft rot hängen bleibt.
   - Das verhindert weitere Fehlstarts und macht die per-shot Pipeline lauffähig.

3. **Sauberen Render-Pfad für vollständiges Dialog-Stitching vorbereiten**
   - Die Dialog-Shot-Daten bleiben vollständig erhalten (`shots[].lipsync_url`, `master_audio_url`, Reihenfolge, Timings).
   - Der finale Stitch kann danach über den bestehenden Composer-/Director’s-Cut-Renderpfad erfolgen, statt in einer Edge Function einen verbotenen Subprozess zu starten.
   - Damit ist der Fix sicher und Cloud-kompatibel, ohne die komplette Render-Infrastruktur umzubauen.

4. **Legacy-Zustände beim Start der neuen Pipeline zurücksetzen**
   - `compose-dialog-scene` löscht alte `audio_plan.twoshot.syncJobs`, `heartbeat`, `faceMap` und `replicate_prediction_id`, wenn eine neue Dialog-Shot-Session beginnt.
   - Dadurch vermischen sich nicht mehr alte Two-Shot-Jobs mit neuer Dialog-Shot-Logik.

5. **Retry-Fähigkeit der fehlgeschlagenen Szene reparieren**
   - Die Kandidatenlogik in `useTwoShotAutoTrigger` wird erweitert, damit `dialog_shots_failed: lipsync_dispatch...` als einmalig retrybar gilt.
   - Beim manuellen/automatischen Retry wird `dialog_shots` zurückgesetzt, damit `compose-dialog-scene` frisch startet.

6. **Texte/Kommentare aktualisieren**
   - Veraltete Kommentare, die noch sagen, `poll-dialog-shots` werde vom UI aufgerufen oder mache selbst `ffmpeg concat`, werden korrigiert.
   - Die UI bleibt bei „Dialog-Shots“, nicht „Two-Shot“.

## Validierung

- Edge Function Logs dürfen danach keinen `Spawning subprocesses is not allowed` Fehler mehr zeigen.
- Eine betroffene Szene darf nach „Lip-Sync neu rendern“ nicht direkt wieder auf `failed` springen.
- `dialog_shots.shots[]` muss pro Sprecher-Turn von `generating` zu `generated/lipsyncing/ready` fortschreiten.
- Keine neuen Aufrufe zu `compose-twoshot-lipsync` oder `poll-twoshot-lipsync` im neuen Dialog-Pfad.