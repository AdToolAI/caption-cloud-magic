Ich habe den aktuellen Fehlerpfad geprüft. Es ist nicht AWS als Hauptursache. Zwei konkrete Bugs sind sichtbar:

1. In `compose-twoshot-audio` werden die per-Speaker WAVs falsch zusammengebaut, weil `sampleBuffers[i]` verwendet wird, obwohl dort auch Pausen eingefügt sind. Dadurch bekommt z. B. Matthew nur eine 0,25s-Pause als Track, und Samuels Track kann Matthews Satz enthalten. Das erklärt exakt: falscher Sprecher, kein Lip-Sync beim zweiten Charakter, dazugedichtetes/kaputtes Audio.
2. Die neue Dialog-Pipeline erzwingt bei Multi-Speaker direkt Sync.so `coords`-Mode. Der aktuelle Job scheitert schon beim ersten Turn mit Sync.so `An unknown error occurred`, obwohl Audio/Video-URLs erreichbar sind. Vorherige erfolgreiche Jobs liefen offenbar ohne diesen harten `coords`-Zwang.

Plan zur Behebung:

1. Per-Speaker Audio korrekt reparieren
   - In `compose-twoshot-audio` die TTS-Samples getrennt von den Pausen speichern.
   - Jede Dialog-Zeile bekommt ihr echtes PCM-Audio, nicht versehentlich eine Pause oder den Satz eines anderen Sprechers.
   - Die erzeugten `track_url` WAVs enthalten dann exakt nur die Sätze dieses Sprechers an den richtigen Zeitpositionen.

2. Alte kaputte Audio-Metadaten sicher erkennen
   - Wenn ein Speaker-Track nur 0,25s Voice enthält, obwohl sein Turn länger ist, wird die Pipeline nicht mehr weitergeschickt.
   - Stattdessen wird sauber abgebrochen und erst nach neu erzeugtem Audio weitergemacht.

3. Sync.so-Dispatch robuster machen
   - Für Multi-Speaker nicht mehr direkt hart mit `coords` starten.
   - Erst `auto_detect:true` mit strengem Turn-Fenster und korrektem isoliertem Sprecher-Audio versuchen.
   - Nur wenn Sync.so scheitert oder kein brauchbarer Output entsteht, einmal auf `coords` fallbacken.
   - Dadurch vermeiden wir den aktuellen Sync.so-`unknown error`, behalten aber eine deterministische Reserve.

4. FaceMap-Persistenz reparieren
   - Wenn `compose-dialog-scene` eine FaceMap neu baut, darf sie danach nicht wieder durch ein älteres `audio_plan` überschrieben werden.
   - Die aktualisierte FaceMap bleibt im Scene-State erhalten, damit Folge-Retries dieselben Koordinaten verwenden.

5. Race-/Mehrfachdispatch absichern
   - `poll-dialog-shots` soll nicht denselben pending Turn mehrfach starten, wenn Cron, Resume und manuelle Trigger gleichzeitig laufen.
   - Ein Turn darf nur einen aktiven Sync.so Job haben.

6. Credits absichern
   - Bei terminal fehlgeschlagenem Dialog-State wird die bestehende Refund-Logik zuverlässig getriggert.
   - Die aktuell kaputte Szene kann danach gezielt zurückgesetzt werden, aber nur mit frisch erzeugtem Audio, nicht mit den fehlerhaften Tracks.

7. Validierung
   - Nach dem Fix die Edge Functions deployen.
   - Den aktuellen Scene-State prüfen: fehlerhafte `dialog_shots`/Audio-Plan nicht blind weiterverwenden.
   - Einen neuen Lip-Sync-Lauf so testen, dass in den Logs sichtbar ist: `audio=ISOLATED`, Matthew-Track > 0,25s, kein mehrfacher Dispatch für denselben Turn, Sync.so nicht direkt im erzwungenen coords-Modus.

Erwartetes Ergebnis:
- Matthew bekommt wieder sein echtes Audio statt einer Pause.
- Samuel bekommt nicht mehr Matthews Satz in seinem Track.
- Sync.so erhält pro Turn sauberes Sprecher-Audio.
- Der aktuelle `unknown error` wird durch weniger brittle Dispatch-Logik reduziert.
- AWS ist dafür nicht zwingend nötig; AWS bleibt nur relevant für späteres perfektes Artlist-Level Final-Stitching/Remuxing.