
## Symptom

In Multi-Speaker-Szenen (3–4 Sprecher) animiert Sync.so nur den letzten Sprecher korrekt; alle anderen behalten geschlossene Münder. Beispiel-Szene `cf3cb5d2…`: nur Pass 3 hat `preclip_crop` deckungsgleich mit `coords`; Pass 1+2 liegen 130–300 px daneben → Preclip enthält das Nachbargesicht, Sync.so lippt am falschen Mund.

## Ursache

`compose-dialog-segments/index.ts` baut den Preclip aus `bboxForCrop` (Plate-Bbox aus Face-Map oder `speakerPlateBboxes[speaker_idx]`). Wenn diese Bbox driftet oder falsch zugeordnet ist, crop'd der Renderer um den Nachbarn. Der `validateFrameFace`-Gate prüft nur "genau 1 Gesicht", nicht ob es der **richtige** Sprecher ist. Beim Mux überlagert `render-sync-segments-audio-mux` den Sync.so-Output an `preclip_crop` (nicht an `coords`) → Lipsync landet sichtbar an der falschen Stelle, der echte Sprecher bleibt stumm.

## Fix (v122) — drei Stellen

### 1. `supabase/functions/compose-dialog-segments/index.ts` (~Zeile 2495–2540, vor `renderPassFacePreclip`)

Coords als Single-Source-of-Truth durchsetzen:

- Nach Berechnung von `bboxForCrop` einen **Coords-Containment-Check** ergänzen:
  - Berechne den Crop, den `renderPassFacePreclip` aus `bbox` ableiten würde (gleiche Padding-/Square-Logik). 
  - Wenn `coords` außerhalb dieses Crop-Quadrats liegt (oder >25 % Abstand zum Crop-Zentrum), verwirf `bboxForCrop` und übergib `null` → Renderer fällt auf den coords-zentrierten Square-Crop zurück (die Logik existiert bereits für den `null`-Fall).
  - Log: `v122_bbox_drift_rejected speaker=${p.speaker_idx} coords=${coords} bbox_center=${cx,cy} delta_px=${d}`.

### 2. Face-Gate verschärfen (~Zeile 2545–2565)

Nach `validateFrameFace` zusätzlich `targetCoords` übergeben (heute `null`):

- Übergib die **preclip-lokalen** Koordinaten des Sprechers (coords − crop.x/y, skaliert auf `outputSize`).
- Wenn das detektierte Gesicht im Preclip mehr als ~30 % der `outputSize` von diesen Soll-Koordinaten entfernt ist, markiere den Preclip als `face_gate_wrong_speaker` und re-rendere **einmal** mit erzwungenem coords-Crop (`bbox = null`). Erst wenn auch das fehlschlägt: `preclip_error` setzen und Pass auf full-plate `coords-pro` (Variante wie Pass 0 in der Beispiel-Szene) zurückfallen lassen.

### 3. `render-sync-segments-audio-mux/index.ts` (Zeile 236–256) — Defense in Depth

Im `hasPreclipCrop`-Zweig zusätzlich prüfen, ob `coords` innerhalb des `preclip_crop`-Quadrats liegen. Wenn nicht, **ignoriere** `preclip_crop` und nutze stattdessen den `faceMask`-Zweig (Kreis um die echten `coords`). Verhindert, dass historisch falsch geschriebene Passes (wie `cf3cb5d2…`) beim Re-Mux erneut am falschen Ort landen.

## Verifizierung

1. Reset & Re-Run der Beispiel-Szene `cf3cb5d2…` und einer fresh 4-Sprecher-Szene.
2. Edge-Logs prüfen: jeder Pass sollte `v122_preclip_crop_centered_on_coords` oder `v122_bbox_drift_rejected` loggen.
3. Im finalen Mux: alle 4 Sprecher bewegen den Mund in ihrem jeweiligen Turn.
4. DB-Spot-Check: für jeden `done` Pass mit `preclip_crop` muss `|coords − crop_center| < crop.size/2` gelten.

## Memory

Neue Doku unter `mem/architecture/lipsync/v122-coords-as-preclip-truth.md`; `mem/index.md` aktualisieren.

## Out of Scope

- Sync.so v3 `v3: true` ASD-Flag, `webhook_url`-Dublette, hardcoded 24 fps für `bounding_boxes_url`, `/v2/generate` vs `/v2/generations` Pfad — alles aus dem Audit, aber **unabhängig** vom aktuellen "falscher Mund"-Symptom. Eigene Iteration.
