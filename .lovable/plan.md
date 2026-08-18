# FA-4 v404 — deltaMean Threshold Lock + Performance Execution (Plan)

Teil 1 (Threshold-Ableitung) ist bereits read-only aus `scripts/calibration/fa4-v404-sweep-report.json` berechnet und unten vollständig dokumentiert. Teil 2 (Concurrency-/Performance-Sweep) erzeugt echte neue Remotion-Lambda-Still-Invokes und braucht daher eine Freigabe.

## A. Full-precision N=6 deltaMean Fixture

```text
pass turn speaker  label   deltaMean (full precision)
p0   T1   Sarah    motion  135.97205240261346
p1   T5   Sarah    motion   21.267221764950364
p2   T2   Samuel   motion   50.028506696580806
p3   T6   Samuel   noop     -5.217728854943431
p4   T3   Matthew  motion   51.88438067963051
p5   T4   Kay      noop     -2.1788457676476156
```

## B. minMotion / maxNoop / gap (full precision)

```text
server_delta_min_motion = 21.267221764950364   (p1/T5)
server_delta_max_noop   = -2.1788457676476156  (p5/T4)
gapMean                 = 23.44606753259798    > 0  OK
```

## C. Finale Thresholds (gap/4-Regel)

```text
MOTION_THRESHOLD = 21.267221764950364 - 23.44606753259798/4 = 15.405704881800869
NOOP_THRESHOLD   = -2.1788457676476156 + 23.44606753259798/4 =  3.682671115501879

display-rounded: MOTION_THRESHOLD ≈ 15.406   NOOP_THRESHOLD ≈ 3.683
(Rundung ist reine Darstellung; Recheninput bleibt full precision.)
```

Classifier-Semantik (später, hier nicht implementiert): `deltaMean > MOTION_THRESHOLD` → motion; `deltaMean <= NOOP_THRESHOLD` → noop; dazwischen → indeterminate.

## D. Six-pass Verdict-Proof

```text
pass label    deltaMean       d(MOTION_THRESHOLD)   d(NOOP_THRESHOLD)   verdict
p0   motion   135.972052      +120.566348           +132.289381         motion   OK
p1   motion    21.267222        +5.861517            +17.584551         motion   OK
p2   motion    50.028507       +34.622802            +46.345836         motion   OK
p3   noop      -5.217729       -20.623434             -8.900400         noop     OK
p4   motion    51.884381       +36.478676            +48.201710         motion   OK
p5   noop      -2.178846       -17.584551             -5.861517         noop     OK
```

Alle sechs frozen Labels werden mit den finalen Thresholds korrekt reproduziert.

## E. Setter-Margins

```text
p1/T5 (min motion): +5.861516883149495 über MOTION_THRESHOLD
p5/T4 (max noop):   -5.861516883149495 unter NOOP_THRESHOLD
```

Beide Margins sind exakt gap/4 — die bindenden Setter sind symmetrisch abgesichert.

## F. Noch offen: Performance-/Concurrency-Gate (braucht Freigabe)

Auszuführen, sobald freigegeben — ausschließlich test-only, N=6 frozen:

1. Harness-Erweiterung nur unter `scripts/calibration/` (kein Produktivcode): Pair-Measurement = 6 Preclip-Stills + 6 Provider-Output-Stills = 12 Remotion-Lambda-Still-Invokes, mit hartem Concurrency-Limiter (kein unbounded `Promise.all`), Calibration-Cache für Latenzen deaktiviert.
2. Concurrency-Sweep über 2, 4, 6 — pro Stufe: Still-Latenz, Pair-Wall-Time, Error-Rate, Timeout-Rate, AWS-Throttling.
3. Auswahl der kleinsten stabilen Concurrency (nicht automatisch 6), danach ≥ 20 unabhängige vollständige Pair-Messungen, verteilt über alle sechs S11-Paare (nicht dasselbe Paar 20×).
4. Statistik: Still-Latenz n/min/p50/p95/max; Pair-Wall-Time n≥20/p50/p95/max; Percentile-Methode explizit dokumentiert (nearest-rank auf der sortierten Stichprobe). Bei n < 20 kein p95-Claim → Gate BLOCKED.
5. `measurement_deadline_ms` aus den echten Pair-Daten ableiten: endlich, klar über Pair-p95, unter Berücksichtigung des beobachteten Pair-max, mit deterministischer Sicherheitsmarge und exakter Begründung. Die alte 45-s-Zahl wird nicht übernommen.
6. Abschlussbeweis: `git status` zeigt Änderungen ausschließlich unter `scripts/calibration/**` bzw. Report-Dateien — Production-Code-Diff = ZERO (`sync-so-webhook`, `compose-dialog-segments`, `report-lipsync-motion-probe`, shared helpers, Remotion Compositions, v402 Geometry, Contract E, G3.2.2, Audio, Mux, RS3 unverändert).

Failure-Contract bleibt frozen und wird hier nicht implementiert: timeout/error/unreadable → indeterminate → `ssw:failed` mit `error_text='motion_probe_indeterminate'`, kein Retry, kein Mux.

Kein Implementation-GO, kein Deploy, kein Render, keine DB-Mutation, kein Sync.so-Dispatch — auch nach einem PASS nicht.

## Status

Threshold-Teil (Punkte 1–4, 11 A–E) ist erfüllt und blockiert nicht. Das Gesamt-Gate bleibt offen, bis der Performance-Teil (F/11 F–O) mit echten Lambda-Invokes ausgeführt wurde — dafür ist die Freigabe dieses Plans nötig.
