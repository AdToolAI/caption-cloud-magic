# V473 — Detector Validity Audit (READ-ONLY)

**Frage:** Würde die heutige Verdict-Kette (V465 `mouth_over_frame` + V471-ROI) den
bekannten, sichtbar korrekten 4-Sprecher-Homepage-Clip als Erfolg oder als NOOP bewerten?

**Kontrollgruppe:** Scene `c934a823-47de-49b7-a62e-a116b49ca3b2` (03.08.2026, 4 dialog turns,
`lip_sync_status = done`, v400-Golden-Run, Quelle des deutschen Startseiten-Clips).
Alle 4 Pass-Paare (Preclip-Input 720×720 + Provider-Output 720×720) waren noch abrufbar
und wurden bit-identisch heruntergeladen.

## 1. Produktionspfad heute: nicht messbar

Die v400-Pässe tragen `preclip_face_share = 0`, kein `face_geometry`, keinen
`preclip_mouth_offset_xy`. `resolveV471MouthRoi()` liefert damit
`unresolved:face_share_invalid`. Der heutige Produktionspfad käme auf diesen Artefakten
also gar nicht zu einem Verdict, sondern zu `mouth_roi_unresolved` → `motion_unverified`
(V458/V466-Passthrough). Für die Validitätsfrage musste die ROI daher rekonstruiert werden.

## 2. Re-Score (N = 6, identische Metrikdefinition wie `v465-mouth-over-frame.ts`)

Band = V471 (`0.53 × 0.23` × √face_share, face_share 0.42) → 0.343 × 0.149 normalisiert.
Variiert wurde nur die vertikale ROI-Lage `cy`.

| Pass | frame_edit | cy=0.50 | cy=0.55 | cy=0.58 | cy=0.61 | cy=0.64 | cy=0.67 | cy=0.70 |
|------|-----------:|--------:|--------:|--------:|--------:|--------:|--------:|--------:|
| P0   | 0.912 | **2.42** | 3.54 | 4.68 | 5.32 | 5.66 | 5.56 | 5.03 |
| P1   | 1.107 | **1.43** | 1.79 | 2.31 | 3.06 | 3.55 | 4.23 | 4.37 |
| P2   | 0.846 | **1.79** | 2.50 | 2.94 | 3.08 | 3.13 | 2.98 | 2.52 |
| P3   | 0.875 | **1.91** | 3.69 | 4.43 | 4.53 | 4.47 | 4.06 | 2.83 |

Band-Kontrakt V465: `< 2.00` NOOP · `2.00 – 2.65` INDETERMINATE · `> 2.65` MOVED.

Schwerpunkt der tatsächlichen Edit-Map (Top-1 %-Masse) je Pass:
P0 cy 0.643 · P1 cy 0.699 · P2 cy 0.638 · P3 cy 0.613 (cx 0.51–0.62).
Mit dieser echten Mundlage: Ratios **4.29 – 5.48**, alle vier eindeutig MOVED.

## 3. Befund

1. **Der Golden Run würde heute scheitern.** Mit der aktuell in Produktion verwendeten
   ROI-Zentrierung (Mund ≈ Bildmitte, cy ≈ 0.50–0.54) scoren **3 von 4 Pässen unter 2.00 →
   terminaler NOOP**, obwohl der Clip nachweislich sauberen Lip-Sync zeigt.
   Der Detektor ist als *terminales* Gate in dieser Form falsifiziert.
2. **Die Metrik selbst ist nicht das Problem.** Sobald die ROI auf dem realen Mundband
   (cy ≈ 0.61 – 0.64) liegt, trennt `mouth_over_frame` sauber: alle vier bekannten
   Erfolgsfälle liegen bei 3.06 – 5.66, weit über der MOVED-Schwelle.
3. **Die Ursache ist erneut die Mundverankerung, nicht der Provider.** Das Ergebnis
   repliziert V471-A unabhängig auf einer anderen Szene: der abgeleitete Mundanker liegt
   systematisch ~0.10 – 0.15 Cropsegment zu hoch (Nase/Oberlippe statt Mundband).
   V471-B korrigiert das nur, wenn `face_share`, `face_bbox` und `mouth_offset` persistiert
   sind — fehlen sie, greift keine der beiden Ableitungen.
4. **Konsequenz für S01:** Die dort gemessenen 1.30 – 1.82 sind nach diesem Befund nicht
   als bewiesene Provider-NOOPs zu lesen. Sie liegen exakt in dem Bereich, den der Golden
   Run bei zu hoher ROI ebenfalls produziert.

## 4. Empfehlung (nicht umgesetzt — Gate war READ-ONLY)

- Terminalisierung auf `mouth_over_frame` erst wieder zulassen, wenn die ROI aus einer
  verifizierten Mundbeobachtung stammt (Landmark oder edit-map-validierter Anker);
  ohne verifizierten Anker → `motion_unverified`, nie `ssw:noop_fail`.
- V471-Fallback gegen den Golden-Run-Datensatz nachkalibrieren (Zielband cy ≈ 0.61 – 0.64).
- Diesen 4-Pass-Datensatz als permanente Known-Good-Regressionsfixture einfrieren:
  jede künftige Verdict-Änderung muss alle vier Pässe als MOVED bestätigen.

**V473 = PASS (Detektor als terminales Gate falsifiziert).** Keine Codeänderung, kein Rerender.
