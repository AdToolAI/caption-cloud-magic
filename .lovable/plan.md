Der Fehler ist jetzt konkret identifiziert: Die aktuelle v5-Funktion sendet `options.activeSpeakerDetection`, Sync.so akzeptiert aber nur `options.active_speaker_detection`. Deshalb kommt der 422-Fehler `Invalid generation options: property activeSpeakerDetection does not exist` und die App zeigt nur generisch „Edge Function returned a non-2xx status code“.

Do I know what the issue is? Ja: Es ist kein Secret-, Timing- oder v4/v5-Routing-Problem. Es ist ein API-Schema-Fehler im neuen Face-Targeting-Patch.

Plan:

1. `compose-dialog-segments` korrigieren
   - Das ungültige camelCase-Feld `activeSpeakerDetection` entfernen.
   - Auf das offizielle Sync.so-Feld `active_speaker_detection` wechseln.
   - Nicht mehr unsupported `options` pro Segment senden.

2. Multi-Speaker trotzdem in einem v5-Call erhalten
   - Aus der vorhandenen `audio_plan.twoshot.faceMap` die Face-Bounding-Boxes pro Charakter nutzen.
   - Für Sync.so eine top-level `active_speaker_detection.bounding_boxes`-Sequenz erzeugen: Frames innerhalb eines Sprecher-Segments bekommen die Box des aktiven Sprechers.
   - Dadurch bleibt es bei einem einzigen Sync.so Segments-Call, aber jeder Sprecher steuert das richtige Gesicht.

3. Fehlerausgabe verbessern
   - Die UI/Toast-Meldung soll den echten Backend-Fehler anzeigen, nicht nur „Edge Function returned a non-2xx status code“.
   - Für diesen Fall würde dann z. B. sichtbar: `syncso_dispatch_failed 422: Invalid generation options...`.

4. Betroffene Szene zurücksetzbar machen
   - Die aktuell fehlgeschlagene Szene `7755034f-...` wurde bereits refundet und steht auf `lip_sync_status=failed`.
   - Nach dem Code-Fix kann sie über „Lip-Sync neu rendern“ sauber erneut mit v5 gestartet werden; falls nötig setze ich nur diesen Fehlerzustand zurück, ohne andere Szenen anzufassen.

5. Validierung
   - Edge Function neu deployen.
   - Mit derselben Szene einen Test-Call ausführen.
   - Erwartetes Ergebnis: kein 422 mehr, sondern ein Sync.so `job_id` und `dialog_shots.version=5`, `engine=sync-segments`, `status=rendering`.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>
<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>