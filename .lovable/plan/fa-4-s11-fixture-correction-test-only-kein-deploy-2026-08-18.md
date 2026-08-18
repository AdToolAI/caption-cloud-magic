# FA-4 — S11 Fixture Correction (test-only, kein Deploy)

Nur `supabase/functions/_shared/plate-face-candidates.test.ts` wird angefasst. Kein Produktionscode, kein Deploy, kein Render.

## 1. Echte persistierte Anchor-Center

`S11_ANCHOR_CENTERS` wird 1:1 auf die vorgegebenen normalisierten Werte gesetzt (nicht mehr aus den erwarteten Plate-Faces abgeleitet):

```text
Sarah    cx 0.24309593023255813   cy 0.22200520833333334
Samuel   cx 0.3862645348837209    cy 0.19661458333333334
Matthew  cx 0.6010174418604651    cy 0.203125
Kay      cx 0.8277616279069767    cy 0.20052083333333334
```

## 2. Echte persistierte Kandidatenboxen

Ein neues `S11_PERSISTED_DETECTED` in exakt persistierter Reihenfolge, Plate 1284×718:

```text
[1125,7,1142,30]      [819,113,831,128]   [923,98,940,119]
[52,272,65,303]       [226,244,286,327]   [344,287,364,314]
[445,285,461,305]     [476,209,540,294]   [753,187,819,277]
[1030,208,1099,296]
```

Die beiden Exact-Fixture-Tests laufen ausschließlich auf diesem Datensatz (der reordered-Test auf derselben Menge, nur permutiert). Erwartete Bijektion unverändert: Sarah → [226,244,286,327], Samuel → [476,209,540,294], Matthew → [753,187,819,277], Kay → [1030,208,1099,296].

Die alten synthetischen Boxen (FP_*/EXTRA_*) bleiben nur für die weiterhin bestehenden generischen Sanity-/Fail-Closed-Tests erhalten; sie fließen nicht mehr in die S11-Exact-Fixture ein.

## 3. Testbeschreibung ehrlich benennen

Der Test „contractual geometry failures never allow the legacy fallback“ wird umbenannt in eine Beschreibung, die klar macht, dass er `classifyRouterFailure()` prüft (Classifier-Unit-Test), nicht den Integrationspfad in `compose-dialog-segments`.

## 4. Verification

`deno test` über `supabase/functions/_shared/` erneut ausführen; alle Tests müssen grün sein. Danach read-only Diff-Review.

Abschluss ausschließlich mit
`FA-4 S11 FIXTURE CORRECTION READY → STOP` oder
`FA-4 S11 FIXTURE CORRECTION BLOCKED — <Grund> → STOP`.

## Betroffene Dateien

- `supabase/functions/_shared/plate-face-candidates.test.ts`
