## Aktueller Befund

Do I know what the issue is? **Ja.** Der aktuelle Fehler ist nicht mehr der v66/v67-Bug.

Die Szene `a59a380d-0a79-412d-b5a9-7c2fae262f3d` zeigt:

- `sync_mode=cut_off` ist aktiv.
- Tight-WAV-Slicing funktioniert: alle Passes erzeugen `v39_tight_audio`.
- Der Provider lehnt trotzdem jeden Sprecher-Pass mit `provider_unknown_error` ab.
- Der Payload sendet weiterhin die komplette 4-Gesichter-Scene-Plate an Sync.so und versucht per `active_speaker_detection` nur ein Gesicht zu targeten.
- Zusätzlich bleibt die Szene fälschlich auf `lip_sync_status=running`, weil ein erschöpfter Pass im State noch als `retrying` zählt.

Warum es früher funktioniert hat: Der stabilere alte Pfad hat pro Sprecher zuerst einen **Single-Face-Crop/Preclip** gerendert, sodass Sync.so nur ein Gesicht sieht. Der neue v5-Fanout-Pfad nutzt zwar Face-Mask-Overlay am Ende, sendet aber beim Provider-Call wieder die volle 4-Personen-Plate. Bei 4 Personen ist genau das instabil.

## Plan

1. **4-Personen-Pfad auf Single-Face-Input zurückführen**
   - In `compose-dialog-segments` für `speakers.length >= 3` nicht mehr die komplette Scene-Plate direkt an Sync.so senden.
   - Stattdessen pro Pass aus den vorhandenen FaceMap-Koordinaten/BBox eine isolierte Face-Crop-Preclip-Quelle verwenden bzw. dispatchen.
   - Sync.so bekommt dann pro Sprecher wieder nur ein Gesicht, nicht alle vier.

2. **Payload für Face-Crop-Passes vereinfachen**
   - Bei Face-Crop-Input `active_speaker_detection` auf `auto_detect: true` setzen oder ganz minimal halten, weil der Crop nur ein Gesicht enthält.
   - Keine master-space Koordinaten in den 512x512 Crop-Payload schicken.
   - `sync_mode=cut_off` und Tight-Audio bleiben unverändert.

3. **Finales Compositing kompatibel halten**
   - `render-sync-segments-audio-mux` so erweitern, dass erledigte Face-Crop-Passes über `crop` statt Full-Frame-`faceMask` zurück in die Original-Plate gelegt werden können.
   - Der bestehende Full-Frame-Mask-Pfad bleibt für 1–2 Sprecher unverändert.

4. **Stuck-State-Fix im Webhook**
   - In `sync-so-webhook` erschöpfte `retrying`-Passes nicht mehr als „alive“ zählen.
   - Wenn alle 3+/4 Sprecher terminal fehlgeschlagen sind, Szene sauber auf `failed` setzen und Credits idempotent refundieren.
   - Dadurch bleibt der UI-Status nicht mehr endlos auf `running`.

5. **Dokumentation/Frozen Invariant aktualisieren**
   - Neue Memory `v68-4speaker-single-face-preclip` ergänzen.
   - Regel festhalten: Bei 3+ Sprechern darf Sync.so nicht mehr die volle Multi-Face-Plate als Input bekommen; Provider-Input muss speaker-isoliert sein.

6. **Validierung**
   - Mit derselben Szene prüfen, dass Pass 1–4 jetzt mit Single-Face-Input dispatchen.
   - Danach Logs prüfen: keine `provider_unknown_error`-Retry-Ladder mehr, alle Passes `done`, anschließend Audio-Mux.
   - Zusätzlich prüfen, dass fehlgeschlagene Alt-Szenen nicht mehr als `running` hängen bleiben.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>