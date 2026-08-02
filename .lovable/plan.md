## Korrekturen übernommen

Alle neun Punkte sind eingearbeitet. Die zentrale Umbenennung: es ist **nicht** Fall A, sondern `source_geometry_drift` — die Transformation ist korrekt, sie transformiert veraltete Ausgangskoordinaten aus der Anchor-Face-Map.

Der Autoritätsvertrag lautet ab jetzt:

```text
Anchor-Geometrie   -> Seed: Identität und grober Suchbereich
Plate-Geometrie    -> plant den Crop
Preclip-Geometrie  -> bestimmt den Provider-Payload
```

Der Anchor liefert künftig **Identität, nie endgültige Position**. Die 57 Plate-Pixel (≈41 Anchor-Pixel) werden nicht mehr als Skalierungsrauschen erklärt, sondern als das, was sie sind: eine Anchor-Bbox ist keine Positionsmessung im generierten Video.

## Scope

**v396 = T8–T10.** T1–T7 und T11–T14 bleiben unangetastet. T15 wird ausdrücklich **nicht** in v396 geändert; die Matrizen werden nur persistiert, konsumiert werden sie dort erst in v397. Damit ist der Widerspruch aufgelöst.

## Reihenfolge der Umsetzung

### 1. Frame-Räume hart typisieren

Gebrandete Typen, Vermischung wird zum Compile-Fehler:

```ts
type PlateFrameIndex   = number & { readonly __brand: "PlateFrameIndex" };
type PreclipFrameIndex = number & { readonly __brand: "PreclipFrameIndex" };
```

Zusätzlich Runtime-Guard `0 ≤ preclip_frame < decoded_preclip_frame_count`. Der belegte Fall `frame_number = 102` gegen einen 68-Frame-Preclip wird dadurch blockiert statt vom Sekunden-Fallback verdeckt.

Keine Extraktion mehr über Sekunden. Statt `t = 0.05 s` künftig „extrahiere Preclip-Frame k". `plate_frame`, `preclip_frame` und PTS werden getrennt persistiert.

### 2. Overlay und Forensik-Logging

Annotiertes PNG pro Pass: projizierte Face-Bbox, projizierter Mund, alle AWS-Gesichter mit Mundpunkten und Identität, dazu `preclip_frame`, `source_plate_frame`, `crop_rect`. Angehängt an `syncso_dispatch_log`, sichtbar im Forensik-Sheet.

### 3. Identitätsprüfung technisch belastbar machen

„Genau ein Gesicht erkannt" gilt **nicht** als Identitätsbeweis — es könnte das letzte verbliebene Nachbargesicht sein, während die Zielperson den Crop bereits verlassen hat.

Der Assignment-Lock (Character-UUID → Face-Slot) wird um eine echte Referenz erweitert: Face-Embedding aus dem zugeordneten Anchor plus Character-Referenzbild. Persistiert wird:

```text
expected_character_uuid
matched_character_uuid
identity_score
second_best_score
identity_margin
reference_asset_id
```

Fehlerklassen getrennt: `wrong_identity`, `face_not_detected`, `identity_ambiguous`.

### 4. Reacquisition auf echten Plate-Frames

Kein Wiederanschalten des alten ungezügelten Plate-Trackings. Begrenztes Verfahren innerhalb des Sprachfensters: einige echte Plate-Frames decodieren, Gesichter erkennen, gegen die erwartete Identität matchen, robusten Track bzw. Track-Hülle bilden, daraus den ersten Crop berechnen.

Damit kann die Zielperson gar nicht erst vollständig aus dem Preclip fallen — der Fall, in dem T10 sie auch nicht mehr retten könnte.

### 5. Preclip rendern und auf dem echten Preclip tracken

```text
Plate-Reacquisition -> Crop-Planung -> echten 720x720-Preclip rendern
   -> Gesicht AUF DIESEM Preclip tracken -> diese Boxen an Sync.so
```

Die projizierte Plate-Box ist nur noch Planungs-Startwert, nie Dispatch-Inhalt.

### 6. Provider-Boxen aus geglättetem Track

Keine unabhängigen Rohmessungen pro Frame (Box-Jitter). Stattdessen: Detektion auf mehreren belastbaren Frames → Identitätsbindung → zeitlicher Track → kurze Lücken interpolieren → Center und Boxgröße glätten → genau ein validierter Eintrag pro decodiertem Frame.

