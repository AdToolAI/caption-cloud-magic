# V465-B1 — Frozen Verdict Audit (READ-ONLY)

Kein Provider-Call, kein Produktionscode geändert. Neu bewertet wurden
ausschließlich die bereits eingefrorenen Original-Produktionsausgaben der
V462-Kohorte.

## Abdeckung

| | Pässe | Bemerkung |
|---|---|---|
| Kohorte laut V462 | 36 (18 MOVED / 18 NOOP) | Label = damaliges Produktionsverdikt |
| offline neu bewertbar | **32 (18 MOVED / 14 NOOP)** aus 11 Szenen | |
| nicht bewertbar | 4 NOOP (S01-Pässe der Szene `be60d106`) | zu einem NOOP-Pass wird **keine Provider-Ausgabe persistiert**, das Artefakt existiert nicht mehr |

Wichtige Einschränkung vorweg: Die verbleibenden vier S01-Pässe sind genau die
Fälle, um die es aktuell geht — für sie gibt es keine eingefrorene Ausgabe, also
auch keinen Frozen-Verdict-Beweis. Alle Aussagen unten gelten für die 32
bewertbaren Pässe.

## Metriken (offline, Produktionsparität soweit möglich)

Band = eingefrorenes v404-`MOTION_ROI` (cx 0.5, cy 0.60, w 0.28, h 0.12) im
720×720-Preclip-Raum, Abtastung 6 Frames mit 5 % Rand — dieselbe Geometrie und
dasselbe Zeitraster wie im Verdikt. Kontrollband = gleiche Größe bei cy 0.30
(Augen/Stirn).

1. `old_delta` = `provider.mean − preclip.mean` (heutige Verdikt-Metrik)
2. `mad_ratio` = MAD(Ausgabe) / MAD(Eingabe) (V434, heute nur Telemetrie)
3. `mouth_edit` = mittleres \|Ausgabe(t) − Eingabe(t)\| im Mundband
4. `mouth_specific` = `mouth_edit / ctrl_edit`
5. `mouth_over_frame` = `mouth_edit / frame_edit` (Ganzbild als Kontrolle)

## Trennschärfe über die 32 Frozen-Pässe

| Metrik | AUC | MOVED-Spanne | NOOP-Spanne |
|---|---|---|---|
| `old_delta` | 0.687 | −169.6 … 612.3 | −99.8 … 43.1 |
| `mad_ratio` (V434) | 0.762 | 0.88 … 7.94 | 0.89 … 1.07 |
| `mouth_edit` | 0.921 | 2.39 … 17.79 | 0.61 … 6.29 |
| `mouth_specific` | 0.901 | 1.66 … 12.58 | 0.43 … 4.82 |
| **`mouth_over_frame`** | **0.980** | **2.59 … 7.05** | **0.78 … 3.06** |

Leave-one-scene-out (Schwelle je Fold nur aus den übrigen Szenen, False
Positives dreifach gewichtet):

| Metrik | FP (NOOP → MOVED) | FN (MOVED → NOOP) | Schwellen über die Folds |
|---|---|---|---|
| `old_delta` | 1 | **11** | 19.6 / 47.2 / 97.8 |
| `mad_ratio` | 2 | **10** | 1.03 … 1.14 |
| `mouth_edit` | 1 | 7 | 6.24 … 6.78 |
| `mouth_specific` | 2 | 2 | 1.85 / 2.09 |
| **`mouth_over_frame`** | **1** (COH21) | **1** (COH07) | 2.59 / 2.82 |

## Befunde

**1. Die heutige Verdikt-Metrik ist nachweislich untauglich.** `old_delta` ist
bei 11 von 18 belegten MOVED-Pässen negativ oder unterschwellig — darunter
COH06 (−169.6), COH20 (−141.7), COH05 (−43.2). Auf bewegten Platten kollabiert
sie genau wie vermutet. Das bestätigt die Hypothese unabhängig von S01.

