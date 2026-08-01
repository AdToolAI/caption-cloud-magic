## Befund (verifiziert am laufenden Run)

Szene `6bf4e815…`, Pass 1/4 ist fertig (`done`, Output vorhanden). Pass 2 hängt seit ~21:59 auf `rendering_preflight`, ohne `job_id`; der Dispatch-Lock läuft bis 22:10.

Die Logs von `compose-dialog-segments` zeigen die Ursache eindeutig:

```text
22:03:02  v163_preclip_render START  speaker=Matthew Dusatko window=[1.13,3.16]
22:03:04  [face-detect/aws] rekognition primary plate=1928x1076 frames=1
22:03:05  [face-detect/aws] rekognition ok ... ms=1033
22:03:06  ERROR Memory limit exceeded
22:03:06  shutdown
```

Der Worker stirbt also **im v359-Plate-Tracker**, bevor der eigentliche Lambda-Preclip und Sync.so überhaupt drankommen. v363 hat den Tracker nur auf 3 Stützbilder begrenzt — der Speicher reißt aber schon bei 2–3 Bildern, weil jedes Still in **voller Plate-Größe (1928 px)** gerendert, komplett heruntergeladen und für Rekognition base64-kodiert wird. Ein hart abgeschossener Worker kann nichts aufräumen, deshalb bleibt `rendering_preflight` + Lock stehen, und der v362-Watchdog startet exakt denselben Absturz erneut → sichtbarer Dauer-Hänger bei "Clip 2".

## Plan v364

### 1. Tracker speicherfest machen
- `_shared/aws-frame-probe.ts`: Stills auf eine maximale Kantenlänge (960 px) deckeln, statt die Plate-Auflösung 1:1 zu rendern.
- `_shared/face-track.ts`:
  - Stills strikt **sequenziell** rendern und auswerten (kein `Promise.all`), jede Referenz nach der Auswertung freigeben.
  - Boxen über den bestehenden Koordinatenvertrag (`rek-image-space.ts`, v361) aus dem verkleinerten Detektionsraum zurück in den Plate-Raum projizieren — keine neue Rechenlogik, nur korrekter Zielraum.
  - Die Verdichtungs-Runde (`planDensifyTimestamps`) nur noch laufen lassen, wenn Zeit- **und** Sample-Budget es zulassen (max. 1 Zusatzbild).

### 2. Crash-Loop-Breaker (das eigentlich Wichtige)
- Vor dem Tracker wird pro Pass ein Marker gesetzt (`plate_track_attempted_at`); nach erfolgreichem Preclip wieder entfernt.
- Findet ein neuer Lauf diesen Marker vor (= letzter Versuch ist mitten im Tracking gestorben), wird der Tracker **übersprungen** und der Preclip statisch gerendert (Verhalten wie vor v359). Damit läuft jeder Pass spätestens im zweiten Anlauf durch, statt endlos denselben OOM zu wiederholen.
- `lipsync-watchdog` zählt Preflight-Recoveries pro Pass mit und markiert den Pass beim Reset als `plate_track_disabled`.

### 3. Aktuellen Hänger auflösen
- Lock für `6bf4e815…` freigeben, Pass 2 auf `pending` mit gesetztem `plate_track_disabled` zurücksetzen und einen sauberen Re-Dispatch anstoßen, damit die Szene ohne Neustart weiterläuft.

### 4. Verifikation
- Logs verfolgen bis `v163_preclip_render OK` für Pass 2, danach ein Sync.so-`job_id` für Pass 2/4.
- Kein `Memory limit exceeded` mehr in `compose-dialog-segments`.
- Szene erreicht `syncso_fanout_4_of_4` und den Mux.

### Technischer Hinweis
Der Tracker bleibt optional und rein qualitätssteigernd; er darf ab v364 unter keinen Umständen den Dispatch verhindern. Alle bestehenden Gates (v355 Pixel-Face-Contract, v356 Outcome-Gate, v361 Koordinatenvertrag) bleiben unverändert.
