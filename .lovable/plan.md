Ich habe Sync.so-Doku, aktuelle Logs und unsere Pipeline verglichen. Der aktuelle Fehler ist nicht mehr der alte MP4-Probe-Fehler: Szene `64b2ae86-c70d-4097-ae4e-89570edad884` wird vor Sync.so blockiert mit `plate_target_face_missing_pass_0_speaker_Samuel Dusatko`.

Wichtigster Befund: Sync.so verlangt, dass `frame_number` und `coordinates` aus demselben echten Video-Frame stammen. Unsere Pipeline nimmt die Koordinaten aktuell aus dem Anchor/Kompositionsbild und überträgt sie auf das finale Hailuo-Video. Wenn Hailuo den Bildausschnitt verschiebt/croppt oder Gesichter im Sprecherzeitpunkt nicht sichtbar sind, landen die Koordinaten nicht auf dem Gesicht. Genau das passiert hier.

## Plan

### 1. Sync.so-konforme Face-Selection aus dem echten finalen Video
- Statt bei `coordsMatch=false` sofort hart zu scheitern, verwende die im Face-Gate bereits erkannten Face-Boxes des echten Video-Frames.
- Sortiere erkannte Gesichter links-nach-rechts und mappe sie auf die Sprecher-Slots.
- Ersetze die alten Anchor-Koordinaten durch echte Plate-Koordinaten aus dem validierten Frame.
- Speichere diese korrigierten Koordinaten im `dialog_shots.passes[]`, damit Sync.so `frame_number + coordinates` aus derselben Video-Quelle bekommt.

### 2. Mehrere Referenzframes pro Sprecher testen
- Pro Sprecher nicht nur den Mittel-Frame prüfen, sondern eine kleine sichere Frame-Liste:
  - Turn-Start + kurzer Offset
  - Turn-Mitte
  - Turn-Ende - kurzer Offset
  - optional ±1 Sekunde, wenn das Modell einen besseren Frame vorschlägt
- Wenn ein Frame alle erwarteten Gesichter oder zumindest das Zielgesicht sichtbar hat, wird dieser Frame als Sync.so-Referenz verwendet.
- Wenn wirklich kein Gesicht sichtbar ist, bleibt der Fehler bewusst hart: Dann ist das Quellvideo für Lip-Sync ungeeignet und muss neu gerendert werden.

### 3. Face-Gate-Fehler verständlicher machen
- `plate_target_face_missing...` wird nicht mehr als generischer Lip-Sync-Abbruch angezeigt.
- Neue Meldung: „Im finalen Szene-Video ist das Zielgesicht an der Sprecherstelle nicht sichtbar oder anders positioniert; Koordinaten werden automatisch repariert / Clip muss neu gerendert werden.“
- Dispatch-Logs bekommen zusätzlich `face_repair_source`, `reference_frame_number`, `original_coords`, `repaired_coords`.

### 4. Fake-`repair_audio` entfernen bzw. echt machen
- Der aktuelle Retry-Pfad setzt `repair_audio=true`, aber `compose-dialog-segments` loggt nur „nicht implementiert“ und sendet dieselbe WAV erneut.
- Ich werde diesen nutzlosen Retry entfernen oder durch eine echte timeline-erhaltende WAV-Reparatur ersetzen:
  - keine Lead-In-Trimmung
  - Dauer bleibt identisch zur Szene
  - WAV-Header/PCM wird sauber neu geschrieben
  - Upload einer reparierten Audio-Datei nur für den Retry

### 5. Webhook-State-Maschine stabilisieren
- Wenn ein Pass final scheitert, aber weitere Passes noch pending sind, soll der Webhook sofort den nächsten pending Pass starten statt auf den Watchdog zu warten.
- Der Audio-Mux-Compositor soll starten, sobald alle Passes terminal sind und mindestens ein gültiger Pass fertig ist, statt endlos auf „alle erfolgreich“ zu warten.
- `final_url` wird aus dem letzten erfolgreichen Pass gewählt, nicht blind aus dem letzten Pass.

### 6. UI-Fortschritt für v5 Multi-Pass anzeigen
- Die UI liest aktuell nur `dialog_shots.shots[]`; unsere Sync.so-Pipeline schreibt aber `dialog_shots.passes[]`.
- Ich mappe `passes[]` auf die vorhandene Fortschrittsanzeige, damit du pro Sprecher siehst: pending, running, done, failed.

### 7. Aktuelle Szene nach Deployment sauber neu starten
- Nach den Änderungen wird die betroffene Szene `64b2ae86-c70d-4097-ae4e-89570edad884` zurückgesetzt, damit sie mit echter Plate-Face-Reparatur neu startet.
- Danach prüfe ich Logs: Erst Face-Gate, dann Sync.so-Dispatch, dann Webhook/Fan-In-Mux.

## Betroffene Dateien
- `supabase/functions/compose-dialog-segments/index.ts`
- `supabase/functions/_shared/syncso-preflight.ts`
- `supabase/functions/sync-so-webhook/index.ts`
- `supabase/functions/reset-lipsync-scene/index.ts` falls Reset stale Face-Reparaturen löschen muss
- `src/components/video-composer/SceneClipProgress.tsx`

## Erwartetes Ergebnis
- Sync.so bekommt Koordinaten nach offizieller Anleitung: echte Frame-Nummer + echter Punkt auf dem Gesicht aus genau diesem Frame.
- Szenen mit verschobenem Hailuo-Crop werden automatisch repariert statt sofort abzubrechen.
- Szenen ohne sichtbare Gesichter scheitern früh mit klarer Ursache, ohne Credits bei Sync.so zu verbrennen.
- Multi-Speaker-Retry und Webhook-Fortschritt laufen deterministischer und hängen nicht mehr im Zwischenstatus.