**2. Der V434-MAD-Quotient darf NICHT autoritativ werden.** Die Verteilungen
überlappen massiv: NOOP 0.89 … 1.07, aber sieben belegte MOVED-Pässe liegen
ebenfalls bei 0.88 … 1.05 (COH06 0.875, COH20 0.941, COH13 0.948, COH07 0.954,
COH14 0.991). LOSO: 10 False Negatives. Der bereits gebaute skalenfreie Detektor
ist also **nicht** der richtige Detektor. Gut, dass er nicht blind promoted wurde.

**3. Output-gegen-Input mit Kontrollregion trennt sauber** — allerdings ist die
bessere Kontrolle das Ganzbild, nicht das Wangen-/Stirnband: `mouth_specific`
(Kontrollband) erreicht AUC 0.901, `mouth_over_frame` 0.980. Grund: bei starker
Kamerabewegung ändert sich das Stirnband selbst stark und verrauscht den Nenner.

**4. Die ursprünglichen NOOP-Ausgaben waren überwiegend echte Passthroughs.**
Zehn der 14 bewerteten NOOPs zeigen `mouth_edit` ≤ 2.3 bei `mouth_over_frame`
≤ 1.4 — die Mundregion änderte sich nicht stärker als das Restbild, das ist
Codec-Rauschen. Das alte Verdikt lag dort richtig. Auffällig sind vier:

| Pass | mouth_edit | ctrl | frame | mouth/frame | Lesart |
|---|---|---|---|---|---|
| COH21 | 6.29 | 1.73 | 2.06 | **3.06** | sehr wahrscheinlich echter Lip-Sync, fälschlich als NOOP verworfen |
| COH22 | 5.49 | 2.98 | 2.69 | 2.04 | Grenzfall |
| COH23 | 4.80 | 2.84 | 2.95 | 1.63 | eher Ganzbildänderung |
| COH01 | 5.58 | 5.70 | 3.24 | 1.73 | Ganzbild neu erzeugt, Mund nicht bevorzugt — kein Lip-Sync |

Damit ist die Frage aus deiner Freigabe klar beantwortet: **serienweise falsche
NOOPs sind auf dieser Kohorte nicht belegt** — belegt ist ein Einzelfall
(COH21) plus ein Grenzfall (COH22). Die Metrik ist trotzdem falsch; sie
verwirft nur bisher seltener, als die S01-Serie vermuten ließ.

## Drei-Verdikt-Bänder (Kandidat für V465-B2)

`mouth_over_frame` mit Graubereich, ausgewertet auf denselben 32 Pässen:

| Band | NOOP | MOVED | INDETERMINATE | Fehler |
|---|---|---|---|---|
| < 1.6 / > 2.6 | 10 | 18 | 4 | 1 FP (COH21) |
| < 1.8 / > 2.9 | 12 | 15 | 5 | 1 FP (COH21) |
| **< 2.0 / > 3.1** | **12** | **13** | **7** | **0 FP, 0 FN** |

Das konservative Band 2.0 / 3.1 hält auf dieser Kohorte beide Fehlerarten bei
null und schickt 7 von 32 Pässen (22 %) in `INDETERMINATE`. Das ist der Preis
für einen strengen False-Positive-Schutz und passt zur Vorgabe, `INDETERMINATE`
nicht künstlich zu MOVED zu machen.

## Offene Punkte vor V465-B2

- Die vier S01-NOOP-Pässe fehlen in dieser Auswertung, weil zu einem NOOP keine
  Ausgabe gespeichert wird. Ein Verdikt-Umbau sollte die Provider-Ausgabe auch
  im Fehlerfall persistieren, sonst bleibt jeder künftige Frozen-Audit blind.
- Die Schwellen stammen aus 32 Pässen und 11 Szenen. Sie sind LOSO-stabil
  (2.59 / 2.82), aber schmal belegt; das konservative Band lässt Luft.
- Offline gemessen wurde mit ffmpeg-Frames, produktiv mit Remotion-Lambda-Stills.
  Vor einer Promotion muss die Metrik einmal auf identischen Lambda-Stills
  nachgerechnet werden.
