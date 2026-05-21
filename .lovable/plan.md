## Ursache

Ja — wir sollten die Ursache beheben. Die aktuelle Verschlechterung kommt nicht daher, dass Sync.so „einfach manchmal crasht“, sondern aus zwei konkreten Implementierungsfehlern:

1. **Falsche Character-to-Face-Zuordnung**
   - In der betroffenen Szene ist `character_shots`:
     - `matthew-dusatko` = Position 0
     - `samuel-dusatko` = Position 1
   - Die FaceMap ist aber nur geometrisch:
     - links = Gesicht 1
     - rechts = Gesicht 2
   - Der Code sortiert die Speaker nach `character_shots` und mapped dann stumpf:
     - Pass 1 → linkes Gesicht
     - Pass 2 → rechtes Gesicht
   - Dadurch wurde Matthew mit der **linken** BBox gesendet, obwohl Matthew sehr wahrscheinlich rechts steht. Das kann Sync.so mit `An unknown error occurred` / `generation_pipeline_failed` crashen lassen.

2. **Ungültige `bounding_boxes`-Payload**
   - Sync.so-Doku sagt: `bounding_boxes` ist ein **per-frame array** über das Video.
   - Unser Code sendet aktuell nur `bounding_boxes: [[x1,y1,x2,y2]]` als Einzelbox.
   - Für eine manuelle Auswahl auf einem Frame ist laut Doku robuster/korrekter:
     - `frame_number: 0`
     - `coordinates: [x, y]`
   - Das erklärt, warum der Provider generisch scheitert, obwohl Gesichter vorhanden sind.

Der anschließende `auto_detect_single_pass`-Fallback hat das Symptom verschlimmert, weil er den kompletten gemischten Dialog auf ein automatisch gewähltes Gesicht legt. Deshalb spricht dann ein Charakter plötzlich alle Zeilen.

## Plan zur echten Behebung

### 1. Character-to-Face-Mapping explizit machen

In `compose-twoshot-lipsync`:

- Neue Mapping-Funktion `resolveSpeakerFaceTarget(speaker, faceMap, character_shots)`.
- Wenn `character_shots` zwei Charaktere enthält, wird die Face-Seite daraus stabil abgeleitet:
  - Position 0 = linkes Gesicht
  - Position 1 = rechtes Gesicht
- Wichtig: Die Speaker-Reihenfolge wird nicht mehr dafür benutzt, implizit links/rechts zu bestimmen.
- Jeder Job speichert künftig zusätzlich:
  - `speakerCharacterId`
  - `resolvedFaceSide`
  - `mappingSource: "character_shots" | "fallback_order"`

Damit kann Matthew nicht mehr versehentlich auf Samuels Gesicht geschickt werden.

### 2. Sync.so Speaker Selection Payload korrigieren

In `compose-twoshot-lipsync` und `poll-twoshot-lipsync`:

- Standard für Two-Shot Face Targeting wird auf die dokumentierte Variante geändert:

```json
"active_speaker_detection": {
  "auto_detect": false,
  "frame_number": 0,
  "coordinates": [x, y]
}
```

- `bounding_boxes` wird nicht mehr aus einer Einzelbox gesendet.
- Nur wenn später echte per-frame Boxen existieren, darf `bounding_boxes` wieder verwendet werden.
- Die BBox bleibt nur als Debug-Metadatum im Job gespeichert, nicht als API-Payload.

### 3. Short-Utterance-Fix entschärfen

- `segments_secs` bleibt nur optional für sehr kurze Clips, aber:
  - Der Segment-Window wird **nur auf Audio** angewendet, nicht gleichzeitig auf Video, falls Sync.so dadurch die Sprecher-Auswahl destabilisiert.
  - Wenn Sync.so Segments ablehnt, retry ohne Segments, aber weiterhin mit korrekten `coordinates`.

Ziel: „Was denn?“ wird erkannt, ohne dass die Video-Timeline oder Face-Auswahl beschädigt wird.

### 4. Destruktiven Single-Pass-Fallback entfernen

In `poll-twoshot-lipsync`:

- `auto_detect_single_pass` mit gemischtem Audio wird entfernt.
- Kein globaler Merge-Audio-Fallback mehr bei zwei sichtbaren Sprechern.
- Wenn ein Pass scheitert:
  - erst Retry mit korrekten Coordinates,
  - dann einmal Retry mit `auto_detect:true`, aber weiterhin **nur mit dem isolierten Speaker-Track**,
  - wenn das auch scheitert: sauberer Refund + klare Fehlermeldung statt falscher Mundbewegung.

### 5. Aktuelle Szene sauber zurücksetzen

Nach Deploy:

- Szene `e3df41ad-aaa1-4659-85c2-0630e458dd52` wird aus dem schlechten Fallback-Output geholt.
- `clip_url` wird wieder auf den originalen Quellclip gesetzt.
- `lip_sync_status = pending`, `twoshot_stage = null`, `replicate_prediction_id = null`.
- Der unbrauchbare Fallback-Render wird erstattet.
- Danach läuft der Lip-Sync neu mit korrektem Mapping und korrektem Sync.so-Request.

## Erwartetes Ergebnis

- Sync.so bekommt keine falsch formatierte BBox-Payload mehr.
- Jeder Sprecher wird auf sein tatsächlich zugeordnetes Gesicht geschickt.
- Es gibt keinen Output mehr, in dem ein Charakter die Zeilen des anderen spricht.
- Wenn Sync.so trotzdem ablehnt, endet die Szene kontrolliert mit Refund und neu-render-CTA, statt einen kaputten Clip als „done“ zu speichern.