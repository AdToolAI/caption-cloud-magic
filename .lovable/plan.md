## Vollanalyse: Was bei Sync.so 3 wirklich stabil ist

Kurzfassung: Nein, die offizielle Sync.so-Doku sagt nicht, dass `auto_detect` das einzige stabile Verfahren für Sync.so 3 ist. Sie sagt eher das Gegenteil differenziert:

- `auto_detect: true` ist für Video erlaubt und am besten für single/obvious speaker clips.
- Für mehrere Personen oder deterministische Kontrolle empfiehlt Sync.so manuelle Speaker Selection über `frame_number + coordinates` oder `bounding_boxes` / `bounding_boxes_url`.
- Für Sync.so-3-Bild-Inputs ist `auto_detect` sogar nicht erlaubt; dort müssen manuelle Koordinaten verwendet werden.
- `temperature`, `reasoning_enabled`, `occlusion_detection_enabled` gehören nicht in Sync-3-Payloads; Sync-3 verwaltet das nativ.
- Sync-3 ist trotzdem das richtige Modell für unsere Aufgabe, weil es Silent Lips öffnen kann, Full-Shot-Kontext verarbeitet und mit komplexen Winkeln/Obstructions besser umgehen kann.

## Offizielle Sync.so-Aussagen, die für uns entscheidend sind

### 1. Sync-3 ist das richtige Modell für Composer/Hailuo-Plates

Sync.so beschreibt Sync-3 als Modell mit:

- Full-shot processing statt kleiner unabhängiger Snippets
- 4K native output
- Obstruction detection automatisch
- Unterstützung für close-ups, partial faces, extreme angles
- Silent lip opening

Das bestätigt: Wir sollten nicht zurück auf lipsync-2-pro als Standard. Lipsync-2/lipsync-2-pro brauchen natürliche Mundbewegung und scheitern eher auf statischen AI-Plates. Sync-3 bleibt der Standard.

### 2. Sync-3 braucht trotzdem gute Inputs

Sync.so sagt weiterhin:

- Face möglichst klar, sichtbar, gut beleuchtet
- mindestens 480p, empfohlen 1080p
- bei AI-generiertem Video Prompt-Hinweis: `the character should be speaking naturally`
- Audio ohne Hintergrundmusik/Noise/überlappende Sprecher

Das bedeutet: Sync-3 ist robust, aber nicht magisch. Wenn unser Crop kein Gesicht enthält oder Audio/Video-Fenster falsch sind, scheitert es trotzdem.

### 3. Auto-detect ist nicht die Multi-Speaker-Lösung

Sync.so Speaker Selection sagt:

- Auto-detect: best for single/obvious speaker clips
- Manual selection: best for multiple people or deterministic control
- Für Video: `frame_number` und `coordinates` müssen zum gleichen sichtbaren Frame passen
- Alternativ: `bounding_boxes` pro Frame oder `bounding_boxes_url`

Für unsere 4-Sprecher-Szenen heißt das:

- Full-plate mit mehreren Gesichtern + `auto_detect:true` ist riskant, weil Sync.so den falschen Sprecher wählen kann.
- Full-plate mit `coordinates` oder `bounding_boxes_url` ist offiziell richtig, wenn die Koordinaten wirklich aus dem gerenderten Plate-Video stammen.
- Single-face Preclip mit genau einem sichtbaren Gesicht ist der einzige Fall, wo `auto_detect:true` sinnvoll und doc-konform ist.

### 4. Segments API ist offiziell genau für Multi-Speaker gedacht

Sync.so Segments erlaubt:

- mehrere Audio-Inputs in einem Request
- mehrere Zeitbereiche in einem Video
- pro Segment `optionsOverride.active_speaker_detection`
- damit unterschiedliche Sprecher pro Segment

Das ist näher an unserem eigentlichen Ziel als die aktuelle Fan-out-Architektur mit 4 separaten Sync-Jobs + späterem Masken-Compositing.

