## Was der Fehler wirklich ist

Die Meldung „preclip_face_share_too_low … 2.8 %" ist **kein Erkennungsfehler auf dem Bild**, sondern ein Rechenfehler in unserer eigenen Crop-Logik.

Aus den Logs der betroffenen Szene (`69d56a49…`, Sprecher Samuel Dusatko, 4 Sprecher):

```text
v331_motion_cover applied=true samples=2 drift_px=4 crop=30,0,394 face_share=0.028
v329_preclip_face_share_too_low face_share=0.028 floor=0.24 geometry=ok
plate_box_w_pct=0.0428  crop={"x":30,"y":0,"size":394}
```

Zwei Zahlen passen nicht zusammen:
- Die Gesichtsbox aus der Plate-Identität ist ca. **4,3 % der Plate-Breite** (~55 px).
- Der Motion-Cover hat den Crop trotzdem auf **394 px** aufgezogen — obwohl die gemessene Bewegung nur **4 px** beträgt und nur **2 Track-Samples** vorlagen.

Ursache: In `pass-face-preclip.ts` bildet der v331-Motion-Block die Hüllbox aus den **Track-Boxen** (anderer Detektor, andere Skala) und rechnet den Face-Share danach mit der **kleinen Plate-Box** gegen die große Hüllfläche. Das Ergebnis ist systematisch zu klein (55²/394² ≈ 2,8 %) und fällt unter den v331-Floor von 0,24. Der Gate stuft das als garantierten No-Op ein, bricht ab und erstattet Credits — obwohl der eigentliche Mund-Anker-Crop (Ziel-Face-Share 42 %) völlig in Ordnung war.

## Fix (v334 — Motion-Cover Face-Share-Konsistenz)

**1. Face-Share konsistent messen** (`supabase/functions/_shared/pass-face-preclip.ts`)
Nach dem Motion-Cover den Share nicht mehr aus der Einzelframe-Plate-Box gegen die Hüllfläche rechnen. Stattdessen die **mediane Track-Boxfläche** (dieselbe Quelle wie die Hüllbox) verwenden; nur wenn keine Track-Boxen vorliegen, die Plate-Box nutzen. Damit werden nie zwei Boxquellen vermischt.

**2. Motion-Cover nur bei echter Bewegung**
Der Block greift künftig nur, wenn
- mindestens 3 verwertbare Track-Samples vorliegen **und**
- der gemessene Drift relevant ist (> 8 % der Face-Boxbreite).
Bei 2 Samples / 4 px Drift bleibt der saubere Mund-Anker-Crop unverändert stehen.

**3. Share-erhaltende Deckelung**
Falls der Motion-Cover den Crop doch weitet, wird die Größe so gedeckelt, dass der resultierende Face-Share den geltenden Floor (0,24 bei ≥ 2 Sprechern) nicht unterschreitet — Nachbar-Deckel bleibt weiterhin die harte Obergrenze. Passt Bewegung nur mit Share-Verlust hinein, bleibt der bestehende `motion_uncoverable`-Pfad zuständig.

**4. Plausibilitätsbremse gegen Boxquellen-Drift**
Weicht die Track-Boxbreite um mehr als Faktor 2,5 von der Plate-Boxbreite ab, wird der Motion-Cover verworfen und geloggt (`v334_track_scale_mismatch`) — dann stimmen die Koordinatenräume nicht überein und wir dürfen daraus keinen Crop ableiten.

**5. Telemetrie**
Zusätzliche Felder im Pass-Meta: `preclip_motion_skip_reason`, `preclip_face_share_source` (`track` | `plate`), plus eine Logzeile pro Entscheidung, damit ein Wiederauftreten in einem Blick zuzuordnen ist.

## Betroffene Dateien
- `supabase/functions/_shared/pass-face-preclip.ts` (Kern der Änderung)
- `supabase/functions/compose-dialog-segments/index.ts` (nur neue Meta-/Logfelder durchreichen; Floor und Refund-Pfad bleiben unverändert)

## Verifikation
- Betroffene Szene neu rendern und prüfen: `v331_motion_cover applied=false skip_reason=insufficient_motion`, `face_share ≥ 0.24`, Dispatch geht raus statt `PREFLIGHT_BLOCKED`.
- Gegenprobe an einer bewegten Szene: Motion-Cover greift weiter, Share bleibt über dem Floor, kein Full-Plate-Dispatch (kein Morphing-Rückfall).
