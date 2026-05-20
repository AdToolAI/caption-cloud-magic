## Befund

Der aktuelle Fehler ist dieselbe Szene `cb2b149d-a926-48c5-8589-e3c590faface` aus deinem Screenshot. Sie ist nicht nur „hängengeblieben“, sondern Sync.so hat **Pass 1 dreimal hintereinander** mit `generation_pipeline_failed` abgelehnt:

- Quellvideo ist technisch ok: MP4/H.264, **1376×768**, 10.125s.
- Audio ist technisch ok: WAV/PCM 44.1kHz mono, 8s.
- FaceMap ist vorhanden: links `[358,215]`, rechts `[1018,223]`.
- Fehler passiert bei Pass 1 mit `active_speaker_detection.coordinates=[358,215]`.

Damit ist die reine Retry-Logik nicht genug: Wenn Sync.so denselben Input 3× ablehnt, ist die Anfrage für diesen Clip wahrscheinlich **deterministisch problematisch**. Der Hauptverdacht ist der aktuelle Two-Pass-Ansatz mit **nur einem Punkt-Koordinatenziel auf Frame 0**. Laut Sync.so-Doku müssen Koordinaten exakt zum extrahierten Frame passen; robuster ist bei eigener Detection die Übergabe von `bounding_boxes` statt nur `coordinates`.

## Ziel

Der Kunde soll keinen rohen Sync.so-Fehler mehr bekommen. Die Pipeline soll bei Provider-/Targeting-Problemen automatisch auf eine stabilere Strategie umschalten und erst dann sichtbar fehlschlagen, wenn der Quellclip selbst ungeeignet ist.

## Umsetzung

### 1. Sync.so Speaker Selection robuster machen

In `compose-twoshot-lipsync` und `poll-twoshot-lipsync` wird der Sync.so-Request geändert:

- Primär nicht mehr nur `coordinates` senden.
- Wenn `faceBbox` vorhanden ist, `options.active_speaker_detection.bounding_boxes` für Frame 0 senden.
- `frame_number`/`coordinates` nur noch als Fallback nutzen, wenn keine Box vorhanden ist.
- FaceMap-Dimensionen werden gegen echte MP4-Dimensionen validiert; wenn sie nicht passen, werden BBox/Center sauber skaliert.

Warum: Sync.so dokumentiert `bounding_boxes` explizit als robusteren Weg, wenn eigene Face-Detection vorhanden ist.

### 2. Pass-Order/Faces absichern

Aktuell wird Pass 1 nach `character_shots` sortiert, aber das kann bei Szene/Prompt/FaceMap in der Praxis Matthew auf das linke Gesicht pinnen, obwohl Matthew im Clip rechts steht. Das kann Sync.so intern destabilisieren oder den falschen Mund animieren.

Ich ergänze eine defensive Zuordnung:

- Wenn Cast-Positionen/Faces nicht eindeutig sind, wird nicht blind `passIndex -> left/right` verwendet.
- Die Pipeline prüft, ob Speaker-Name/Character-Shot visuell zur Face-Seite passt, soweit Metadaten vorhanden sind.
- Falls unklar: sichere Reihenfolge aus FaceMap + CharacterShot-Position statt zufälliger Track-Reihenfolge.

### 3. Nach endgültigem Sync.so-Pass-Fail automatisch auf sicheren Fallback wechseln

Wenn ein Two-Pass-Job nach Retries wieder `generation_pipeline_failed` liefert:

- Nicht sofort endgültig `failed` für den Kunden.
- Stattdessen automatisch eine zweite Strategie starten:
  - gleicher Clip,
  - merged dialogue audio,
  - Sync.so `auto_detect=true`,
  - `sync_mode=cut_off`,
  - markiert als `fallback: auto_detect_single_pass`.

Wenn dieser Fallback klappt, wird die Szene als `done` gespeichert und die gemischte externe Dialogspur bleibt aktiv (`useExternalAudio=true`).

Wenn auch dieser Fallback scheitert, wird sauber refundet und die UI bekommt eine verständliche Meldung: Quellclip neu rendern, weil der Provider diesen Clip nicht lipsyncen kann.

### 4. Watchdog darf keine finalen Provider-Fails verstecken

Der `twoshot-lipsync-watchdog` bleibt als Server-Sicherheit aktiv, bekommt aber klarere Regeln:

- laufende Jobs weiter pollen,
- Retry/Fallback-Status nicht als „tot“ markieren,
- nur wirklich stale Jobs nach Timeout beenden,
- Fehlermeldungen mit `fallback_attempted`, `final_provider_failed`, `source_clip_unusable` speichern.

### 5. UI-Auto-Retry für genau diesen Fehler erlauben

`useTwoShotAutoTrigger` wird erweitert:

- `syncso_failed`, `syncso_rejected`, `syncso_canceled`, `generation_pipeline_failed` gelten als recoverable, solange noch kein Fallback versucht wurde.
- Kein Endlosloop: pro Szene nur eine automatische Recovery-Runde.
- Der Progress-Balken zeigt während Retry/Fallback weiter „läuft“, nicht 95%-Stillstand.

### 6. Aktuelle Szene reparieren

Nach der Code-Härtung setze ich die aktuelle Szene zurück:

- `lip_sync_status = pending`
- `twoshot_stage = null`
- `clip_error = auto-retry: hardened sync.so fallback`
- `replicate_prediction_id = null`

Dann kann die neue Pipeline dieselbe Szene erneut verarbeiten.

## Nicht im Scope

- Kein Umbau der Voiceover-Erzeugung.
- Kein Wechsel von Sync.so zu einem anderen Anbieter.
- Kein Pricing-Änderung.
- Kein Render-/Export-Umbau.

## Erwartetes Ergebnis

Die Pipeline wird nicht „fehlerfrei“ im Sinne von „Provider kann niemals fehlschlagen“ — das kann kein externer KI-Anbieter garantieren. Aber sie wird produktionsstabiler:

- transienter Sync.so-Fehler → Retry,
- deterministischer Face-Targeting-Fehler → anderer Targeting-Modus/BBox,
- weiterhin fehlerhaft → Auto-Detect-Fallback,
- final unmöglich → Refund + verständliche Meldung statt 95%-Hänger oder roher Provider-Fehler.