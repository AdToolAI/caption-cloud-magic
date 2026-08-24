# V476 — T8-Konformitätsmessung: Track → Camera Path → Mund bei 62 % (READ-ONLY)

Kein neuer Algorithmus, keine Codeänderung, kein Rerender. Nur eine harte Messung,
die die drei von dir formulierten Fälle voneinander trennt.

## Warum genau jetzt

V473 hat gezeigt: die Verdict-Mundverankerung sitzt zu hoch. Offen ist die andere
Hälfte des v400-T8-Vertrags — ob der **Preclip-Crop** dem Face-Track folgt und den
Mund physisch bei ≈ 0.62 hält. Beides wird heute aus derselben unkalibrierten
Annahme abgeleitet, und diese Annahme ist im Code sichtbar:

- `_shared/dynamic-camera-path.ts` platziert den Mund bewusst bei `MOUTH_TARGET_Y = 0.62`,
  leitet die Mundposition im Gesicht aber mit `FACE_MOUTH_Y_RATIO = 0.78` ab.
- `_shared/v456-roi-contract.ts` benutzt für die Messung dieselbe 0.78.
- Nur `_shared/v471-mouth-roi.ts` (Verdict-Seite, V471-B) wurde auf `0.88` nachkalibriert.

Daraus folgt die Arbeitshypothese, die dieses Gate beweisen oder widerlegen muss:
Wenn 0.78 statt 0.88 gilt, landet der **echte** Mund im Preclip nicht bei 0.62,
sondern systematisch tiefer (grob 0.68–0.72) — der Crop wäre also formal "korrekt
zentriert" und trotzdem gegenüber v400 verschoben. Bis zur Messung ist das eine
Hypothese, kein Befund.

## Wichtig: ein echter Mund-Track existiert bereits

Der Mund muss nicht neu erfunden werden. `_shared/plate-face-track.ts` liest aus
demselben Rekognition-Aufruf, der die Face-Box liefert, die Landmarks
`mouthLeft` / `mouthRight` / `mouthDown` und speichert pro Sample einen echten
Mundpunkt. `dynamic-camera-path.ts` kennzeichnet jeden Keyframe entsprechend mit
`src = "mouth"` (gemessen), `"face_estimate"` (Ratio 0.78) oder `"interpolated"`.

Die 0.78-Ratio ist also nur der **Notpfad** — und der Verdacht ist, dass genau
dieser Notpfad in Produktion dominiert: V471-A fand an allen S01-Pässen
`preclip_geometry_mouth_source = "pose_estimate"`, und die eingefrorene Fixture
`src/test/fixtures/v464-s01-pass0-camera-path.json` trägt in 19 von 20 Keyframes
`src: "interpolated"` und nur einmal `"mouth"`.

Deshalb bekommt die Messung eine vierte, entscheidende Frage:
**Wie viele Keyframes pro Pass sind wirklich `src="mouth"`, und warum sind die
übrigen es nicht** (kein Landmark geliefert, Sample verworfen, oder nur zu grobe
Abtastung mit anschließender Interpolation)? Erst diese Zahl entscheidet, ob der
Fix "Ratio nachkalibrieren" oder "gemessenen Landmark endlich durchreichen" heißt —
das zweite wäre deutlich robuster und näher an v400.


## Messung

Zwei Kohorten, dieselbe Prozedur, dieselben Spalten:

1. **Golden Run** — Szene `c934a823-47de-49b7-a62e-a116b49ca3b2`, 4 Pässe (aus V473 als abrufbar bestätigt).
2. **S01** — Szene `be60d106…`, die eingefrorenen Pässe P0–P3.

Pro Preclip 16 gleichmäßig verteilte Frames, je Frame eine Zeile:

```text
frame | t | track_x/y | camera_path_x/y | crop_x/y/size |
face_center_x/y (im Preclip) | mouth_center_x/y (im Preclip) | mouth_y/720
```

- `track_*`, `camera_path_*`, `crop_*` kommen aus den persistierten Pass-Feldern
  (`preclip_camera_path`, `preclip_crop`, `preclip_from_bbox`, `preclip_crop_mode`).
- `face_center` / `mouth_center` werden **beobachtet**, nicht rekonstruiert: Frames
  über den Produktions-Still-Pfad (Remotion Lambda, AWS-only per v347), Gesicht via
  Rekognition, Mundpunkt aus Landmarks. Kein Ratio-Fallback in dieser Messung —
  fehlt ein Landmark, wird die Zeile als `unmeasured` markiert, nicht geschätzt.

Zusätzlich je Pass festgehalten: `preclip_camera_path_dynamic` (das frühere
`cam_dynamic = false`), Anzahl Keyframes, Travel in px sowie die
**Keyframe-Quellenverteilung** `mouth` / `face_estimate` / `interpolated` und
`preclip_geometry_mouth_source`.

## Auswertung — vier mögliche Verdikte

| Beobachtung | Verdikt |
|---|---|
| Mund bleibt über den Turn bei ≈ 0.62 ± 0.04, Crop folgt dem Track | T8 konform — Fehler liegt allein im Outcome-Anchor |
| Track wandert, Crop steht (`dynamic=false` / Travel ≈ 0) | camera-path.ts ist nicht angeschlossen — T8 gebrochen |
| Crop folgt, Mund liegt aber konstant bei ≈ 0.68–0.72 | T8-Zentrierung nutzt die falsche Ratio (0.78 statt 0.88) |
| Anteil `src="mouth"` nahe null, obwohl Rekognition Landmarks liefert | Der echte Mund-Track wird gar nicht verwendet — der Fix ist Durchreichen, nicht Nachkalibrieren |

Zusätzlich wird die Differenz Golden Run ↔ S01 in derselben Tabelle ausgewiesen:
Falls beide dieselbe Mundhöhe zeigen, ist die Preclip-Geometrie als Ursache für die
S01-NOOPs endgültig ausgeschlossen.

## Ergebnis des Gates

- Report `docs/v476-t8-conformance-measurement.md` mit beiden Volltabellen (2 × 4 × 16 Zeilen),
  Pro-Pass-Zusammenfassung, Landmark-Quotenübersicht und einem der vier Verdikte.
- Kein Fix in diesem Gate. Der Folgefix (V477) wird durch das Verdikt bestimmt:
  entweder Landmark-Durchreichung (bevorzugt) oder Ratio-Nachkalibrierung — jeweils
  mit Regressionsnachweis gegen den Golden Run.


## Technische Notizen

- Reine Leseoperationen: DB-Queries auf `dialog_shots` / Pass-JSON, Storage-Downloads
  der gepinnten Preclips, Lambda-Stills. Keine Provider-Calls, keine Credits.
- Nicht angefasst: V465-Band, V466-Grauband, V469-Gate, V471-B-ROI, Dispatch, Preclip-Render.
- Wenn für eine Kohorte Frames nicht mehr abrufbar sind, wird der Pass als
  `unavailable` geführt statt ersetzt — kein Surrogat-Datensatz.
