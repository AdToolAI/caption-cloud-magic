# FA-4 v404 — deltaMean Threshold Lock + Performance Gate (TEST-ONLY REPORT)

Datum: 2026-08-18. Production-Code-Diff = ZERO. N = 6 frozen. Authoritative scalar = `deltaMean`; `deltaPeak` nur Telemetrie.

## A. Full-precision N=6 deltaMean Fixture

Quelle (read-only): `scripts/calibration/fa4-v404-sweep-report.json`, Eintrag `N=6`.

```text
pass turn speaker  label   deltaMean (full precision)
p0   T1   Sarah    motion  135.97205240261346
p1   T5   Sarah    motion   21.267221764950364
p2   T2   Samuel   motion   50.028506696580806
p3   T6   Samuel   noop     -5.217728854943431
p4   T3   Matthew  motion   51.88438067963051
p5   T4   Kay      noop     -2.1788457676476156
```

## B. minMotion / maxNoop / gap

```text
server_delta_min_motion = 21.267221764950364    (p1/T5)
server_delta_max_noop   = -2.1788457676476156   (p5/T4)
gapMean                 = 23.44606753259798     > 0  OK
```

## C. Finale Thresholds (gap/4)

```text
MOTION_THRESHOLD = 15.405704881800869   (display 15.406)
NOOP_THRESHOLD   =  3.682671115501879   (display  3.683)
```

Classifier-Semantik (später, hier NICHT implementiert):
`deltaMean > MOTION_THRESHOLD` → motion; `deltaMean <= NOOP_THRESHOLD` → noop; dazwischen → indeterminate.

## D. Six-pass Verdict-Proof

```text
pass label    deltaMean      d(MOTION_THRESHOLD)   d(NOOP_THRESHOLD)   verdict
p0   motion   135.972052     +120.566348           +132.289381         motion  OK
p1   motion    21.267222       +5.861517            +17.584551         motion  OK
p2   motion    50.028507      +34.622802            +46.345836         motion  OK
p3   noop      -5.217729      -20.623434             -8.900400         noop    OK
p4   motion    51.884381      +36.478676            +48.201710         motion  OK
p5   noop      -2.178846      -17.584551             -5.861517         noop    OK
```

Alle sechs frozen Labels korrekt. Keine Speaker-Ausnahme, keine Zero-Threshold-Abkürzung.

## E. Setter-Margins

```text
p1/T5 min motion: +5.861516883149495 über MOTION_THRESHOLD
p5/T4 max noop:   -5.861516883149495 unter NOOP_THRESHOLD
```

Symmetrisch, exakt gap/4.

## Performance-Setup

Ein vollständiges Pair Measurement = 6 Preclip-Stills + 6 Provider-Output-Stills = 12 Remotion-Lambda-`type:"still"`-Invokes, ausgeführt über EINEN gebundenen Worker-Pool mit der jeweiligen Concurrency (kein unbounded `Promise.all`). Harness-Cache für alle Performance-Läufe deaktiviert (`useCache=false`) — jede Latenz ist ein echter Lambda-Invoke inkl. Download. Pairs rotieren round-robin über alle sechs S11-Paare.

Percentile-Methode: nearest-rank auf der aufsteigend sortierten Stichprobe, `index = ceil(q * n) - 1`.

## F. concurrency = 2 (Sweep, 6 Pairs)

```text
pair wall-time ms: p0 8900, p1 5138, p2 4808, p3 5081, p4 4895, p5 4924
pair: n=6  p50=4923.78  p95=8899.73  max=8899.73   (p0 = Cold-Start)
still: n=72 min=745.67 p50=814.77 p95=980.10 max=4426.65
failures=0 timeouts=0 throttling=0
```

## G. concurrency = 4 (Sweep, 6 Pairs)

```text
pair wall-time ms: p0 4483, p1 3008, p2 2605, p3 2687, p4 2500, p5 2559
pair: n=6  p50=2604.78  p95=4482.83  max=4482.83
still: n=72 min=687.32 p50=808.73 p95=1139.14 max=4184.48
failures=0 timeouts=0 throttling=0
```

## H. concurrency = 6 (Sweep, 6 Pairs)

