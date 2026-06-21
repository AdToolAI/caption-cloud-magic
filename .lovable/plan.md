## Diagnose

Du hast recht: Das ist kein Grund für einen Modellwechsel. Die saubere Lösung ist im `sync-3`-Targeting selbst.

Die entscheidenden Findings:

1. **Produktiv läuft noch v156**
   - Logs zeigen `WIRE_PAYLOAD version=v156`, nicht v157.
   - Dadurch lief die v157-Tight-Mouth-Box im echten Test gar nicht zuverlässig/gar nicht produktiv.

2. **Persisted/Advance-Pässe verlieren Mouth-Landmarks**
   - Pass 2–4 laufen als `advance=true` mit `plate_hydration source=persisted`.
   - Dabei werden aktuell nur gespeicherte `bboxes` rehydriert, aber nicht `mouth`.
   - Ergebnis: `speakerPlateMouths` bleibt `null`, und der Dispatcher fällt auf eine schlechtere Bbox-Ankerung zurück.

3. **Sync.so-Dokumentation bestätigt den richtigen Weg**
   - Für Multi-Person-Video ist `sync-3` mit `active_speaker_detection.bounding_boxes_url` korrekt.
   - `bounding_boxes_url` muss eine JSON mit `bounding_boxes` pro Frame enthalten, `null` außerhalb sichtbarer/aktiver Frames.
   - Wir bleiben also genau auf diesem Pfad.

4. **Wichtiger tiefer Bug: Anchor-First Koordinatenraum**
   - AWS Rekognition liefert normalisierte Koordinaten relativ zum **Anchor-Bild**.
   - Der Code skaliert sie aber direkt auf **Plate-Dimensionen**.
   - Wenn Anchor und Plate unterschiedliche Aspect Ratios haben, landen Face- und Mouth-Koordinaten verschoben. Das erklärt Morphs bei allen Sprechern.

5. **Mouth-Landmark Auswahl ist zu unpräzise**
   - AWS liefert `mouthLeft`, `mouthRight`, `mouthDown`.
   - Aktuell wird das erste gefundene Mouth-Landmark genommen; API-Reihenfolge ist nicht garantiert.
   - Für Sync-3 sollte bevorzugt `mouthDown` oder der Mittelpunkt aus left/right verwendet werden.

6. **Per-frame JSON timing ist grundsätzlich korrekt, aber hard-coded FPS ist riskant**
   - Die aktuelle JSON hat 243 Frames und `null` außerhalb der Sprecherfenster.
   - Aber der Code nutzt intern 24fps, während Mux/Render auf 30fps läuft. Das kann bei manchen Sync.so-Auswertungen zu leichtem Timing-Drift führen.

## Plan: v158 sync-3 sauber stabilisieren

### 1. Deployed Version eindeutig machen
- `COMPOSE_DIALOG_SEGMENTS_VERSION` auf `v158` bumpen.
- Boot-/Dispatch-Logs so setzen, dass wir sicher sehen:
  - `BOOT version=v158`
  - `WIRE_PAYLOAD version=v158`
  - `v158_sync3_face_target_box` pro Pass.
- Edge Function `compose-dialog-segments` nach der Änderung deployen.

### 2. Mouth-Landmarks über Persistenz korrekt erhalten
- `SegmentsState.plate_identity` um gespeicherte Mouth-Daten erweitern oder vorhandene `faces[].mouth` konsequent nutzen.
- Im persisted hydration branch:
  - `speakerPlateBboxes[i]` wie bisher setzen.
  - zusätzlich `speakerPlateMouths[i]` aus `persistedPlateIdentity.faces[i].mouth` setzen.
  - `speakerCoords[i]` bevorzugt auf Mouth setzen, nicht Bbox-Center.
- Dadurch bekommen Pass 1–4 dieselben präzisen Mouth-Anker.

### 3. AWS Mouth-Landmark Auswahl reparieren
- In `_shared/face-detect-mediapipe.ts`:
  - `mouthDown` bevorzugen.
  - Falls kein `mouthDown`: Mittelpunkt aus `mouthLeft` + `mouthRight`.
  - Erst danach Fallback auf einzelnes Mouth-Landmark.
- Ziel: Sync-3 bekommt einen stabilen Mund-/Lower-face-Anker, keinen zufälligen Mundwinkel.

### 4. Anchor-First Koordinatenraum korrigieren
- In `_shared/plate-face-detect.ts` / AWS-Aufruf:
  - Anchor-Bilddimensionen ermitteln oder die AWS-normalisierten Koordinaten bewusst als Anchor-Space behandeln.
  - Dann korrekt auf Plate-Space mappen.
- Wenn Anchor und Plate dieselbe komponierte Szene darstellen, aber unterschiedliche Pixelmaße haben:
  - `x = normalizedX * plateWidth`
  - `y = normalizedY * plateHeight`
  bleibt nur dann korrekt, wenn Aspect/Framing identisch ist.
- Wenn Aspect Ratio abweicht, Hard-Fail oder Live-Plate-Frame-Fallback statt still falsch skalieren.

### 5. Sync-3 bbox-url pro Pass fachlich korrekt bauen
- Weiterhin `bounding_boxes_url`, kein Modellwechsel.
- Box nicht als Schulter/Torso-Bbox und nicht ultraflach bauen, sondern als stabile Face-Target-Box:
  - Zentrum: Mouth-Landmark.
  - Breite: erkannte Face-Bbox-Breite mit kontrolliertem Faktor.
  - Höhe: Lower-face/Face-Bereich, nicht Brust/Schulter.
  - Clamp auf Plate-Dims.
- Log pro Pass:
  - Sprechername
  - `mouth_used`
  - `box`
  - `area_pct`
  - `bbox_source`
  - `anchor_space_ok`

### 6. FPS/Framecount für `bounding_boxes_url` sync-3-konform machen
- Nicht nur Dauer aus MP4 lesen, sondern FPS/Framecount nach Möglichkeit korrekt bestimmen.
- Wenn FPS nicht sicher ist:
  - konservativ und einheitlich mit Render-FPS arbeiten.
  - Logs: `bbox_json_frames`, `video_duration`, `fps_used`.
- Ziel: JSON-Länge passt zuverlässig zum Video-Frame-Raster.

### 7. Cache und aktuelle defekte Scene sauber invalidieren
- AWS/plate-face cache für die betroffene Szene ablaufen lassen.
- `dialog_shots.plate_identity` der aktuellen fehlerhaften Scene entfernen/erneuern, damit v156/v157-Altdaten nicht weiterverwendet werden.
- Keine stillen Partial-Ergebnisse: wenn Face-Targeting nicht eindeutig ist, Hard-Fail + Auto-Refund.

### 8. Verifikation
Nach Umsetzung prüfen:
- Logs zeigen `version=v158`.
- 4× `v158_sync3_face_target_box` für:
  - Samuel Dusatko
  - Matthew Dusatko
  - Kailee
  - Sarah Dusatko
- Alle 4 haben `mouth_used=true` oder einen klar begründeten Hard-Fail.
- `bounding_boxes_url` JSON enthält korrekte Frameanzahl und pro Pass nur die Sprecherfenster als non-null.
- Kein Wechsel auf `lipsync-2-pro`, kein Auto-Detect-Fallback.