## Was bei uns aktuell schief läuft

Aus den aktuellen Logs/DB-Zustand:

- Szene: `7470be0d-5b7e-4df5-9871-152864e0a858`
- Pass 4 / Sarah:
  - Preclip gerendert
  - Face-Gate sagt `faces=0`
  - Pipeline blockt korrekt mit `v107_preclip_required_for_multispeaker`
- Pass 2 / Matthew:
  - Preclip validierte zwar als `faces=1`
  - Sync.so bekam aber `sync-3` + Preclip + `active_speaker_detection: { auto_detect:false, coordinates:[360,360], frame_number:0 }`
  - Sync.so antwortete mehrfach `FAILED / An unknown error occurred.`

Das zeigt zwei Dinge:

1. Unser Cropping / Speaker-Mapping ist noch instabil. Ein Speaker bekommt ein Crop, in dem unsere eigene Validierung kein Gesicht findet.
2. Der v114-Wechsel zu Center-Koordinaten auf Single-Face-Preclips ist nicht bewiesen stabil; für mindestens einen Pass ist genau dieser Modus fehlgeschlagen.

## Korrektur meiner früheren Einschätzung

Ich würde die Aussage “Auto-detect ist das einzige, was Sync-3 stabil anbietet” nicht mehr so stehen lassen.

Präziser ist:

- `auto_detect:true` ist stabil und passend, wenn Sync.so wirklich nur ein klares Gesicht im Video sieht.
- Für mehrere Gesichter ist `auto_detect:true` nicht stabil genug, weil der falsche Sprecher gewählt werden kann.
- Für mehrere Sprecher ist die offizielle stabile Lösung: Speaker Selection mit manuellem Ziel pro Segment oder Bounding Boxes.
- Für Sync-3 dürfen wir keine alten lipsync-2/pro-Optionen mitschicken.

## Stabilste Zielarchitektur für uns

Ich empfehle nicht weiter beliebig zwischen Auto-detect, Center-Koordinaten, Bounding Boxes und Preclips zu springen. Wir brauchen eine feste Prioritätenmatrix.

### A. Primärpfad: Official Segments API mit Sync-3

Für Multi-Speaker-Szenen sollte der langfristig stabilste Pfad sein:

```text
1 Video-Plate
+ N Audio-Inputs mit refId
+ segments[] pro Sprecher-Turn
+ optionsOverride.active_speaker_detection pro Segment
+ model: sync-3
+ keine temperature/occlusion/reasoning options
```

Warum:

- Das ist offiziell für Multi-Speaker beschrieben.
- Sync-3 verarbeitet den ganzen Shot global, statt dass wir 4 Outputs später selbst zusammenmaskieren.
- Kein Maskenradius-/Overlay-Problem.
- Kein “Preclip enthält plötzlich kein Gesicht”-Problem, solange die Plate selbst valide ist.
- Weniger Jobs, weniger Race Conditions, weniger stale URLs.

Speaker Targeting im Primärpfad:

- Wenn wir zuverlässige Face Boxes aus dem echten Plate-Video haben: `bounding_boxes_url` bevorzugen.
- Sonst pro Segment: `frame_number + coordinates`, aber nur von einem Frame, in dem der Zielsprecher wirklich sichtbar ist.
- Kein `auto_detect:true` auf Multi-Face-Full-Plate.

### B. Fallback: Single-face Preclip mit Auto-detect

Wenn Segments API mit Multi-Speaker-Full-Plate scheitert oder ein Sprecher im Plate nicht zuverlässig als Ziel erfasst werden kann:

```text
pro Sprecher ein 720p/1080p Single-Face-Preclip
+ genau 1 validiertes Gesicht
+ active_speaker_detection: { auto_detect: true }
+ model: sync-3
```

Wichtig: Auf einem validierten Single-Face-Preclip sollten wir v114 Center-Koordinaten nicht als Standard verwenden. Die Doku sagt Auto-detect ist für single/obvious speaker passend. Center-Koordinaten bleiben höchstens ein gezielter Fallback, nicht der Standard.