```text
pair wall-time ms: p0 4443, p1 1882, p2 1798, p3 1662, p4 1774, p5 1832
pair: n=6  p50=1797.94  p95=4443.17  max=4443.17
still: n=72 min=736.78 p50=808.72 p95=1002.67 max=4437.45
failures=0 timeouts=0 throttling=0
```

## I. Gewählte Concurrency

**concurrency = 2.**

Begründung (datenbasiert, kleinste stabile Stufe): Alle drei Stufen sind stabil (0 Fehler, 0 Timeouts, 0 Throttling). Die Regel verlangt die KLEINSTE stabile Concurrency mit praktisch brauchbarer Pair-Wall-Time — nicht die schnellste. Bei conc=2 liegt die Pair-Wall-Time bei p50 ≈ 5.1 s und max 5.68 s (24 Messungen), also weit innerhalb eines Webhook-tauglichen Fensters. Höhere Stufen kaufen ~2.5–3 s Zeit gegen dreifachen gleichzeitigen Lambda-Druck ein; das ist für dieses Gate nicht nötig.

## J. Pair-Statistik der gewählten Concurrency (n = 24 ≥ 20)

Verteilung: 4 Runden × 6 S11-Paare — jedes Paar exakt 4× gemessen, kein Paar wiederholt sich exklusiv.

```text
pair: n=24  p50=5102.27 ms  p95=5374.40 ms  max=5676.80 ms
Einzelwerte (ms):
p0 5677 5029 5150 5236
p1 5102 5045 4960 5287
p2 4974 4941 5041 5107
p3 4957 5128 5051 5238
p4 5108 5374 5055 5108
p5 5212 4990 4975 5187
```

## K. Still-Statistik (gewählte Concurrency)

```text
still: n=288  min=726.60 ms  p50=833.38 ms  p95=950.44 ms  max=1165.77 ms
```

## L. Failures / Throttling

```text
Alle Läufe (c=2 Sweep, c=4, c=6, c=2 final): failures=0, timeouts=0, AWS-Throttling=0
Insgesamt 504 Still-Invokes ohne Fehler.
```

## M. measurement_deadline_ms

```text
selectedConcurrency        = 2
pair p50                   = 5102.27 ms
pair p95                   = 5374.40 ms
pair max (n=24)            = 5676.80 ms
höchstes je beobachtetes Pair (Cold-Start, c=2 Sweep) = 8899.73 ms

Regel (deterministisch): deadline = aufgerundet auf volle 1000 ms von (3 × höchstes
beobachtetes Pair inkl. Cold-Start) = ceil(3 × 8899.73 / 1000) × 1000

proposed measurement_deadline_ms = 27000
```

Margin-Begründung: 27000 ms sind das 5.02-fache des Pair-p95 (5374.40 ms), das 4.76-fache des Warm-Pair-max (5676.80 ms) und das 3.03-fache des schlechtesten je beobachteten Cold-Start-Pairs (8899.73 ms). Damit ist die Deadline endlich, klar oberhalb p95, deckt Cold-Starts mit Faktor 3 ab und lässt kein unbegrenztes Lambda-Warten zu. Die alte 45-s-Zahl wird ausdrücklich nicht übernommen.

## N. Test-only Diff

```text
scripts/calibration/fa4-v404-motion-calibration.ts   (perf-Pfad: EIN gebundener 12-Still-Pool
                                                      pro Pair, Fehler-/Throttle-/Timeout-Zähler,
                                                      Percentile-Methode im Report)
scripts/calibration/fa4-v404-perf-N6-c2.json         (neu, final 24 Pairs)
scripts/calibration/fa4-v404-perf-N6-c4.json         (neu)
scripts/calibration/fa4-v404-perf-N6-c6.json         (neu)
scripts/calibration/fa4-v404-threshold-performance-report.md (dieser Report)
```

## O. Production-Code-Diff

ZERO — unverändert: `sync-so-webhook`, `compose-dialog-segments`, `report-lipsync-motion-probe`, alle production shared helpers, Remotion Compositions, v402 Geometry, Contract E, G3.2.2, Audio, Mux, RS3. Keine DB-Mutation, keine Migration, kein Sync.so-Dispatch, kein Retry/Reset, kein Render, kein Deploy.

## Failure-Contract (frozen, hier NICHT implementiert)

Measurement timeout/error/unreadable → indeterminate → `ssw:failed` mit `error_text='motion_probe_indeterminate'`, kein automatischer Retry, kein Mux.
