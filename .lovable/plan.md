Ich habe die Logs geprüft: Der Backend-Status ist gesund, der Fehler kommt aus `compose-twoshot-lipsync` bei Szene `ab0b0a8e-...`.

Befund:
- Es ist ein Two-Shot/Dialog mit 2 Sprechern konfiguriert.
- Das gerenderte Video zeigt aber offenbar nur eine erkennbare Person bzw. keine zuverlässig erkannten 2 Gesichter.
- Die Funktion fällt dann aktuell auf Heuristik-Koordinaten zurück (`[384, 360]`), schickt diese an Sync.so als festes Gesichtsziel, und Sync.so bricht mit `An error occurred in the generation pipeline` ab.
- Die reservierten 126 Credits wurden bereits automatisch erstattet.

Plan zur Behebung:

1. Two-Shot-Lip-Sync robuster machen
   - In `compose-twoshot-lipsync` bei fehlender/ungenügender Face-Detection keine künstlichen Heuristik-Koordinaten mehr an Sync.so senden.
   - Stattdessen für diesen Fall auf Auto-Detect oder Single-Face-Lip-Sync umschalten.
   - Konkret: Wenn keine `faceMap` mit mindestens 2 Gesichtern vorhanden ist, wird nicht mehr Multi-Pass mit festem `active_speaker_detection.coordinates` ausgeführt.

2. Sicheren Fallback für „2 Sprecher, aber 1 sichtbares Gesicht“ einbauen
   - Wenn das Video nur eine Person zeigt, soll der Lip-Sync trotzdem funktionieren.
   - Dann wird die gemischte Dialogspur in einem Single-Pass mit `auto_detect: true` verarbeitet, statt zwei einzelne Gesichter erzwingen zu wollen.
   - Ergebnis: Der sichtbare Sprecher bekommt Lip-Sync; es crasht nicht mehr.

3. Fehlerdetails verbessern
   - Sync.so-Fehler werden detaillierter gespeichert, damit wir künftig unterscheiden können zwischen:
     - kein Gesicht erkannt
     - ungültige Zielkoordinaten
     - Provider-Pipelinefehler
     - Timeout

4. Bestehende Szene neu triggerbar machen
   - Nach dem Fix kann die aktuelle fehlgeschlagene Szene erneut über „Lip-Sync neu rendern“ laufen.
   - Die Funktion setzt `lip_sync_status` sauber zurück und erstattet weiterhin automatisch bei externen Fehlern.

5. Validierung
   - Die betroffene Szene mit derselben `scene_id` erneut testen.
   - Prüfen, dass kein erneuter `lipsync_pass_1_failed` Log entsteht.
   - Prüfen, dass `clip_url`, `lip_sync_status='done'` und `twoshot_stage='done'` gesetzt werden oder bei Provider-Ausfall weiterhin korrekt refundet wird.

Technische Kurzfassung:
- Ursache ist nicht das neue Credit-Pricing.
- Ursache ist der neue deterministische Face-Pinning-Pfad bei einem Video ohne zwei zuverlässig erkennbare Gesichter.
- Fix: Face-Pinning nur verwenden, wenn echte Face-Koordinaten vorhanden sind; sonst Single/Auto-Detect-Fallback.