### C. Harte Gating-Regeln

Vor jedem Sync.so-Call:

- Video öffentlich abrufbar, nicht abgelaufen
- MP4/H.264
- echte Dimension mindestens 720p; ideal 1080p
- Face-Gate erfolgreich
- `frame_number` und `coordinates` stammen aus demselben Frame
- Audio hat echte voiced frames und keine überlappenden Sprecher
- Sync-3 Payload enthält nur Sync-3-kompatible Optionen

Wenn eines davon nicht stimmt: nicht an Sync.so schicken, sondern intern reparieren oder sauber failen/refunden.

## Was wir konkret als nächsten Fix planen sollten

### Phase 1: v115 Stabilisierung, ohne Komplettumbau

1. Preclip-Standard zurück auf `auto_detect:true`, aber nur wenn `preclip_face_count === 1`.
2. Center-Koordinaten auf Preclip nur als Fallback, nicht als Default.
3. Preclip-Reparatur einbauen:
   - Crop erweitern
   - andere Referenzframes testen
   - face bbox aus echtem Plate bevorzugen
   - nur dann failen, wenn nach Reparatur wirklich kein Gesicht im Crop ist
4. Preclip-State an Speaker binden:
   - `speaker_idx`, `speaker_name`, `character_id`, `coords`, `bbox`, `source_clip_url`
   - bei Änderung alten Preclip verwerfen
5. Sync.so-Fehldiagnose persistieren:
   - payload mode
   - ASD mode
   - crop/face count
   - Sync.so job id
   - error/error_code

Ziel: Der aktuelle Run scheitert nicht mehr wegen `faces=0` oder stale/wrong crop.

### Phase 2: Official Segments API als neuer Primärpfad

1. Neue/saubere Sync-3-Segments-Dispatch-Schicht bauen.
2. Ein Request pro Szene statt 4 separate Jobs.
3. Pro Dialog-Turn `optionsOverride.active_speaker_detection` setzen.
4. `bounding_boxes_url` bevorzugen, wenn echte Plate-Face-Boxes verfügbar sind.
5. Fan-out/Mask-Compositor nur noch als Fallback behalten.

Ziel: Weniger moving parts und näher an der offiziellen Sync.so-Multi-Speaker-Anleitung.

### Phase 3: Plate-Qualitätsgate vor Lip-Sync

Wenn Hailuo/Composer eine 4-Personen-Plate erzeugt, die Gesichter abschneidet oder zu klein rendert:

- nicht erst Sync.so testen
- vorher “Plate nicht lip-sync-fähig” melden oder Plate neu rendern
- Prompt für Group Dialog verschärfen:
  - all faces front/near-front
  - mouth/lower face visible
  - no cropped heads
  - the character should be speaking naturally

## Entscheidende Empfehlung

Der stabilste Weg zu unserem Ziel ist:

1. Sync-3 bleibt Standard.
2. Multi-Speaker-Full-Plate niemals mit blindem `auto_detect:true`.
3. Single-Face-Preclip mit genau einem Gesicht: `auto_detect:true` als Standard.
4. Multi-Speaker offiziell: Segments API + per-segment Speaker Selection.
5. Nicht weiter am Masken-Fan-out als Hauptarchitektur festhalten; das ist unser größter Komplexitäts- und Fehlerverstärker.

## Umsetzungsvorschlag

Ich würde als nächstes nicht nur “einen kleinen Fix” machen, sondern v115 so schneiden:

- Sofortfix: Preclip-Auto-detect wiederherstellen + Crop-Reparatur + State-Invalidierung.
- Danach offizieller Primärpfad: Sync-3 Segments API mit per-segment Speaker Selection.
- Bestehenden Fan-out-Compositor nur als fallback behalten.

Damit drehen wir uns nicht weiter im Kreis, sondern bewegen die Pipeline auf die offizielle Sync.so-Architektur zu.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>