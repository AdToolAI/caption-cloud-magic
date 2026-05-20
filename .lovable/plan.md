## Befund

Das ist jetzt nicht mehr der alte 3-Charakter-Fehler. Der aktuelle Fehler ist konkret:

- Die Szene `2641218f-b9b7-46b5-a56d-2fee61e53389` hat korrekt 2 sichtbare Personen.
- Sync.so lehnt den neuen Segments-Job ab mit: `The segments configuration is invalid.`
- In der Datenbank ist zu sehen, dass unser Payload `segments` enthält, aber wir senden pro Sprecher **voll gepaddete 8s-Spuren** und zusätzlich `audioInput.startTime/endTime` als Crop-Zeiten.
- Laut Sync.so-Doku erwartet die Segments API zwar `segments[].audioInput.refId`, aber Cropping ist nur sinnvoll, wenn die referenzierte Audio-Datei denselben durchgehenden Timeline-Inhalt enthält. Unsere Sprecher-Dateien sind dagegen schon komplette 8s-Timeline-Spuren mit Stille außerhalb der Sprecher-Turns. Das zusätzliche Cropping schneidet besonders bei späteren Segmenten auf eine teilweise stille/verschobene Spur und macht die Segment-Konfiguration ungültig bzw. unbrauchbar.
- Zusätzlich wurde in der letzten Änderung zwar geplant, auf `sync-3` zu wechseln, im Code steht aber weiterhin `model: "lipsync-2-pro"`.

## Plan

### 1. Segments-Payload korrigieren

In `compose-twoshot-lipsync` wird der Segments-Job so geändert, dass er Sync.so-konform ist:

- `input`: ein Video + je Sprecher eine `audio`-Referenz mit `refId`.
- `segments`: nur `startTime`, `endTime`, `audioInput: { refId }`.
- Keine `audioInput.startTime/endTime` Crops mehr für unsere gepaddeten Sprecher-Timeline-Tracks.
- Segmentzeiten werden auf die Scene-Dauer begrenzt und auf kleine Präzision gerundet.

### 2. Modell wirklich auf `sync-3` umstellen

Für Two-Shot/Cinematic-Sync Segments-Jobs wird `model: "sync-3"` gesetzt, weil Sync.so selbst für AI-generierte Videos mit stillen Lippen empfiehlt, dass das Video natürliche Mundbewegung enthalten sollte; `sync-3` ist der robustere aktuelle Pfad.

### 3. Fehlerdiagnose im DB-Status verbessern

Wenn Sync.so wieder ablehnt, speichern wir zusätzlich die tatsächlich gesendeten `model`, `segments_count`, `speaker_ref_count` und eine gekürzte provider error message in `audio_plan.twoshot.syncJobs`, damit wir nicht wieder im Dunkeln debuggen.

### 4. Aktuelle fehlgeschlagene Szene sauber zurücksetzen

Für die aktuelle Szene wird nur der Lip-Sync-State zurückgesetzt:

- `lip_sync_status` löschen/zurück auf pending
- `twoshot_stage` zurück auf `master_clip`
- `clip_error`, `syncJobs`, `heartbeat` entfernen
- bestehender 2-Personen-Clip, Anchor, Sprechertracks und WAV bleiben erhalten

Dadurch wird kein neuer Hailuo-Clip erzeugt; nur der Sync.so-Lip-Sync wird neu gestartet.

### 5. Deploy + Validierung

Nach der Änderung:

- `compose-twoshot-lipsync` und `poll-twoshot-lipsync` deployen
- den Segments-Job gegen die aktuelle Szene neu anstoßen oder für den nächsten Klick vorbereiten
- prüfen, dass der neue Job nicht mehr mit `segments configuration is invalid` abgelehnt wird

## Erwartetes Ergebnis

- Es bleiben genau 2 Charaktere sichtbar.
- Sync.so akzeptiert den Segments-Job.
- Die Dialogsegmente werden zeitlich korrekt dem jeweiligen Sprecher zugeordnet.
- Falls Sync.so danach aus Videoqualität/Face-Gründen scheitert, ist das ein echter Provider-/Input-Fehler mit klarer Diagnose, nicht mehr ein ungültiger API-Payload.