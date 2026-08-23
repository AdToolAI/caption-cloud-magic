# V466-B — NOOP vs. MOVED innerhalb derselben Plate (READ-ONLY)

Szene `be60d106-6908-4002-95d1-2bd01c5cfa6c`, Run `95b11254`, gen-15, 23.08.2026 22:0x UTC.
Alle 10 Artefakte (5× Preclip, 5× Provider-Output) stammen aus der V465-B2a-Pinning-Kette
(`v434_artifact_pins`, status `written`) — erstmals auch für die NOOP-Pässe.
Keine Provider-Calls, kein Rerender, keine Pipeline-Änderung.

Produktions-Verdikte (Lambda, N=6):
Pass 0 = 1.299 NOOP · Pass 1 = 1.817 NOOP · Pass 3 = 2.537 GRAY · Pass 2 = 2.950 MOVED · Pass 4 = 3.075 MOVED.

## 1. Frameweiser Output-vs-Input-Vergleich (alle Frames, offline)

| Pass | Label | n | mouth_edit | frame_edit | mouth/frame | upper_face_edit | mouth/upper | Frames ratio>3 | erster Frame ratio>2 | in_mouth_motion | out_mouth_motion | out/in |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | NOOP | 71 | 3.94 | 1.68 | 2.35 | 1.19 | 3.31 | 11/71 | 0 | 1.86 | 2.43 | 1.30 |
| 1 | NOOP | 41 | 7.59 | 2.25 | 3.37 | 1.32 | 5.76 | 22/41 | 0 | 0.51 | 3.41 | 6.65 |
| 3 | GRAY | 61 | 7.25 | 1.93 | 3.75 | 1.25 | 5.82 | 36/61 | 1 | 0.83 | 1.73 | 2.09 |
| 4 | MOVED | 59 | 6.85 | 1.54 | 4.44 | 0.98 | 7.01 | 43/59 | 4 | 1.11 | 3.70 | 3.34 |
| 2 | MOVED | 68 | 13.07 | 2.72 | 4.80 | 1.36 | 9.62 | 54/68 | 1 | 2.45 | 4.90 | 2.00 |

Rangfolge offline (0 < 1 < 3 < 4 ≈ 2) deckt sich mit der Produktionsmessung (0 < 1 < 3 < 2 ≈ 4).
Die Klassifikation ist also **kein Messartefakt der 6 Stills**.

Entscheidend: **Kein Pass ist ein vollständiger Passthrough.** Auch Pass 0/1 zeigen
mundlokalisierte Änderungen ab Frame 0 (mouth/upper 3.3 bzw. 5.8), Pass 1 erhöht die
Mundbewegung gegenüber dem Input sogar um Faktor 6.65. „NOOP" bedeutet hier
*schwach/unspezifisch*, nicht *unbearbeitet*.

## 2. Registrierung: wo liegt die Änderung?

Vertikales Edit-Profil innerhalb der ASD-Box (20 Bänder):

| Pass | Edit-Schwerpunkt (Anteil Boxhöhe) | Peak-Band |
|---|---|---|
| 0 | 0.65 | 0.75–0.80 |
| 1 | 0.70 | 0.80–0.85 |
| 3 | 0.68 | 0.75–0.80 |
| 4 | 0.70 | 0.75–0.80 |
| 2 | 0.72 | 0.75–0.80 |

Alle fünf Pässe editieren dieselbe Region (Mundband). **Keine Fehlregistrierung, kein
Ausweichen auf Augen/Stirn.** V464 hält.

## 3. Speech-Lock — der einzige saubere Trenner

mouth_edit getrennt nach voiced/unvoiced Frames der tatsächlich gesendeten Spur:

