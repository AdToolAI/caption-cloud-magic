---
name: v360 Kopf-Framing & Dispatch-Stopp bei failed
description: Belegte Passthrough-Ursache (angeschnittener Kopf durch Anker unter dem Kinn), Anchor-Repair + Head-Containment im Preclip-Crop, kein Sync.so-Dispatch mehr nach terminalem Szenen-Fail
type: architecture
---

## Forensik (Szene 89c5e01c, 01.08.2026)
Frames aus den echten Preclips angesehen:
- **Pass 1 (Matthew)** — Crop 145 px bei Ankerpunkt (562, 293), Face-Bbox
  [561,176,633,275]. Der Anker lag **18 px unter dem Kinn**, der quadratische
  Crop begann dadurch auf Mundhöhe: im Preclip sind nur Kinn, Hals und Schulter
  zu sehen. Sync.so bekam ein halbes Gesicht → Passthrough.
- **Pass 3 (Kailee)** — Gesicht vollständig und zentriert, aber Crop 148 px auf
  720 hochskaliert (4,9×): der Mund ist ein Verlauf ohne Kante.
- **Pass 2 (Sarah)** — Crop 396 px, Gesichtsseite 312 px nativ → der einzige
  Preclip mit echter Munddetailtiefe.
- **Pass 0** — ohne Preclip (Full-Plate) gelaufen, verdict `moved`.

Der Verdict war also **korrekt**: es war echter Provider-Passthrough, kein
Messfehler des Mundbands. v359 (mitziehender Crop) war nicht beteiligt —
`peak_motion_px=10`, `mode=static`, Containment 1.000.

## Regeln ab v360
1. **Anchor-Plausibilität** (`compute-mouth-centered-crop.ts`): Liegt der
   übergebene Anker außerhalb der Face-Bbox (Toleranz 15 % seitlich, 10 %
   unter dem Kinn), wird er durch den aus der Bbox abgeleiteten Mundpunkt
   (72 % Höhe) ersetzt. Flag `anchorRepaired`.
2. **Head-Containment**: Der Crop muss die Bbox plus 30 % Stirnrand und 10 %
   Kinnrand enthalten; sonst wird er vergrößert und eingepasst. Der Mund bleibt
   unterhalb der Crop-Mitte, wird aber nie mehr auf Kosten der Stirn zentriert.
   Flag `headContained`. Beide Flags werden am Pass persistiert und geloggt
   (`v360_head_frame`).
3. **Kein Dispatch nach terminalem Fail** (`compose-dialog-segments`):
   Unmittelbar vor `POST /v2/generate` wird `clip_status` / `dialog_shots.status`
   gelesen; bei `failed` bricht der Pass mit `skipped_scene_failed` ab
   (Credits zurück, Slot frei). Vorher griff der Check nur im Webhook, weshalb
   nach dem Abbruch noch bezahlte Jobs rausgingen ("Szene fehlgeschlagen" +
   "Lip-Sync läuft" gleichzeitig).

## Offene Telemetrie
Native Gesichtsbreite bleibt der stärkste Erfolgsindikator (312 px → moved,
94–96 px → passthrough). Es wurde bewusst **kein** neues blockierendes
Pixel-Gate eingeführt (siehe v355/v356); der Wert wird nur geloggt.

Mirror-Pflicht: `src/lib/composer/computeMouthCenteredCrop.ts` muss identisch
zur Deno-Datei bleiben.
