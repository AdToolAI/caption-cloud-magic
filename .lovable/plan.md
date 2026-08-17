# FA-4 Face-Candidate — P0 Integration Correction (kein Deploy, kein Render)

Vier enge Korrekturen an der bereits akzeptierten Grundimplementation, danach Doku + Tests. Kein Deploy, kein Render, kein Retry/Reset, keine Änderung außerhalb des Face-Candidate-Scopes.

## 1. Contract-B Fail-Closed darf nicht in den Legacy-Fallback fallen

Bestätigter Ist-Zustand in `compose-dialog-segments/index.ts`: der Router läuft in Zeile 1917, setzt `plateIdentityMap` nur bei `routed.ok`, und Zeile 1965 (`if (!plateIdentityMap) try { resolvePlateFaceIdentities(...) }`) fängt jeden Fehlschlag — auch die Contract-B-Failures — im Legacy-Pfad ab.

Änderung:
- Router-Reason klassifizieren in `contractual` vs. `infrastructure`.
  - Contractual (fail-closed, kein Legacy): `fa4_fail_closed:count_mismatch:*`, `fa4_fail_closed:incomplete_bijection:*`, `fa4_fail_closed:equal_cost_ambiguity:*`, `fa4_fail_closed:degenerate_candidate_centers:*`, sowie `no_faces_detected`, wenn DetectFaces erfolgreich lief und 0 Kandidaten lieferte.
  - Infrastructure (bisheriges Verhalten unverändert): `aws_credentials_missing`, `plate_fetch_failed`, `detect_failed:*`, geworfene Exceptions des Routers.
- Bei contractual failure: kein `resolvePlateFaceIdentities()`, kein Provider-Dispatch. Abbruch über den bestehenden Failure-/Refund-Pfad der Function (`failLipSync`-Vertrag) mit klarer, lokalisierter Diagnose und der exakten Router-Reason in der Telemetrie.
- Ledger/Fan-out, Job-Erzeugung und Webhook-Pfade werden nicht angefasst.
- Klassifikation als exportierte, reine Hilfsfunktion (z. B. `classifyRouterFailure(reason)`) im Face-Candidate-Modul, damit sie testbar ist.

## 2. `input_too_large` entfernen

`plate-face-candidates.ts` führt aktuell `MAX_ROWS = 6`, `MAX_COLS = 12` und die Fail-Reason `input_too_large` ein — nicht Teil des eingefrorenen Contracts.
- Konstanten und Reason ersatzlos entfernen (auch aus `AssignmentFailReason`).
- Damit der Solver den produktiven Max-Cast ohne neue fachliche Grenze verarbeitet: die Brute-Force-DFS bleibt als Verfahren, wird aber intern deterministisch abgesichert (Vorsortierung der Kandidaten je Anchor nach Distanz + Best-Bound-Pruning über die verbleibende Minimalkosten-Untergrenze). Tie-Zählung für `equal_cost_ambiguity` bleibt exakt erhalten.
- Keine neue Magic Number als Business-/Identity-Gate.

## 3. Echte S11 Regression Fixture

Die synthetische Fixture in `plate-face-candidates.test.ts` wird ersetzt durch den exakt persistierten S11-Datensatz: Plate 1284×718, die vier echten Anchor-Center (Sarah/Samuel/Matthew/Kay wie vorgegeben) und exakt die 10 Kandidatenboxen in persistierter Reihenfolge.
- Erwartung nach Contract-A-Sanity: nur die vier großen Faces bleiben plausibel.
- Erwartete Bijektion: Sarah → [226,244,286,327], Samuel → [476,209,540,294], Matthew → [753,187,819,277], Kay → [1030,208,1099,296].
- Zweiter Test mit identischem Datensatz in anderer Detector-Reihenfolge → identisches Ergebnis.
- Anchor-Center werden hart aus den Vorgaben übernommen, nicht aus den erwarteten Plate-Faces abgeleitet.

## 4. Ein kanonischer Sanity-Owner

`plateFaceSanity()` bleibt einzige Quelle für area 0.003..0.25, aspect 0.4..2.5, degenerate, out_of_plate. Das lokale `bboxSanity()` in `compose-dialog-segments/index.ts` (Zeilen 2417–2445) dupliziert diese Schwellen und wird zu einem dünnen Wrapper, der `plateFaceSanity(box, plateDims)` aufruft und nur die bestehende Reason-Formatierung (inkl. `_despite_trust`) beibehält. Keine semantische Änderung der Schwellen oder der Toleranz.

## 5. Doku

In `docs/v433-motion-studio-final-acceptance.md` (und ggf. Contract-Abschnitt) nach der Implementierung nachziehen:
- Contract-B-Failures sind integration-level fail-closed.
- Legacy-Fallback nur für klar klassifizierte Infrastructure-Failures.
- S11-Fixture = exakter persistierter Datensatz.
- Keine `input_too_large` Business-Regel.
- Sanity hat einen kanonischen Owner.
- Falschen Satz „Identity-Labels fließen als Support-Score in die Kostenmatrix“ entfernen; korrekt: Identity-Labels beeinflussen weder Cost noch Gewinner-Bijektion, sie sind reine Diagnostik/Telemetry.

## 6. Verification

`deno test` über `_shared/` — alle bestehenden Tests plus neu:
- exact S11 persisted fixture
- reordered exact S11 fixture
- count_mismatch → kein Legacy-Fallback
- incomplete_bijection → kein Legacy-Fallback
- equal_cost_ambiguity → kein Legacy-Fallback
- degenerate_candidate_centers → kein Legacy-Fallback
- infrastructure failure behält bestehendes Fallback-Verhalten

Danach read-only Diff-Review. Kein Deploy, kein Render. Abschluss ausschließlich mit
`FA-4 FACE-CANDIDATE IMPLEMENTATION CORRECTION READY → STOP` oder
`FA-4 FACE-CANDIDATE IMPLEMENTATION BLOCKED — <Grund> → STOP`.

## Betroffene Dateien

- `supabase/functions/_shared/plate-face-candidates.ts`
- `supabase/functions/_shared/plate-face-candidates.test.ts`
- `supabase/functions/_shared/plateFaceSlotRouter.ts` (nur Reason-Weitergabe, falls nötig)
- `supabase/functions/compose-dialog-segments/index.ts`
- `docs/v433-motion-studio-final-acceptance.md`