| Pass | Label | voiced mouth_edit | unvoiced mouth_edit | v/u | corr(mouth_edit, RMS) |
|---|---|---|---|---|---|
| 0 | NOOP | 4.30 | 3.52 | **1.22** | **0.20** |
| 1 | NOOP | 9.12 | 5.98 | **1.53** | **0.42** |
| 3 | GRAY | 10.05 | 4.54 | 2.21 | 0.57 |
| 4 | MOVED | 9.07 | 4.02 | 2.26 | 0.59 |
| 2 | MOVED | 16.79 | 8.36 | 2.01 | 0.67 |

Trennung überlappungsfrei: NOOP ≤ 1.53 / corr ≤ 0.42 gegen MOVED+GRAY ≥ 2.01 / corr ≥ 0.57.
Bei Pass 0/1 verändert Sync.so den Mund **kontinuierlich, aber nicht phonemgekoppelt**;
bei 2/3/4 folgt die Änderung der Sprache.

## 4. ASD-Track und Kopfbewegung

| Pass | Box-Höhe | Box-Face-Share | Box-Velocity px/frame | Box-Span px |
|---|---|---|---|---|
| 0 | 441 | 0.256 | 1.85 | 48.0 |
| 1 | 441 | 0.277 | 0.69 | 13.5 |
| 3 | 462 | 0.292 | 0.17 | 4.0 |
| 4 | 470 | 0.304 | 0.45 | 11.0 |
| 2 | 463 | 0.304 | 0.84 | 30.0 |

Box-Bewegung trennt **nicht** (MOVED-Pass 2 bewegt sich stärker als NOOP-Pass 1).
`box_face_share` ist als einziges Input-Merkmal monoton zum Score
(0.256 < 0.277 < 0.292 < 0.304), aber die Spanne ist mit 0.048 winzig und mit der
Mund-ROI-Auflösung konfundiert — als Regel nicht belastbar.

## 5. Audio, passspezifisch

| Pass | Dauer s | t0 s | voiced ratio | max. Lücke s |
|---|---|---|---|---|
| 0 | 2.37 | 0.08 | 0.53 | 0.16 |
| 1 | 1.37 | 0.18 | 0.46 | 0.12 |
| 3 | 2.03 | 0.12 | 0.49 | 0.30 |
| 4 | 1.97 | 0.18 | 0.56 | 0.08 |
| 2 | 2.27 | 0.14 | 0.54 | 0.10 |

Keine Trennung. Audio bleibt als Ursache ausgeschlossen.

## 6. Pass 3 (Gray-Control)

Pass 3 teilt Speaker, Crop (474/170/168) und Plate **exakt** mit dem MOVED-Pass 2.
Bei den Input-Merkmalen liegt er nicht zwischen den Gruppen, sondern bei 2/4;
beim Speech-Lock (2.21 / 0.57) ebenfalls klar in der MOVED-Gruppe.
Nur der frame-normalisierte Score fällt ins Band. **Pass 3 ist mit hoher Wahrscheinlichkeit
ein echter Sync, den die Normalisierung grau macht** — das stützt die V466-A-Entscheidung,
Grauband nicht zu terminalisieren.

## Schlussfolgerung

**B mit klarer Richtung — kein einzelnes Input-Merkmal trennt.**

- Auf allen belastbaren *Input*-Achsen (Registrierung, Crop, Box-Bewegung, Face-Share,
  Audio) sind 0/1 und 2/4 praktisch gleich; identische Plate, identisches Verfahren.
- Der einzige überlappungsfreie Trenner ist ein *Output*-Merkmal: die Kopplung der
  Mundänderung an die Sprache (v/u-Ratio, Korrelation mit RMS).
- Damit ist das Verhalten Provider-seitige Qualitätsvarianz bei gültigem Input, nicht
  ein weiterer Geometrie-Bug. Neue Crop-/ASD-Heuristiken (V467–V47x) sind nicht angezeigt.

Empfehlung für ein späteres, eng begrenztes Gate (nicht Teil dieses Berichts):
`mouth_edit` gegen die Sprachhüllkurve statt gegen `frame_edit` normalisieren
(scene-motion-frei, trennt hier 5/5 statt 3/5) — reine Metrikfrage, keine Pipeline-Änderung.
