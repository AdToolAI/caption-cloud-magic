## Was gerade passiert ist

Der Vertrag hat funktioniert — er hat nur die falsche Kennzahl gemessen. Aus dem Log der fehlgeschlagenen Szene:

```text
v354_plate_contract  ok=0  min_ratio=0.058  required=0.160
                     min_px=74  plate_w=1284  n=4
v354_plate_contract_BLOCK — refunding 576 credits, no dispatch
```

Die 576 Credits sind zurückerstattet, es wurde kein Provider-Slot verbrannt. Aber: **ein 4-Personen-Konferenztisch kann 16 % Gesichtsbreite pro Person physisch nicht erreichen.** Vier Gesichter à 16 % wären 64 % der Bildbreite — das ist keine Konferenzszene mehr. Der Vertrag blockiert damit eine Szene, die grundsätzlich nie bestehen kann. Aktuell gibt es für dich keinen Weg vorwärts, und das ist mein Fehler.

## Der eigentliche Denkfehler

Ich habe den Vertrag auf ein **Verhältnis** gebaut. Die Beweislage aus v353 sagt aber, dass der Provider auf **absolute Pixel** reagiert — gemessen an genau dieser Szene `7c11bc27`:

```text
Crop 181 px → 720p hochskaliert (4.0×) → Lippen bewegen sich   ✅
Crop 116 px → 720p hochskaliert (6.2×) → Passthrough           ❌
Crop 102 px → 720p hochskaliert (7.1×) → Passthrough           ❌
```

Sync.so scheitert nicht, weil das Gesicht einen kleinen Bildanteil hat. Es scheitert, weil im Ausgangsmaterial zu wenige **echte Pixel** auf dem Mund liegen. Das Verhältnis ist nur ein Stellvertreter dafür — und ein schlechter, weil es von der Plate-Auflösung abhängt.

Die Plate ist 1284 px breit. Bei 2560 px Breite wären dieselben Gesichter 148 px statt 74 px, der Preclip-Crop läge bei ~230 px statt 116 px — also im nachweislich funktionierenden Bereich, **ohne die Bildkomposition anzufassen**.

## Plan: Vertrag auf Pixel umstellen, Plates hochauflösend rendern

**1. Vertragskennzahl ersetzen (`_shared/lipsync-closeup-contract.ts`)**
Statt `requiredFaceWidthRatio` gilt `MIN_FACE_WIDTH_PX = 120` (Gesicht) — das ergibt mit der üblichen Crop-Marge den belegten Crop von ≥ 180 px. Unabhängig von Sprecherzahl und Bildkomposition, weil der Provider genau darauf reagiert. Das Verhältnis bleibt nur als weiche Telemetrie im Log.

**2. Plates in Lip-Sync-Szenen hochauflösend rendern (`compose-video-clips`)**
Sobald eine Szene Dialog hat, wird die Plate mit der höchsten verfügbaren Auflösung des Modells angefordert. Reicht das nicht, wird die fertige Plate vor dem Dispatch per AWS-Lambda auf mindestens 2560 px Breite hochskaliert. Das kostet einmalig Rechenzeit, aber keinen Provider-Slot — und es ist verlustfrei genug, weil der Preclip ohnehin nur einen Ausschnitt braucht.

**3. Vertragsprüfung auf die skalierte Plate anwenden (`compose-dialog-segments`)**
Der Check läuft nach dem Upscale, nicht davor. Blockiert wird nur noch, was auch nach dem Upscale unter 120 px liegt — dann ist das Gesicht wirklich zu klein und ein Re-Render die richtige Antwort.

**4. Close-up-Framing bleibt, wird aber wieder weich**
Das Framing-Suffix aus v354 bleibt als Qualitätshebel im Prompt. Es löst aber keinen harten Abbruch mehr aus, weil es nicht mehr die entscheidende Größe ist.

**5. Bestehende Szene entsperren**
Für `7c11bc27` genügt dann "Clip + Lip-Sync neu rendern": die Plate wird hochauflösend neu erzeugt und läuft durch den neuen Vertrag.

## Was das nicht löst

Wenn nach dem Upscale bei ≥ 200 px Crop **immer noch** Passthrough kommt, liegt es nachweislich am Provider und nicht an unserer Geometrie. Dann ist der nächste Schritt Kling Omni als zweiter Dispatch-Weg (nativ bereits integriert), nicht ein weiterer Geometrie-Fix. Ich sage dir das nach dem ersten Lauf anhand des Logs eindeutig — `crop_px` und `verdict` stehen beide drin.

## Technische Notiz

Der getrennte Per-Speaker-Close-up-Umbau bleibt bewusst aus dem Plan: `render-sync-segments-audio-mux` arbeitet Overlay-basiert auf **einer** Master-Plate mit Sprecher-Fenstern, nicht mit einer Schnittfolge. Auf Schnitte umzubauen wäre ein Neubau des Mux — und der Upscale-Weg adressiert die belegte Ursache direkt.
