# V500-A — Golden-Contract-Extraktion (READ-ONLY)

Quelle: bekannter funktionierender v400-Homepage-Lauf
`composer_scenes.id = c934a823-47de-49b7-a62e-a116b49ca3b2`
(`lip_sync_status = done`, `dialog_shots.version = 5`, 4/4 Passes `done`).
Plate: **1284 × 718**. Alle Werte sind wörtlich aus dem persistierten
Pass-State übernommen, nichts ist aus der v400-Prosa abgeleitet.

Eingefroren als Fixture: `supabase/functions/_shared/v500-golden-contract.ts`
mit Conformance-Tests `v500-golden-contract.test.ts` (6/6 grün).

## Gemessener Golden-Contract je Pass

| Pass | Face-Bbox (Plate) | Crop (x, y, size → 720) | Anchor | Mouth-Offset | plate_mouth | Camera-Path | Mundhöhe¹ | Face-Share | Face px (Preclip) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 809,159,867,231 | 728, 84, 220 | `face_center` | 0 | `null` | keiner | 0.5962 | 0.327 | 236 |
| 1 | 355,157,427,257 | 266, 82, 250 | `face_center` | 0 | `null` | keiner | 0.6120 | 0.400 | 288 |
| 2 | 663,169,715,235 | 578, 92, 220 | `face_center` | 0 | `null` | keiner | 0.5840 | 0.300 | 216 |
| 3 | 1067,197,1109,253 | 976, 114, 222 | `face_center` | 0 | `null` | keiner | 0.5706 | 0.252 | 182 |

¹ rekonstruiert mit derselben `FACE_MOUTH_Y_RATIO = 0.78`, die die Engine ohne
Landmark benutzt — der Golden Run hat **nie** einen Mund gemessen.

T10-Dispatch, in allen vier Passes identisch:
`model = sync-3`, `retry_variant = bbox-url-pro`,
`asd_mode = bounding_boxes_url` (keine Koordinaten), `sync_mode = cut_off`,
`input_space = clip`, `dispatch_video_kind = preclip`,
`options_keys = [sync_mode, active_speaker_detection]`,
`pipeline = v204_preclip_bbox_clipspace`, `speakers = 4`, 30 fps.
Kein Outcome-Gate-Verdikt persistiert — der Lauf endete schlicht `done`.

## Befund: zwei Annahmen des V500-Plans halten der Messung nicht stand

**1. Der Golden Run hat den Mund nie priorisiert.**
`preclip_anchor = face_center`, `preclip_mouth_offset_px = 0`,
`plate_mouth = null` in allen vier Passes. Die Crop-Mitte ist exakt die
Gesichtsmitte (`crop.x + size/2 = coords[0]`, ±1 px). Ein „Mouth-priority
Preclip" existierte in v400 nicht.

**2. „Mund bei ~62 %" war kein Ziel, sondern ein Nebeneffekt — und lag real
bei 0.571–0.612.** Genau das Band, das V476 heute als Defekt gemeldet hat
(0.489–0.590). Die Differenz zwischen Golden und heute ist damit deutlich
kleiner als angenommen und liegt vollständig innerhalb der Streuung von
Kopfgröße und Kopfhaltung.

**3. Der Golden Run hatte überhaupt keinen Camera Path.** Keine
`preclip_camera_path`-Felder, statischer Crop pro Pass. „Camera Path folgt dem
Kopf" ist ein späterer Zusatz (V452/v359), kein v400-Vertrag.

Was der Golden Run dagegen sehr wohl erfüllt: die T9-Invarianten
(Face-Share 0.252–0.400 ≥ 0.24; Face 182–288 px ≥ 144 px) und einen
einheitlichen, schmalen T10-Payload.

## Konsequenz für V500-B

V500-B war formuliert als „Mund-Zielhöhe 0.62 statt 0.50 + Landmark trägt die
Camera-Path-Trajektorie". Gegen den gemessenen Golden-Contract wäre das keine
Restauration, sondern eine **neue** Geometrie: der Lauf, der funktioniert hat,
war face-zentriert und statisch.

Damit ist die verbleibende belastbare Differenz Golden ↔ heute nicht die
Mundhöhe, sondern:

- **Crop-Größe / Face-Share.** Golden: 0.252–0.400. S01 heute: ~0.276–0.278,
  also am unteren Rand — größere Köpfe im Preclip sind der auffälligste
  Golden-Vorteil.
- **ASD-Payload.** Golden: eine `bounding_boxes_url`, keine Koordinaten.
  Heute: per-Frame-ASD (V464) plus Ladder-Varianten.
- **Outcome-Gate.** Golden: kein Verdikt, kein NOOP-Begriff. Heute: metrischer
  Klassifikator, der Läufe terminalisiert.

Gate V500-A = **PASS**. STOP — V500-B muss vor der Umsetzung auf diesen
gemessenen Contract umgeschrieben werden, statt die 0.62/Dynamik-Annahme zu
implementieren.
