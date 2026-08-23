# V470 — P1 ↔ P2 Cross-Swap (genau zwei Provider-Calls, danach STOP)

Szene `be60d106-…` (S01), Run vom 23.08.2026. Keine Pipeline-, Threshold-, Crop-,
Face-Tracking- oder Plate-Änderung. Keine neuen Assets: verwendet wurden exakt die in
V468 gepinnten Preclips, tight-WAVs und per-Frame-ASD-Boxen.

## Aufbau

| | Video | Audio | ASD (folgt dem Video) |
|---|---|---|---|
| Basis P1 | `p2-preclip` (41 f, 1.367 s) | pass-1 tight (1.354 s) | 41 Boxen |
| Basis P2 | `p3-preclip` (68 f, 2.267 s) | pass-2 tight (2.236 s) | 68 Boxen |
| **TEST X** | **P1 Video** | **P2 Audio** | **P1 Boxen (41)** |
| **TEST Y** | **P2 Video** | **P1 Audio** | **P2 Boxen (68)** |

Payload identisch zum Produktionspfad: `model: sync-3`, `sync_mode: cut_off`,
`active_speaker_detection { auto_detect: false, bounding_boxes_url }`.
Kein Padding, kein Trimming.

Jobs: X `3ccfd246-8e7c-460c-aa47-c170e2b12174`, Y `55abe674-17e8-4434-9c9b-4c785cb6279b`
— beide `COMPLETED`. Outputs gepinnt unter `/tmp/v470/out_X.mp4`, `/tmp/v470/out_Y.mp4`.

## Dauer-Confounder (explizit)

| | Video | Audio | Mismatch | Output |
|---|---|---|---|---|
| P1 Basis | 1.367 s | 1.354 s | −0.013 s | 1.367 s |
| P2 Basis | 2.267 s | 2.236 s | −0.031 s | 2.267 s |
| **X** (P1V+P2A) | 1.367 s | 2.236 s | **+0.869 s (Audio länger)** | 1.367 s |
| **Y** (P2V+P1A) | 2.267 s | 1.354 s | **−0.913 s (Audio kürzer)** | **1.367 s — Video von cut_off gekürzt** |

Bei Y liefert `cut_off` nur die ersten 1.367 s des P2-Videos zurück. Bewertet wird also bei
Y nur das erste Drittel des P2-Preclips. Da beide Crosses MOVED liefern, entwertet dieser
Confounder das Ergebnis nicht — er wäre nur bei einem Cross-NOOP kritisch.

## Messung (V465 `mouth_over_frame`, offline-Parität zu V465-B1/B2a)

Gray-Band-Fälle wurden gemäß V466 genau einmal mit N=16 nachgemessen.

| Fall | N | mouth_edit | frame_edit | **mouth_over_frame** | Verdikt | old_delta (nur Telemetrie) |
|---|---|---|---|---|---|---|
| Basis P1V+P1A | 6 | 5.49 | 2.14 | 2.565 | INDETERMINATE | +98.9 |
| Basis P1V+P1A | 16 | 6.57 | 2.27 | **2.899** | **MOVED** | +156.8 |
| Basis P2V+P2A | 16 | 15.93 | 2.71 | **5.869** | **MOVED** | +347.0 |
| **X** P1V+P2A | 16 | 8.10 | 2.49 | **3.261** | **MOVED** | +181.6 |
| **Y** P2V+P1A | 16 | 10.06 | 2.12 | **4.739** | **MOVED** | +151.3 |

Sichtkontrolle (Kontaktbögen `sheet_X.png`, `sheet_Y.png`, Input oben / Output unten):
Bei **beiden** Crosses ist der Mund im Output deutlich und plausibel artikuliert, Identität
und Kopfpose unverändert. Kein Morph, keine Maskenkante.

## Ergebnis: Fall 3 — beide Cross-Swaps funktionieren

```
P1V + P1A  → (Produktion) NOOP    | (Re-Score) 2.899 MOVED
P1V + P2A  → 3.261 MOVED
P2V + P1A  → 4.739 MOVED
P2V + P2A  → 5.869 MOVED
```

- **Weder P1-Video noch P1-Audio ist für sich genommen für Sync-3 ungeeignet.**
  Die Audio-Achse ist damit praktisch geschlossen: P1-Audio erzeugt auf P2-Video einen
  klaren, sichtbaren Lip-Sync.
- Die Amplitude folgt jedoch dem **Video**: beide P1-Video-Fälle liegen bei 2.9/3.3, beide
  P2-Video-Fälle bei 4.7/5.9. P1-Video hat systematisch weniger Mund-Signalreserve
  (kleines, geschlossenes, kaum bewegtes Mundbild), aber keine kategorische Untauglichkeit.

## Zweiter, unerwarteter Befund — Verdikt-Reproduzierbarkeit an der Bandgrenze

Der **unveränderte, gepinnte Produktions-Output von P1** (derselbe Call, der in Produktion
`mouth_over_frame = 1.817 → NOOP` bekam) ergibt beim Re-Scoring 2.565 (N=6) bzw. 2.899
(N=16) und damit MOVED. Ranking (P1 < P2) bleibt erhalten, der Absolutwert nicht.

Ursache ist nicht der Provider, sondern der **Mess-Pfad**: Produktion misst mit der
geometrieabgeleiteten Mund-ROI auf Lambda-Stills, das Audit mit der eingefrorenen
`MOTION_ROI`-Bande (cx .5 / cy .6 / w .28 / h .12). Für P1 (kleines Gesicht, leicht
tiefliegender Mund) driften beide ROIs auseinander.

Konsequenz für die Bewertung von P1: Der Produktions-NOOP von P1 ist **kein bewiesener
Provider-NOOP**, sondern ein ROI-/Stichprobenabhängiges Verdikt nahe der Bandgrenze.

## Offene Achse für V471 (kein Fix in diesem Gate)

Nicht mehr „P1-Audio vs. P1-Video", sondern:

1. **ROI-Parität**: dieselbe Mund-ROI-Definition für Produktion und Audit; N und
   Sampling-Fenster festschreiben. P1 als Referenzfall.
2. **Signalreserve statt Binärgate**: P1-Video liefert real weniger Mundbewegung —
   dokumentieren, nicht blockieren (V469 bleibt unverändert; P1 muss weiterhin passieren).

Keine Änderung an V465, V466, V469, ASD, Payload oder Refund-Logik in diesem Gate.
