# V471-A — ROI × Sampling Parity Audit (READ-ONLY)

Kein Provider-Call, kein S01-Rerender, keine Threshold-/Code-Änderung.
Datenbasis: die in Produktion gepinnten Artefakte von Szene `be60d106…` (S01),
Run `95b11254…`, gen-15 (`v434_artifact_pins`, `purpose=production`):
`pass-N/preclip-a0.mp4` + `pass-N/provider-output-a0.mp4`.

## Aufbau des 2×2

Alle vier Zellen nutzen **einen** Decoder und **eine** Leinwand (Produktions-Still-Canvas
1280×720, `object-fit: cover`, Port von `stillRoiForSource`). Variiert werden nur zwei Achsen:

| | Produktions-ROI (`deriveMouthRoi`) | Audit-ROI (frozen v404 `MOTION_ROI`) |
|---|---|---|
| **N=6**, Produktions-Timestamps (frame-quantisiert `round(t·30)`) | **A** | **B** |
| **N=16**, Audit-Timestamps (kontinuierlich) | **C** | **D** |

Produktions-ROI aus der persistierten Pass-Geometrie (`preclip_face_share`,
`preclip_crop.size`, signed `mouth_offset_xy`):
P1 → `cx .5000 / cy .5426 / w .3258 / h .1787`, P2 → `cx .5000 / cy .5476 / w .3269 / h .1793`.

## Ergebnis-Matrix (`mouth_over_frame`)

| Fall | A (prodROI×N6) | B (auditROI×N6) | C (prodROI×N16) | D (auditROI×N16) |
|---|---|---|---|---|
| **P1** (Produktion NOOP 1.817) | **1.812 NOOP** | **2.336 INDETERMINATE** | **1.807 NOOP** | **2.412 INDETERMINATE** |
| **P2** (Produktion MOVED) | 2.934 MOVED | 4.217 MOVED | 3.140 MOVED | 4.453 MOVED |
| COH08 (Known NOOP) | 0.826 | 0.826 | 0.857 | 0.857 |
| COH10 (Known NOOP) | 0.712 | 0.712 | 0.732 | 0.732 |
| COH02 (Known MOVED) | 3.527 | 3.527 | 3.742 | 3.742 |

Detektor-Parität: **A = 1.812** reproduziert den Produktionswert **1.817** (Δ 0.005).
Die Offline-Kette misst also exakt das, was live gemessen wurde.

Für die COH-Kontrollen existiert keine persistierte Mund-Geometrie → Produktions-ROI *ist*
dort der frozen v404-ROI (IoU 1.0). Deshalb kollabiert bei ihnen die ROI-Achse; die
Sampling-Achse bleibt aussagekräftig.

## Interpretation — Fall „ROI ist die Ursache"

```
A ≈ C ≈ 1.81   (ROI = Produktion)
B ≈ D ≈ 2.34 … 2.41   (ROI = Audit)
```

* Sampling-Effekt N=6 → N=16: **−0.005 (P1, prodROI)**, +0.076 (P1, auditROI),
  +0.206 (P2), +0.031/+0.020/+0.215 (COH). Vernachlässigbar, kein Vorzeichenwechsel.
* ROI-Effekt N=6 → identische Stills: **+0.524 (P1)**, **+1.283 (P2)**.

Die 1.817→2.899-Differenz aus V470 ist damit **nicht** durch sechs vs. sechzehn Stills
erklärt, sondern durch die Messregion. (Der Rest bis 2.899 stammt aus dem
720×720-Raum des V470-Skripts statt der 1280×720-Produktionsleinwand — ebenfalls
eine ROI-/Raum-Differenz, keine Sampling-Differenz.)

## ROI-Parität, frameweise in finalen Integer-Pixeln

| | P1 | P2 |
|---|---|---|
| Produktions-Box (bx,by,bw,bh) | 432, 300, 417, 229 | 431, 306, 418, 229 |
| Audit-Box | 461, 411, 358, 154 | 461, 411, 358, 154 |
| **IoU** | **0.390** | **0.417** |
| Center-Δ (x, y) | −0.5, **+73.5** | 0.0, **+67.5** |
| ROI-Pixel | 95 493 vs. 55 132 | 95 722 vs. 55 132 |

Die beiden Definitionen messen also nachweislich **nicht** denselben Mund: 60 % Fläche
Unterschied und ein vertikaler Center-Versatz von ~70 px auf der Still-Canvas.

### Welche Box sitzt wirklich auf dem Mund?

Pixelweise Edit-Karte `mean_t |out(t) − in(t)|` über die 16 Stills:

| | Edit-Peak-Zeile | Prod-Box (Zeilen) | Audit-Box (Zeilen) | Edit-Dichte prod / audit | Top-1-%-Edit-Pixel im … |
|---|---|---|---|---|---|
| P1 | **505** | 300–529 (Mitte 414) | 411–565 (Mitte 488) | 4.891 / **6.528** | prod 47 % · audit 38 % |
| P2 | **476** | 306–535 (Mitte 306+114) | 411–565 | 11.235 / **15.934** | prod 81 % · audit **92 %** |

Der tatsächlich bearbeitete Mundbereich liegt bei Zeile ~476–505. Die **Audit-Box ist
darauf zentriert**, die **Produktions-Geometrie-Box ist ~70–90 px zu hoch und ~1.7× zu groß** —
sie zieht Nase/Wange/unbearbeitete Haut mit in den Zähler und verdünnt genau das Signal,
auf dem das Verdict beruht.

Rückgerechnet: der Edit-Schwerpunkt entspricht im 720er-Preclip-Raum ≈ `cy 0.61`,
während die persistierte Geometrie `cy 0.5426` liefert. Der persistierte
`mouth_offset_xy.dy = 8` Plate-Pixel ist also deutlich zu klein; der reale Mund sitzt
~51 Preclip-Pixel tiefer. Zufällig liegt der frozen v404-Wert (`cy 0.60`) hier fast
exakt richtig — die Geometrie-Kopplung ist die fehlerhafte Seite, nicht der Legacy-Wert.

## Konsequenz für P1

Mit der Box, die den Mund tatsächlich enthält, ist P1 **2.34 – 2.41 → INDETERMINATE**,
nicht MOVED und nicht NOOP. Unter der V466-Grauband-Regel wäre P1 als
`motion_unverified` durchgelaufen statt als `ssw:noop_fail` terminalisiert zu werden.
P1 bleibt damit korrekt als **measurement-disputed** eingestuft.

## Risikoabschätzung für echte Passthroughs

COH08/COH10 (bewiesene NOOPs) bleiben in allen vier Zellen bei 0.71–0.86, weit unter 2.00.
Weder eine ROI- noch eine Sampling-Änderung würde sie fälschlich grün machen.

## Ableitung (nicht implementiert)

* **V471-B als Sampling-Patch ist widerlegt.** Ein „NOOP < 2.00 vor Terminalisierung mit
  N=16 bestätigen" hätte P1 nicht gerettet (C = 1.807).
* Nötig ist **ein einziger autoritativer Mund-ROI-Contract** — derselbe Generator für
  Webhook, Watchdog, Offline-Audit und Regression-Fixtures — plus eine Korrektur der
  Mundposition, die in die Geometrie eingeht (`mouth_offset_xy` / Bandhöhe), verifiziert
  gegen die Edit-Karte.
* Bis dahin: `mouth_over_frame` bleibt Authority, aber jede Terminalisierung auf Basis
  der geometriegekoppelten ROI ist als potenzieller False-NOOP zu behandeln.

Artefakte: `/tmp/v471/grid.json`, Harness `/tmp/v471/roi_sampling_parity.py`.
