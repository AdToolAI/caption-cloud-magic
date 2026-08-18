# FA-4 v404 — Motion Metric Re-Selection Contract (READ-ONLY)

Quelle: `scripts/calibration/fa4-v404-sweep-report.json` (bereits erzeugt, keine neuen Lambda-Invokes, Production-Diff = ZERO).
Frozen ROI (bx=461, by=411, bw=358, bh=154), Still 1280x720, jpeg-js@0.4.4, Rec.601 — unverändert.

## A. Vollständige Calibration-Tabelle (existierende Artefakte)

N=6

```text
pass turn speaker  label   preMean  provMean  deltaMean    prePeak    provPeak    deltaPeak
p0   T1   Sarah    motion  161.464   297.436    135.972   8797.596   14683.017     5885.421
p1   T5   Sarah    motion  187.992   209.259     21.267   7401.620    9656.043     2254.423
p2   T2   Samuel   motion   50.967   100.995     50.029   4402.323    7169.771     2767.448
p3   T6   Samuel   noop     47.709    42.491     -5.218   5436.850    5485.402       48.552
p4   T3   Matthew  motion  168.787   220.672     51.884  16408.799   16025.619     -383.180
p5   T4   Kay      noop     22.148    19.969     -2.179   4442.578    2745.620    -1696.958
```

N=8

```text
p0   T1   Sarah    motion  144.976   306.445    161.469   9500.303   18075.424     8575.121
p1   T5   Sarah    motion  183.955   215.772     31.817   7321.754    7697.211      375.457
p2   T2   Samuel   motion   47.134    97.928     50.793   4424.046    6770.595     2346.549
p3   T6   Samuel   noop     44.866    38.692     -6.174   5337.270    5651.036      313.766
p4   T3   Matthew  motion  164.206   218.448     54.242  17228.761   16454.732     -774.029
p5   T4   Kay      noop     20.343    18.019     -2.324   4735.091    3181.016    -1554.075
```

N=10

```text
p0   T1   Sarah    motion  132.305   283.726    151.421   9905.146   16622.068     6716.922
p1   T5   Sarah    motion  178.395   205.137     26.742   7659.103    7773.931      114.829
p2   T2   Samuel   motion   46.141    93.977     47.836   4449.744    7011.433     2561.689
p3   T6   Samuel   noop     43.429    38.597     -4.832   5644.697    5762.723      118.026
p4   T3   Matthew  motion  158.644   223.330     64.686  17211.288   16364.166     -847.122
p5   T4   Kay      noop     19.448    16.586     -2.861   5208.682    3416.975    -1791.707
```

N=12

```text
p0   T1   Sarah    motion  119.926   284.493    164.567  10351.892   18004.630     7652.738
p1   T5   Sarah    motion  178.118   211.533     33.415   7462.930    9677.788     2214.858
p2   T2   Samuel   motion   45.336    91.790     46.454   4411.340    7107.839     2696.499
p3   T6   Samuel   noop     42.973    38.264     -4.708   5605.966    5876.411      270.445
p4   T3   Matthew  motion  149.820   217.459     67.639  17986.744   17341.093     -645.651
p5   T4   Kay      noop     18.653    15.818     -2.835   5324.718    3512.360    -1812.358
```

## B. deltaPeak Failure-Proof

Für jedes N ist min(deltaPeak über motion) < max(deltaPeak über noop):

```text
N=6   minMotion = -383.180 (p4/T3)   maxNoop =    48.552 (p3/T6)   gap =  -431.732
N=8   minMotion = -774.029 (p4/T3)   maxNoop =   313.766 (p3/T6)   gap = -1087.795
N=10  minMotion = -847.122 (p4/T3)   maxNoop =   118.026 (p3/T6)   gap =  -965.148
N=12  minMotion = -645.651 (p4/T3)   maxNoop =   270.445 (p3/T6)   gap =  -916.095
```

