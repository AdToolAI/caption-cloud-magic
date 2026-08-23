# V461 — Provider Dispatch Parity + v400 Face-Gate Restoration

Zweistufiges Gate. Stufe 1 ist strikt read-only und beantwortet die Kausalitätsfrage. Erst danach der enge Code-Fix. Kein neuer S01-Lauf vor Abschluss von Stufe 1. Motion-Schwellen bleiben eingefroren.

## Was die Vorprüfung bereits gezeigt hat

Beim Sichten des Dispatch-Logs für Szene `be60d106…a6c` ist ein Befund aufgetaucht, der die Hypothese B direkt betrifft:

- Für Turn 0 existieren **zwei** Dispatches. Der erste (`915a6167…`) lief auf `bbox-url-pro` — und wurde bereits als `sync_completed_noop` mit `delta_mean = −16.08` beendet. Erst danach kam die Eskalation auf `coords-pro-box` (`1a67e56e…`, `delta_mean = −29.04`).
- Damit ist `bbox-url-pro` bei Turn 0 **nicht** erfolgreich gewesen. Die Zählung „4/4 bbox-url-pro erfolgreich vs. 3/3 coords-pro-box NOOP" aus V460 basierte auf den Endzuständen der Passes, nicht auf allen Dispatch-Versuchen. Die Variante ist damit als alleinige Ursache stark entwertet — der Confounder, den du vermutet hast, ist real.
- Die gespeicherten `provider_input_fingerprint`-Objekte beider Turn-0-Dispatches sind bis auf zwei Punkte identisch: gleicher `video.url_hash` (`1989e902d219`), gleiches Audio-Asset (`1e94559f5c39`), gleiches Modell, gleiche Dauer/FPS. Unterschiedlich sind nur (a) ASD-Transport `bounding_boxes_url` → inline `bounding_boxes` und (b) `audio.normalized` false → true bei gleichzeitig `voiced_end_sec: null`.
- Der Telemetrie-Nebenbefund ist bestätigt und schlimmer als gedacht: `video.width/height` steht bei allen Preclip-Dispatches auf `1284×718` und `video.bytes` konstant auf dem Plate-Wert, obwohl die realen Preclips 720×720 sind. Grund: die Fingerprint-Felder greifen auf eine Plate-Probe zurück, wenn `pass.preclip_dims` fehlt. Nur `url_hash`, `frame_count` und `duration_sec` variieren pro Turn.
- Ein harter Face-Share-Floor existiert im aktuellen Dispatch-Pfad **nicht**. `preclip_face_share` wird berechnet und protokolliert, aber nirgends als Gate ausgewertet — deshalb konnte Pass 4 mit 0.218 an den Provider gehen.

## Stufe 1 — Read-only Payload-/Asset-Parität (kein Code-Change)

Ziel: beweisen, welches Asset tatsächlich an Sync.so ging, und ob sich die beiden Rungs außer in der Face-Selection-Methode unterscheiden.

1. Vollständige Dispatch-Matrix aller Turns dieses Runs aufziehen: pro Versuch Variante, Verdikt, `delta_mean`, ASD-Transport, Audio-Asset, `url_hash`. Damit wird die Variantenkorrelation sauber neu ausgezählt (Versuche statt Endzustände).
2. Asset-Identität hart nachweisen: die eingefrorenen Preclip-Objekte und das Plate-Objekt aus dem Storage laden, echte Byte-Größe, Auflösung, Framecount und SHA-256 berechnen, und die `url_hash`-Werte des Fingerprints gegen die tatsächlich signierten Preclip-URLs rekonstruieren. Ergebnis muss eindeutig sein: Preclip oder Plate.
3. Audio-Parität prüfen: die beiden Turn-0-Audio-Assets vergleichen (gleicher Hash, aber `normalized` unterschiedlich markiert) und feststellen, ob der Eskalationsversuch tatsächlich dieselben Samples oder eine andere Datei bekam.
4. Bounding-Box-Parität prüfen: die per URL hochgeladene Box-Sequenz gegen die inline mitgesendeten Boxen des Eskalationsversuchs stellen — gleiche Frameanzahl, gleiche Koordinaten, gleicher Koordinatenraum.
5. Gegenprobe über andere Szenen: alle `coords-pro-box`- und `bbox-url-pro`-Dispatches der letzten Wochen nach Verdikt gruppieren, um zu sehen, ob die Rung unabhängig von diesem einen Run auffällig ist.

