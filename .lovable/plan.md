## Problem

Das Lip Sync selbst schlägt aktuell nicht mehr bei Sync.so fehl: die einzelnen Turns werden erfolgreich erzeugt. Der neue Fehler passiert danach beim Zusammenfügen:

```text
Spawning subprocesses is not allowed on Supabase Edge Runtime.
```

Ursache: `poll-dialog-shots` versucht am Ende `ffmpeg` per `Deno.Command` im Edge Runtime zu starten. Das ist dort grundsätzlich verboten. Deshalb landen Szenen nach erfolgreichen Sync.so-Turns trotzdem bei `dialog_stitch_failed`.

## Plan

1. **Edge-Function stabilisieren**
   - `poll-dialog-shots` darf kein `Deno.Command("ffmpeg")` mehr nutzen.
   - Die Funktion soll weiterhin Sync.so-Jobs serialisieren und pollen.
   - Sobald alle Shots `ready` sind, markiert sie die Szene nicht mehr als fehlgeschlagen, sondern übergibt das Stitching an einen renderfähigen Pfad.

2. **Stitching über Remotion/Lambda statt Edge-ffmpeg**
   - Neue Remotion-Komposition für Dialog-Stitching hinzufügen.
   - Sie rendert aus:
     - Master-Video für Lücken,
     - pro-Turn Sync.so-Output für die jeweiligen Zeitfenster,
     - Master-WAV als finale Audiospur.
   - Damit ersetzen wir das verbotene Edge-ffmpeg durch den bereits vorhandenen Lambda-Renderpfad.

3. **Neue interne Stitch-Edge-Function hinzufügen**
   - Eine kleine Funktion startet den Lambda-Render mit der neuen Komposition.
   - Sie legt einen `video_renders`-Eintrag an und nutzt den bestehenden `invoke-remotion-render` + `remotion-webhook` Flow.
   - `poll-dialog-shots` ruft diese Funktion an, sobald alle Shots bereit sind.

4. **Webhook aktualisieren**
   - `remotion-webhook` erkennt `source: 'dialog-stitch'`.
   - Bei Erfolg aktualisiert er die passende `composer_scenes`-Zeile:
     - `clip_url = finalOutputUrl`
     - `lip_sync_applied_at = now()`
     - `lip_sync_status = 'done'`
     - `twoshot_stage = 'done'`
     - `dialog_shots.status = 'done'`
   - Bei Fehler setzt er `lip_sync_status = 'failed'`, speichert die Fehlermeldung und erstattet idempotent über den vorhandenen `refunded`-Status.

5. **Recovery für bereits fehlgeschlagene Szenen**
   - Szenen, die schon `dialog_stitch_failed: Spawning subprocesses...` haben und deren Shots alle `ready` sind, können ohne erneutes Sync.so erneut in den neuen Stitch-Pfad geschickt werden.
   - Das vermeidet unnötige neue Provider-Kosten.

6. **Deploy & Verifikation**
   - Betroffene Edge Functions deployen.
   - `poll-dialog-shots` erneut auf eine betroffene Szene ausführen.
   - Logs prüfen: keine Edge-ffmpeg-Fehler mehr, stattdessen Lambda-Stitch-Render gestartet.

## Technische Dateien

- `supabase/functions/poll-dialog-shots/index.ts`
- neue Funktion: `supabase/functions/render-dialog-stitch/index.ts`
- `supabase/functions/remotion-webhook/index.ts`
- neue Remotion-Komposition/Template in `src/remotion`
- `src/remotion/Root.tsx`

## Wichtig

Das ist kein Sync.so-Plan-Upgrade-Problem. Ein Sync.so-Upgrade würde diesen Fehler nicht beheben, weil der Crash in unserem Stitching-Schritt passiert.