p4/T3 (Matthew, frozen motion) ist bei allen N negativ, p3/T6 (frozen noop) bei allen N positiv. Ein monotoner Schwellwert auf deltaPeak kann diese Labels nicht trennen — deltaPeak ist als alleinige Decision-Metric widerlegt (nur noch Diagnose/Telemetrie).

## C. deltaMean Separation pro N

```text
N     minMotionMean   maxNoopMean   gapMean
6         21.267         -2.179      23.446
8         31.817         -2.324      34.141
10        26.742         -2.861      29.604
12        33.415         -2.835      36.250
```

Alle vier motion-Passes (p0, p1, p2, p4) haben bei allen N deltaMean > 0. Beide noop-Passes (p3, p5) haben bei allen N deltaMean < 0. Die frühere Beobachtung "motion >= +26.7 / noop <= -2.3" ist mit den Rohwerten nur teilweise korrekt: bei N=6 liegt p1/T5 bei +21.267 (nicht >= 26.7) und p5/T4 bei -2.179 (nicht <= -2.3). Die Trennung selbst bleibt bei allen N intakt; die exakten Zahlen oben gelten.

## D. Setter pro N

```text
N=6   min motion = p1/T5 (Sarah, 21.267)    max noop = p5/T4 (Kay,   -2.179)
N=8   min motion = p1/T5 (Sarah, 31.817)    max noop = p5/T4 (Kay,   -2.324)
N=10  min motion = p1/T5 (Sarah, 26.742)    max noop = p5/T4 (Kay,   -2.861)
N=12  min motion = p1/T5 (Sarah, 33.415)    max noop = p5/T4 (Kay,   -2.835)
```

Setter sind über alle N identisch (p1/T5 bzw. p5/T4) — keine wechselnde Randbedingung.

## E. Stabilität über N

- Alle vier motion-Artefakte bleiben bei allen getesteten N auf der positiven Seite.
- Beide noop-Artefakte bleiben bei allen getesteten N auf der negativen Seite.
- gapMean > 0 bei allen N (Minimum 23.446 bei N=6).
- Keine sprecher-spezifische Sonderregel nötig.
- Keine Label-Ausnahme nötig.

## F. Semantische Begründung mean vs. peak (nur aus der Metric-Definition)

- `mean` = SUM(d²)/(N*pixelCount): aggregiert die zeitliche Luma-Varianz über die gesamte frozen Mouth-ROI und über alle N Samples. Ein einzelner Ausreißer verschiebt den Wert nur um 1/(N*pixelCount).
- `peak` = MAX(d²): hängt an genau einem einzelnen Pixel/Frame-Extremwert. Ein einziges JPEG-/Encoder-/Kompressionsartefakt oder ein lokaler Pixelausreißer im Preclip kann prePeak beliebig hoch setzen, wodurch deltaPeak = providerPeak − prePeak selbst bei echter Mundbewegung negativ werden kann.
- Das ist mit den Rohwerten konsistent: p4/T3 hat mit Abstand die höchsten Peak-Werte (prePeak 16k–18k), während sein deltaMean klar positiv bleibt.
- Keine Aussage über Provider-Interna, keine neuen empirischen Ergebnisse.

## G. Kleinstes stabiles N

Regel: kleinstes N mit derselben stabilen Label-Trennung wie die größeren N. Das ist **N = 6** (gapMean 23.446, gleiche Setter, gleiche Vorzeichen wie N=8/10/12).

## H. Empfehlung

- Authoritative scalar für den FA-4 Motion-Gate: **deltaMean** (ROI-aggregierte temporale Luma-Varianz, provider minus preclip).
- deltaPeak wird auf reine Telemetrie herabgestuft, keine Entscheidungsautorität.
- Metric-Stability-Kandidat: **N = 6**.
- Es wird bewusst **kein Production-Threshold** eingefroren, keine Performance-/Concurrency-Phase, keine Implementation. Der Metric-Contract ist separat zu genehmigen.

FA-4 v404 MOTION METRIC RE-SELECTION CONTRACT =
READY FOR APPROVAL — deltaMean is stable across all frozen S11 labels
→ STOP
