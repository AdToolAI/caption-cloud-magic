# Lip-Sync Fix — Lip-Ready Master Plate + Temperatur 0.7

## Ursache des Bauchredner-Effekts

Der vorige Fix („Silent Master Plate" mit `closed relaxed lips / calm resting mouth posture`) hat das Gegenteil bewirkt: Sync.so konnte auf einem Bild mit explizit geschlossenen, fixierten Lippen kaum Mundbewegung durchsetzen. Plus `temperature 0.5` war zu defensiv. Ergebnis: Charaktere mit Stimme, aber praktisch ohne Lippenbewegung.

## Umgesetzt

1. **Lip-Ready Master Plate** (`compose-video-clips`)
   - `closed relaxed lips` / `calm resting mouth posture` raus.
   - Stattdessen: natürliche, animierbare Gesichter, sichtbare Mundpartie, keine Hände/Mikros vor dem Mund, stabile Front-/Drei-Viertel-Komposition.
   - Sprech-/Mund-Negativliste bleibt im `negative_prompt`.

2. **Sync.so Temperature 0.5 → 0.7** in beiden Pässen — sichtbare Artikulation auf neutralem Plate.

3. **Pass-2-Dimensions-Fallback** (`poll-twoshot-lipsync`)
   - Wenn die MP4-Probe des Pass-1-Outputs unplausible Maße zurückgibt (z.B. quadratisch statt 16:9), wird auf die Anchor-FaceMap-Dimensionen zurückgefallen. Damit landen die Face-Koordinaten für Pass 2 garantiert im richtigen Pixelraum.

4. **Fehlerhafte Szene zurückgesetzt** (`b6c2402c-…`)
   - Clip, Sync-Jobs, Stages, Diagnose entfernt.
   - Bereit für „🎥 Clip + Lip-Sync neu rendern".

## Validierung

- `clip_error` bleibt bei Erfolg leer.
- Pass 1 + Pass 2 nutzen `temperature 0.7`.
- Masterprompt enthält keine `closed/resting/relaxed lips`-Phrasen mehr.
- Pass 2 nutzt Anchor-Dimensionen, falls Probe unplausibel.

Bitte „🎥 Clip + Lip-Sync neu rendern" auf der Szene drücken.
