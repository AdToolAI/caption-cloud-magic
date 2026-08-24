# V500-B — Golden Runtime Contract Restoration

Autorität ist **nicht** die v400-Prosa, sondern der Lauf, der nachweislich
funktioniert hat: `c934a823-47de-49b7-a62e-a116b49ca3b2` (V500-A,
`docs/v500-a-golden-contract.md`).

Damit sind aus V500-B ausdrücklich **entfernt**: 0.62-Mouth-Priority und
erzwungener Dynamic Camera Path. Der Golden Run hatte beides nie
(`anchor = face_center`, `mouth_offset = 0`, `plate_mouth = null`,
0 Camera-Path-Keyframes, reale Mundhöhe 0.571–0.612).

## V500-B1 — Golden Core Contract eingefroren

`supabase/functions/_shared/v500-core-contract.ts` (+ 4 Tests) hält fest, was
der erfolgreiche Pfad wirklich brauchte:

| Eigenschaft | Status |
| --- | --- |
| statischer Face-Center-Crop | erlaubt (nie Violation) |
| Dynamic Camera Path | **nicht** erforderlich |
| Mundhöhe 0.62 | **nicht** erforderlich |
| Face-Share | 0.24 – 0.55 (Golden real 0.252–0.400; S01 0.277 liegt mittendrin) |
| Face-Größe im Preclip | ≥ 144 px (Golden real 182–288 px) |
| Ziel-Gesichter pro Dispatch | genau 1 |
| T10-Shape | `sync-3` · `bbox-url-pro` · `bounding_boxes_url` · `cut_off` · clip-space · preclip |

`V500_NOT_REQUIRED` benennt die drei Nicht-Anforderungen explizit, damit ein
späteres Gate, das sie wieder erzwingt, im Test auffällt.

**ASD wird nicht zurückgerollt.** Golden-Semantik (`bounding_boxes_url`,
sync-3) bleibt; die per-Frame-Registrierung aus V464 bleibt ebenfalls, weil sie
einen belegten Fehler behoben hat. Eingefroren ist die Shape, nie die Anzahl
der Boxen.

## V500-B2 — Outcome-Gate zurück auf seinen Zweck

`supabase/functions/_shared/v500-passthrough-gate.ts`:

```text
motion                                    -> accept
noop  UND Mundanker war BEOBACHTET        -> proven_passthrough (terminal)
noop  UND Anker nur abgeleitet/unbekannt  -> unknown (nicht terminal)
indeterminate                             -> unknown (nicht terminal)
```

V465 bleibt Mess-Autorität, verliert aber die Terminalitäts-Autorität, solange
die ROI nicht aus einer echten Mundbeobachtung (V471 `landmark`) stammt. Grund
ist messbar: mit der Produktions-ROI-Zentrierung scort der Golden Run
1.43 / 1.79 / 1.91 / 2.42 — 3 von 4 Pässen wären terminale NOOPs
(`docs/v473-detector-validity-audit.md`). Auf dem echten Mundband liegen
dieselben Pässe bei 3.06–5.66.

`unknown` ist der bestehende `motion_unverified`-Zustand: nie grün, nie
terminal, kein Refund, kein Provider-Call.

### Verdrahtung

- `sync-so-webhook`: nach dem V466-Grauband-Re-Measure entscheidet
  `resolveV500Outcome` mit `v456Contract.v471.anchorSource`. Ein
  unverifizierter NOOP wird zu `indeterminate` heruntergestuft und läuft in
  den vorhandenen `motion_unverified`-Pfad (Log: `v500_noop_unverified_anchor`).
- `lipsync-watchdog`: gleicher Vertrag beim Einmal-Re-Check; ohne
  Anker-Provenienz kann der Watchdog nur `motion_unverified` erzeugen, nie
  `ssw:noop_fail`.
- Unangetastet: Fencing, Locks, Ledger/Refund, Webhook-Idempotenz,
  Output-Pinning, Zombie-Recovery, Fan-out, Telemetrie.

## Release-Leitplanke

`v500-passthrough-gate.test.ts` erzwingt ab sofort: **jede Lip-Sync-Logik, die
einen Golden-Pass als terminal klassifiziert, ist nicht releasefähig.** 10/10
Tests grün (6 Gate, 4 Core Contract), Gesamtsuite V465/V471/V500 38/38 grün.
