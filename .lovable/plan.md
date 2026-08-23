# V457 — Preclip-Crop enthält Dispatch-Box (Fix für `preclip_identity_geometry_mismatch`)

## Was passiert ist

Der Fehler kam tatsächlich **vor** dem Sync.so-Aufruf. Szene `be60d106…`, Pass 1, 14:46 UTC:

```text
fa4_preclip_containment_fail_closed
reason = target_not_contained_in_crop
target  = [219,149,302,258]
crop    = [185,156,338,309]   (x=185, y=156, size=153)
```

Der Ziel-Kasten (Gesicht) beginnt bei y=149, der Preclip-Ausschnitt erst bei y=156 — die oberen 7 Pixel des Gesichts liegen außerhalb des Ausschnitts. Das Fail-Closed-Gate bricht dann korrekt ab, erstattet Credits und die Szene wird rot. Es ist also kein Provider-Problem, sondern eine Geometrie-Inkonsistenz in unserem eigenen Code.

## Warum (bestätigte Ursache)

Zwei Rechnungen benutzen dieselbe Messung, aber unterschiedliche Kästen:

- Der **Dispatch-Kasten** kommt aus `buildDispatchFaceBox` — mit Padding (8 % seitlich, 6 % oben, 4 % unten).
- Der **Preclip-Crop** kommt aus `computeMouthCenteredCrop` — mundzentriert und mit einer Mindestgröße, die nur aus dem **ungepaddeten** Gesichts-Bbox abgeleitet wird (`faceFloor = max(faceW, faceH)`).

Die V445-Vereinheitlichung deckt damit nur den Größen-, nicht den Positions- und Padding-Fall ab: Sobald der Mund-Anker den quadratischen Crop nach unten verschiebt, ragt der gepaddete Kasten oben heraus — genau die beobachteten 7 px.

## Der Fix (eng begrenzt)

1. `compute-mouth-centered-crop.ts` bekommt einen optionalen Parameter `containBox` (der gepaddete Dispatch-Kasten). Ablauf strikt deterministisch, keine Iteration:
   - **Impossible-Case zuerst** (kein stilles Reparieren eines fehlerhaften Upstream-Kastens): liegt `containBox` nicht vollständig innerhalb der Plate, oder ist `containBox.width > plateWidth` / `containBox.height > plateHeight`, oder wäre die nötige `size > min(plateWidth, plateHeight)` → Rückgabe `containsTarget = false`, `reason = "contain_box_outside_plate"`. Der Crop bleibt wie heute, das bestehende Fail-Closed-Gate entscheidet.
   - **Größe** wächst genau einmal und nur wenn nötig: `size = max(size, max(containBox.width, containBox.height))`, gedeckelt auf `min(plateWidth, plateHeight)`.
   - **Position per Intervallprojektion** statt Verschieben-bis-es-passt:
     `cropX ∈ [max(0, x2 - size), min(x1, plateWidth - size)]`, analog für Y. Innerhalb des zulässigen Intervalls wird der Wert genommen, der dem ursprünglich mundzentrierten `cropX`/`cropY` am nächsten liegt — Mundzentrierung bleibt maximal erhalten, Containment ist harte Invariante. Ist ein Intervall leer, greift der Impossible-Case.
   - **Verifikation nach der finalen Integer-/Clamp-Geometrie**: `containsTarget` wird erst nach allen `round`/`clamp`-Schritten geprüft, nicht davor.
   - Rückgabe zusätzlich: `containsTarget`, `reason`, `shiftPx: { x, y }`, `sizeGrown: boolean`, `sizeGrownPx: number`.
2. `pass-face-preclip.ts` reicht den über `buildDispatchFaceBox` erzeugten Kasten als `containBox` durch — dieselbe Messung wie beim Dispatch, keine zweite Quelle.
3. `compose-dialog-segments/index.ts`: unverändertes Fail-Closed-Gate (kein Aufweichen, keine Toleranz). Telemetrie/Fehler-Meta bekommt `v457_contain_box`, `v457_crop_shift_px = {x,y}`, `v457_size_grown`, `v457_size_grown_px`, `v457_contain_reason`.
4. Der Node-Zwilling `src/lib/composer/computeMouthCenteredCrop.ts` wird 1:1 mitgezogen (Spiegel-Pflicht).

## Tests

- Neue Fälle in `preclip-crop-containment.test.ts` bzw. neben `compute-mouth-centered-crop.ts`:
  - exakte Produktions-Geometrie der Szene `be60d106…` → Crop enthält `[219,149,302,258]`.
  - Mund-Anker am oberen/unteren/seitlichen Plate-Rand → weiterhin gültiger Crop.
  - Gesicht größer als Plate-Kurzseite → Verhalten wie heute, kein Absturz.
- Bestehende Preclip-/Containment-Tests müssen unverändert grün bleiben.

## Nicht Teil dieses Gates

- Keine Änderung an Sync.so-Payload, Thresholds, NOOP-Ladder oder V456-ROI-Vertrag.
- Keine Migration, kein automatischer Rerender.
- Deploy-Umfang nach Freigabe: `compose-dialog-segments` (bündelt die `_shared`-Dateien). Rerender startest du danach manuell.
