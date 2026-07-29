## Ziel
UCC-Export 100% pixelnah zum hochgeladenen Rohvideo/-bild — der letzte sichtbare Rest kommt vom Sensor-Baseline-Grade (`contrast(1.03) saturate(1.05)`), der beim vorletzten Fix in den UCC-Export eingezogen wurde. Der wird jetzt aus UCC entfernt.

## Change (nur eine Datei)
`src/remotion/templates/UniversalCreatorVideo.tsx`

- Zeile 2139 (Video-Layer): `filter: previewMode ? undefined : SENSOR_BASELINE_GRADE_FILTER` → `filter: undefined` in beiden Modi.
- Zeile 2153 (Image-Layer): `if (!previewMode) imgFilterParts.push(SENSOR_BASELINE_GRADE_FILTER)` entfernen, damit auch für Standbilder kein Baseline-Grade mehr addiert wird.
- Import in Zeile 16 aufräumen, wenn ungenutzt.

Damit gilt für UCC (Preview UND Export):
- Videos rendern via `OffthreadVideo` frame-exakt aus ffmpeg, ohne CSS-Filter.
- Bilder rendern ohne Grade-Filter (Ken-Burns/andere Effekte bleiben, wenn aktiviert).
- Encode-Floor bleibt: `jpegQuality 95`, `crf 16`, `videoBitrate 10M` — kein sichtbarer Qualitätsverlust durch H.264.

Director's Cut bleibt unverändert (`prependSensorBaseline` in `DirectorsCutVideo.tsx` bleibt aktiv), weil DC bewusst cinematic-graded exportiert.

## Was NICHT angefasst wird
- `sensorBaselineGrade.ts` bleibt bestehen (DC nutzt es weiter).
- Keine Änderung an Codec/Quality-Floor, Concurrency, Preview-Pipeline oder DC-Export.
- Keine Änderung an Business-Logik oder Payload-Struktur.

## Verifikation
1. `tsgo` gegen die Datei — Import darf nicht als "unused" scheitern.
2. Testrender: dasselbe Landscape-Studio-Video durch UCC schicken, Frame gegen Upload vergleichen — Kontrast/Saturation müssen jetzt matchen (nur H.264-Kompression als Delta).
3. DC-Testrender: Grade muss weiterhin sichtbar sein (kein Kollateral).

## Erwartetes Rest-Delta
Nach dem Fix bleiben nur unvermeidbare H.264-Artefakte (minimale Bandenbildung in Farbverläufen, keine Kontrast-/Sättigungsverschiebung). Das ist so nah am Rohupload wie ein 10-Mbit-H.264-Export überhaupt kommen kann.