Harte Prüfung `boxes.length === decodierte Framezahl`, ermittelt per **ffprobe am fertig encodierten Preclip** — nicht die geplante Remotion-Framezahl. CFR wird erzwungen, damit Frameindex, FPS und Zeitbasis eindeutig bleiben.

### 7. Geometrievertrag: zwei Tests, nicht einer

Persistiert pro Frame: `preclip_frame`, `source_plate_frame`, `crop_rect`, `forward_matrix`, `inverse_matrix`.

- **Roundtrip-Assertion** `P → M → M⁻¹ → P`, Toleranz < 0,5 px. Notwendig, aber **nicht hinreichend** — eine falsche, sauber invertierte Matrix besteht ihn.
- **Renderer-Conformance-Test**: bekannte Plate mit vier sichtbaren Kontrollmarkern. Nach dem Crop müssen deren tatsächliche Preclip-Positionen den durch M vorhergesagten entsprechen. Erst das beweist, dass Remotion und Matrixvertrag dieselbe Rasterisierung verwenden.

### 8. Drift-Messung über stabile Merkmale, nicht über den Mund

Der Mund bewegt sich beim Sprechen; ein schwankender Mundfehler beweist keinen Frame-Mapping-Fehler.

```text
Geometriefehler = beobachtetes Face-Zentrum - projiziertes Face-Zentrum
```

Gemessen über Augenmittelpunkt, Nasenrücken und Face-Bbox-Zentrum, robust über mehrere Frames gemittelt. Der Mund wird ausschließlich für die Safe-Region-Prüfung verwendet und darf sich relativ dazu bewegen.

### 9. Einmaliger, minimaler Recrop über Safe-Region

Kein Verschieben des Mundes auf einen festen Zielpunkt — das schneidet Stirn, Hinterkopf oder Kinn ab. Stattdessen Safe-Region (`safe_left/top/right/bottom`), und der Crop wird nur so weit verschoben, dass gilt:

- das gesamte Mundfenster liegt in der Safe-Region,
- die Face-Bbox bleibt vollständig enthalten,
- kein Nachbargesicht gerät in den erlaubten Providerbereich,
- der Crop bleibt innerhalb der Plate.

Reicht Translation nicht, wird der Crop **vergrößert**. Erst wenn auch das scheitert, gilt `crop_not_viable`.

Fehlerpfad für den belegten Fall:

```text
source_geometry_drift -> recrop_required -> (erst nach erfolglosem Recrop) terminal
```

`mouth_at_edge` wird aufgeteilt in: `wrong_identity`, `face_not_detected`, `identity_ambiguous`, `frame_mapping_failed`, `transform_contract_failed`, `source_geometry_drift`, `crop_not_viable`.

### 10. Erst danach Dispatch öffnen

Sync.so wird erst freigegeben, wenn Frametypen, Identität, Preclip-Track, Boxzahl und beide Geometrietests grün sind.

## Regressionstests

- `frame_number = 102` gegen 68-Frame-Preclip wird abgewiesen (`frame_mapping_failed`)
- Kontrollmarker-Plate: Renderer-Conformance hält, verfälschte Matrix fällt durch
- Roundtrip besteht bei falscher, aber konsistent invertierter Matrix — und der Conformance-Test fängt sie
- Anchor-Bbox weicht +57/+33 px vom echten Plate-Gesicht ab → `source_geometry_drift`, kein Dispatch mit Altgeometrie
- einziges erkanntes Gesicht mit zu geringer `identity_margin` → `identity_ambiguous`, nicht „ok"
- Nachbargesicht im Crop → `wrong_identity`
- Recrop verschiebt minimal, hält Face-Bbox vollständig, vergrößert bei Bedarf
- `boxes.length` gegen ffprobe-Framezahl, nicht gegen Remotion-Plan
- korrigierter Crop invalidiert den Preclip-Cache über den Geometrie-Fingerprint

## Live-Verifikation

Frischer Vier-Sprecher-Lauf. Pro Pass belegt: Overlay-Still, `identity_score` und `identity_margin`, Roundtrip < 0,5 px, bestandener Conformance-Test, ffprobe-verifizierte Boxzahl, Sync.so-Job-ID, Pixelurteil.

Erfolgskriterium: entweder vier identitätsgeprüfte Münder gehen an Sync.so, oder der Lauf stoppt vor dem Provider mit genau einer benannten Ursache aus der neuen Fehlerklassifikation.

## v397 (separat, nicht Teil dieser Umsetzung)

T15 reprojiziert ausschließlich über die persistierte inverse Matrix, mit Geometry-Fingerprint-Abgleich.