Ergebnis von Stufe 1 ist ein schriftlicher Befund mit genau einer der drei Antworten aus deinem Entscheidungsbaum.

## Stufe 2 — Code-Fix (erst nach Freigabe des Stufe-1-Befunds)

**A. v400-Face-Gate wieder hart machen.** Vor jedem Provider-Dispatch wird geprüft: `face_share ≥ 0.24`, Face-Dimensionen über dem Floor, Mund-Anker vertrauenswürdig (kein reiner Pose-Estimate ohne Detektion), Mund innerhalb des Crops. Bei Verstoß bricht der Pass **vor** Sync.so mit einem eigenen, verständlichen Preclip-/Face-Gate-Fehler ab. Keine NOOP-Ladder für einen Input, der den Eingangsvertrag bereits verletzt. Der Fehler ist als Kontraktbruch klassifiziert (nicht als Provider-Noop) und löst den regulären Euro-Refund aus.

**B. Rung-Entscheidung nach Stufe-1-Befund**, ohne die Motion-Schwellen anzufassen:
- Gleicher Input, nur Selection-Methode verschieden → `coords-pro-box` aus der NOOP-Ladder nehmen, `bbox-url-pro` als kanonischer Pfad.
- Unterschiedliche Assets/Pointer → Asset-Contract reparieren statt Provider-Koordinaten zu kalibrieren.
- Payloads identisch und trotzdem nur eine Rung scheitert → ebenfalls Rückfall auf den funktionierenden Pfad, keine weitere Eskalation.
- Falls Stufe 1 zeigt, dass beide Rungs gleich häufig scheitern (was der Turn-0-Befund nahelegt), wird die Ladder gar nicht umgebaut, sondern die NOOP-Eskalation auf maximal einen Wiederholversuch begrenzt und der Fokus auf die Ursache im Preclip/Audio verschoben.

**C. Telemetrie-Reparatur (klein, aber Voraussetzung für jede weitere Forensik).** Der Fingerprint muss die real gesendete Datei beschreiben: Bytes, Auflösung und Content-Type werden aus der Probe des Dispatch-Assets gezogen, nicht aus einer Plate-Probe, und der Preclip-Objektpfad wird unsigniert mitprotokolliert, damit `url_hash` nachvollziehbar bleibt.

## Technische Details

- Read-only-Quellen Stufe 1: `syncso_dispatch_log` (inkl. `meta.provider_input_fingerprint`), `composer_scenes.dialog_shots->'passes'`, Storage-Buckets `lipsync-plates` und `ai-videos`.
- Betroffene Dateien in Stufe 2: `supabase/functions/compose-dialog-segments/index.ts` (Gate vor dem Dispatch, Fingerprint-Felder um Zeile 8231–8300), `supabase/functions/_shared/pass-face-preclip.ts` (Face-Share-/Anker-Vertrauenssignale), `supabase/functions/sync-so-webhook/index.ts` (Ladder-Rungs, Zeilen um 1495/1616), `supabase/functions/_shared/asd-strategy.ts` (nur falls eine Rung entfällt).
- Neue Regressionstests: Face-Gate-Matrix (0.218 muss blocken, 0.306 muss passieren, fehlender Mundanker muss blocken) und ein Fingerprint-Test, der Plate-Dimensionen auf einem Preclip-Dispatch verbietet.
- Eingefroren und nicht Teil dieses Gates: alle Motion-Schwellen, der Motion-Detector selbst, die Provider-Zertifizierung.
