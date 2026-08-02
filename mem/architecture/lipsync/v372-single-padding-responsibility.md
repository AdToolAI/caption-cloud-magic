---
name: Lipsync v372 — Eine Padding-Zuständigkeit für die Ziel-Bounding-Box
description: Kontextaufschlag auf die Sync.so-Zielbox passiert genau einmal an der Aufrufstelle; Tracker liefert rohe Boxen; entartete Boxen werden auf 55% Fläche geclampt statt abgebrochen.
type: architecture
---

# v372 — Padding genau einmal (2026-08-02)

## Belegter Fall

Szene `6bf4e815-b4b0-4364-af16-9aafa9054aad`, Pass 1 (Samuel Dusatko):

| Sprecher | Track-Quelle | Box-Fläche | Ergebnis |
|---|---|---|---|
| Samuel | `anchor_fallback` | **84.86 %** | Passthrough → Hard-Fail |
| Matthew | `tracked` | 38.49 % | ok |
| Sarah | `tracked` | 38.00 % | ok |
| Kailee | `tracked` | 41.27 % | ok |

Korrekte Clip-Box war `[154,113,561,624]`. Nach dem Tracking-Ausfall wurde sie
ein zweites Mal aufgeweitet zu `[52,0,663,720]`. Sync.so bekam praktisch das
ganze Bild statt einer Zielperson und gab den Preclip unverändert zurück.

## Root Cause (zwei, nicht eine)

1. **Padding hatte keine eindeutige Zuständigkeit.** `face-track.ts` paddete
   seine Keyframes selbst; die Anchor-Box war bereits über den 8%-Plate-Pad
   und die Clip-Transformation kontextualisiert — der Fallback paddete sie
   erneut.
2. **Das Sanity-Gate deckte den Fall nicht ab.** Im Preclip-Modus liegt die
   v152-Obergrenze bei 0.98; eine 84.86%-Box galt dort als plausibel.

## Invariante ab v372

- `trackFaceAcrossTurn` liefert **rohe** Gesichtsboxen. Der Tracker paddet nie.
- Der Kontextaufschlag (`withContextPadding`) wird ausschließlich an der
  Aufrufstelle angewendet, die die Dispatch-Geometrie baut — je Box genau
  einmal.
- Tracking-Erfolg oder -Ausfall darf die Boxgeometrie nicht systematisch
  verändern.
- `clampBoxArea` schneidet Boxen über `MAX_DISPATCH_BOX_AREA_FRAC = 0.55` zum
  Mittelpunkt hin zurück, statt die Szene abzubrechen. Ein Hard-Fail würde
  Credits vernichten, obwohl die Geometrie korrigierbar ist.

## Warum Clamp und nicht Hard-Fail

v344–v355 haben gezeigt: zusätzliche harte Geometrieschwellen blockieren
legitime Szenen, werden gelockert, und der Passthrough kommt zurück. Die
Grenze 0.55 liegt bewusst deutlich über dem gemessenen Arbeitsbereich
(38–41 %) und fängt nur Entartungen ab.

## Forensik

Pro Pass persistiert: `_v357TrackSource`, `_v372BoxIn`, `_v372BoxOut`,
`_v372Clamped`; Logzeile `v372_box_geometry`.

## Dateien

- `supabase/functions/_shared/face-track.ts`
- `supabase/functions/_shared/face-track.test.ts` (Regression mit den echten
  Samuel-Werten)
- `supabase/functions/compose-dialog-segments/index.ts`

## Offen (getrennt)

`CreateCollection … AccessDeniedException` in `compose-dialog-segments`. Für
diesen Fehlschlag **nicht** ursächlich, kostet aber die Identitätsabsicherung
über die Rekognition-Face-Collection.
