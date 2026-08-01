## Der Beweis liegt in der Datenbank — und er widerlegt meine eigene These

Ich habe die Szenen vom 27.07. ausgelesen, die sauber durchliefen. Das sind ihre Preclip-Geometrien:

```text
Szene 0f8818ee (27.07., 4 Sprecher, status=done)
  Pass 0  crop 128 px → 720p   face-share  4.8 %
  Pass 1  crop 128 px → 720p   face-share  8.5 %
  Pass 2  crop 128 px → 720p   face-share 17.4 %
  Pass 3  crop 128 px → 720p   face-share 12.9 %

Szene c01d339d (27.07., 4 Sprecher, status=done)
  crop 384 / 339 / 165 / 540 px   share 15–21 %
```

Das heißt: **am 27.07. lief die Pipeline mit exakt den Werten durch, die heute jeden Lauf blockieren.** 128 px Crop bei 4,8 % Face-Share — heute verlangen wir 144 px Crop, 34 % Side-Share und 120 px Gesichtsbreite auf der Plate. Jede einzelne dieser Julischen Erfolgs-Szenen würde von der aktuellen Pipeline abgelehnt.

Damit ist meine Pixel-Theorie aus v353/v355 als Blockierkriterium widerlegt. Die 181/116/102-px-Messung von gestern war eine Momentaufnahme einer einzelnen Szene, kein Naturgesetz des Providers. Ich habe daraus eine harte Regel gemacht — und die Regel sperrt jetzt genau die Konfiguration aus, die nachweislich funktioniert hat.

## Wie andere Anbieter es lösen

Nicht über Geometrie-Vorabprüfungen. Der Industrie-Ansatz ist **outcome-based**: dispatchen, das Ergebnis messen, und nur bei nachgewiesenem Passthrough eingreifen. Geometrische Vorab-Gates sind bei Gruppenszenen strukturell unmöglich sauber zu definieren — genau das erleben wir seit v341.

## Plan v356 — Zurück auf die belegte Julikonfiguration, Guard nur am Ergebnis

**1. Alle geometrischen Vorab-Blocker entfernen**
- `MIN_NATIVE_CROP_PX = 144` (v353) → entfällt.
- `FACE_SIDE_SHARE_FLOOR = 0.34` (v344.1) → entfällt.
- `v355_plate_contract` Pixel-Block in `compose-dialog-segments` → wird von „blockieren" auf „loggen" umgestellt.
- Der Anchor-Ratio-Check in `compose-video-clips` bleibt als reiner Framing-Hebel ohne Abbruch.

Alle vier Werte bleiben als Telemetrie im Log erhalten, damit wir weiter messen können — sie fällen nur keine Entscheidung mehr.

**2. Crop-Geometrie exakt auf den Julistand zurücksetzen**
`minSize` zurück auf 128 px, `targetFaceShare` 0.42, `outputSize` 720 — das ist die Konfiguration der nachweislich erfolgreichen Szenen. Kein `minSize: 96`, keine nachträgliche Share-Neuberechnung gegen den expandierten Crop.

**3. Einziger verbleibender Guard: der Motion-Verdict nach dem Lauf**
Der Vergleich Output gegen Input (`mouth-motion-verdict`) bleibt scharf. Liefert Sync.so ein unverändertes Video, wird nicht gemuxt und erstattet. Das ist der Guard, der tatsächlich misst, was der Kunde sieht — statt vorherzusagen, was der Provider können wird.

**4. Plate-Auflösung: 1080p bleibt, aber freiwillig**
Höhere Plate-Auflösung schadet nicht und gibt dem Crop mehr Substanz. Sie bleibt aktiv, ist aber an keine Bedingung geknüpft.

**5. Regressionstest gegen die Julidaten**
Die Tests in `_shared/closeup-contract.test.ts` und `lipsync-noop-policy.test.ts` werden umgedreht: sie prüfen künftig, dass ein 128-px-Crop mit 4,8 % Share **nicht** blockiert wird — mit den echten Werten aus Szene `0f8818ee` als Fixture. Damit kann kein künftiger Fix diese Klasse erneut aussperren.

## Was wir dann wissen

Nach dem ersten Lauf mit v356 gibt es genau zwei mögliche Ergebnisse, und beide sind aussagekräftig:

- **Lippen bewegen sich** → die Ursache waren unsere eigenen Gates, nicht der Provider. Fall geschlossen.
- **Passthrough trotz Julikonfiguration** → dann hat sich zwischen 27.07. und heute etwas beim Provider oder in der Payload geändert. Dann vergleiche ich die Sync.so-Request-Payload einer erfolgreichen Julizeile mit der aktuellen Feld für Feld — nicht die Geometrie.

Ich schlage keine weitere Schwelle vor, bevor dieser Lauf nicht gemessen ist.