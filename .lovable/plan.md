## Befund

**Do I know what the issue is?** Ja.

Es sind gerade zwei Dinge vermischt:

1. **Screenshot:** Die roten Einträge sind keine echten Browser-Crashes, sondern `console.error(...)`-Diagnoseausgaben aus `UniversalCreatorVideo.tsx` (`DIAG_PROFILE`, `DIAG_TOGGLES_EFFECTIVE`, `UCV_BUNDLE_CANARY`, `RENDER START`). Deshalb erscheinen sie rot, obwohl sie nur Forensik-Logs sind.
2. **Echter Render-Fehler:** Der neueste Render ist nicht mehr mit dem ursprünglichen Edge-Function-`IDLE_TIMEOUT` fehlgeschlagen, sondern mit einem **Render-Timeout nach 600s**. In der Datenbank steht beim letzten Job weiterhin `real_remotion_render_id = null`. Das heißt: Die App hat einen Pending-Render angelegt, aber der echte Remotion-Lambda-Render wurde nicht zuverlässig in den Status zurückgeschrieben bzw. nicht sauber gestartet/verfolgt.

## Plan

1. **Rote Diagnose-Logs endgültig entfernen**
   - In `src/remotion/templates/UniversalCreatorVideo.tsx` alle verbleibenden `console.error(...)`-Diagnoseausgaben für normale Render-Forensik auf `console.log(...)` oder `console.debug(...)` umstellen.
   - Betroffen sind u. a. `UCV_BUNDLE_CANARY`, `DIAG_TOGGLES_EFFECTIVE`, `DIAG_PROFILE`, `UniversalCreatorVideo RENDER START`.
   - Echte Fehler wie invalid config dürfen weiter als Fehler geloggt werden.

2. **Remote-Video-Streaming aus dem Universal-Creator-Render entschärfen**
   - Für `UniversalCreatorVideo` externe Hintergrundvideos nicht mehr direkt in der Lambda-Composition streamen.
   - Stattdessen vor dem Lambda-Start `background.type: 'video'` mit externen `videoUrl`s in stabile Gradient-/Image-Fallbacks umwandeln.
   - Voiceover und Hintergrundmusik bleiben erhalten, damit der Export weiterhin Audio hat.
   - In `content_config` und Webhook-`customData` markieren, dass der stabile Render-Pfad genutzt wurde.

3. **Lambda-Start-Tracking robuster machen**
   - In `render-with-remotion` den Pending-Render nicht 10 Minuten „blind“ laufen lassen, wenn keine echte Remotion-ID zurückkommt.
   - Nach dem Lambda-Start klar speichern: `lambda_start_requested`, `lambda_start_status`, `tracking_mode`, `real_remotion_render_id` wenn vorhanden.
   - Wenn der Startprozess selbst keine Render-ID liefert, den Job früh und verständlich als `lambda_start_failed` markieren und Credits idempotent erstatten, statt erst nach 600s Timeout.

4. **Polling-Timeout präzisieren**
   - In `check-remotion-progress` unterscheiden zwischen:
     - `start_failed`: keine echte Render-ID und kein Progress-Artefakt
     - `lambda-runtime-timeout`: Render läuft, aber überschreitet Laufzeit
   - Die Nutzerfehlermeldung entsprechend klarer machen.

5. **Deploy & Verifikation**
   - Betroffene Funktionen deployen: `render-with-remotion`, `check-remotion-progress`, optional `remotion-webhook` falls CustomData/Fehlerklassifizierung angepasst wird.
   - Danach einen neuen Render prüfen: keine roten Diagnose-Logs mehr, kein 10-Minuten-Blindlauf ohne echte Render-ID, Credits bei Fehlern genau einmal zurückgebucht.

## Erwartetes Ergebnis

Die roten Console-Einträge verschwinden, und der echte Render-Fehler wird nicht mehr als unklarer 600s-Timeout behandelt. Entweder startet Remotion sauber mit echter Render-ID, oder der Start bricht früh mit verständlicher Meldung und automatischem Refund ab.