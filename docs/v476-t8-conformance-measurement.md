# V476 — T8-Konformitätsmessung: Track → Camera Path → Mund bei 62 % (READ-ONLY)

Status: **PASS (Messung abgeschlossen, keine Code-Änderung)**
Scope: strikt read-only. Quelle = persistierte Pass-Artefakte in `composer_scenes.dialog_shots.passes`.

Messobjekte
- S01 (NOOP-Fall): `be60d106-6908-4002-95d1-2bd01c5cfa6c`, 6 Pässe (P0–P4 dispatched, P5 canceled)
- Golden Run (v400 Homepage-Kontrolle): `c934a823-47de-49b7-a62e-a116b49ca3b2`, 4 Pässe, alle `done`

## 1. Befund: der Golden Run hat keinen T8-Track-Vertrag

Die 4 Golden-Run-Pässe besitzen **keine** der T8-Felder:
`preclip_face_track`, `preclip_camera_path`, `preclip_camera_path_dynamic`,
`preclip_geometry_mouth_source`, `preclip_from_bbox`, `preclip_dims` — alle `null`;
`preclip_face_share = 0`.

Der bekannte funktionierende v400-Lauf lief also über den **Legacy-Statik-Crop ohne Face-Track
und ohne Camera Path**. „v400-Konformität" kann an ihm nicht positiv verifiziert werden — er ist
der Beweis, dass Sync.so ohne dynamischen Pfad erfolgreich arbeitet.

## 2. Befund: in S01 ist der Camera Path faktisch statisch

| Pass | Speaker | Status | `camera_path_dynamic` | Keyframes | `src` | `geometry_mouth_source` |
|---|---|---|---|---|---|---|
| 0 | Sarah | failed | false | 1 | static | pose_estimate |
| 1 | Sarah | failed | false | 1 | static | pose_estimate |
| 2 | Samuel | done | false | 1 | static | pose_estimate |
| 3 | Samuel | failed | false | 1 | static | pose_estimate |
| 4 | Matthew | done | false | 1 | static | pose_estimate |

**Kein einziger Pass** hat mehr als einen Keyframe. Track → Camera Path ist nicht aktiv;
der Preclip-Crop ist über die gesamte Passdauer konstant.

## 3. Befund: gemessene Mund-Landmarks liegen vor — werden aber verworfen

`preclip_face_track.samples` enthält für **alle 5 dispatchten Pässe 6/6 Samples mit echtem
`mouth`-Landmark** (Rekognition). Trotzdem ist `preclip_geometry_mouth_source` in allen Pässen
`pose_estimate`. Die gemessenen Landmarks erreichen die Crop-/ROI-Geometrie nicht.

Gemessenes Verhältnis Mund innerhalb der Face-Box (`(mouthY − y1) / faceHeight`), 30 Samples:

| | min | max | Mittel |
|---|---|---|---|
| gemessen | 0.734 | 0.781 | **0.755** |
| Fallback `FACE_MOUTH_Y_RATIO` | | | 0.78 |
| V471 `V471_FACE_MOUTH_Y_RATIO` | | | 0.88 |

Der 0.78-Fallback liegt nahe an der Realität (+0.025). **0.88 ist zu tief** (+0.125 Gesichtshöhe).

## 4. Kernmessung: wo landet der Mund im finalen 720×720-Preclip?

Projektion `y_preclip = (mouthY − cropY) · 720 / cropSize`, normiert auf 720.
T8-Sollwert: **0.62**.

| Pass | Status | gemessener Mund y/720 (mean) | Spanne | 0.78-Estimate | 0.88 (V471) | Abweichung Ist vs. 0.62 |
|---|---|---|---|---|---|---|
| 0 Sarah | failed | 0.571 | 0.532–0.601 | 0.556 | 0.620 | **−0.049** |
| 1 Sarah | failed | 0.590 | 0.590–0.590 | 0.543 | 0.608 | −0.030 |
| 2 Samuel | done | 0.572 | 0.571–0.577 | 0.548 | 0.613 | −0.048 |
| 3 Samuel | failed | 0.587 | 0.583–0.589 | 0.548 | 0.613 | −0.033 |
| 4 Matthew | done | 0.489 | 0.482–0.504 | 0.543 | 0.608 | **−0.131** |

Zusätzlich Mundwanderung im Preclip trotz statischem Crop:
P0 dx 54 px / dy 50 px, P2 dx 60 px, P4 dx 21 px / dy 16 px.

## 5. Interpretation

1. **T8 ist nicht erfüllt.** Der Mund sitzt im finalen Preclip bei 0.489–0.590 statt 0.62.
   Kein Pass trifft das Ziel; Matthew liegt 94 px zu hoch.
2. **Ursache ist nicht das Face-Tracking.** Track und Mund-Landmark sind pro Sample vorhanden,
   plausibel und stabil (Verhältnis 0.734–0.781 über alle Sprecher).
3. **Ursache ist die Weitergabe.** Die Geometrie rechnet mit `pose_estimate`, obwohl gemessene
   Landmarks im selben Artefakt liegen (Fall 4 der Hypothesenliste), und der Camera Path
   degradiert auf einen einzigen statischen Keyframe (Fall 2).
4. **V471 `0.88` ist überkalibriert.** Es korrigiert nicht den Landmark, sondern kompensiert die
   fehlende Zentrierung: 0.88 landet zufällig bei ~0.61–0.62 (also am T8-Ziel), während der
   reale Mund bei 0.57–0.59 liegt. Die V471-ROI liegt damit für Sarah/Samuel ~22–36 px **zu
   tief** und trifft für Matthew (Ist 0.489) um ~86 px daneben.
5. **Geometrie allein erklärt den NOOP-Split nicht.** P2 (done) und P3 (failed) teilen sich
   identischen Crop und nahezu identische Mundlage. Die Messung erklärt jedoch, warum die
   Verdict-ROI systematisch nicht auf dem Mund sitzt.

## 6. Empfehlung für das nächste Gate (nicht in V476 umgesetzt)

- Gemessene `mouth`-Landmarks aus `preclip_face_track.samples` als primäre Quelle in Crop und
  ROI durchreichen (`geometry_mouth_source = "mouth"`), Ratio nur als Fallback.
- `V471_FACE_MOUTH_Y_RATIO` von 0.88 auf den gemessenen Wert ~0.755 zurücknehmen, sobald die
  Zentrierung auf 0.62 tatsächlich greift — beides muss zusammen geändert werden.
- Camera-Path-Degradation auf 1 statischen Keyframe als Vertragsverletzung sichtbar machen
  (Telemetrie/Gate), nicht still tolerieren.
