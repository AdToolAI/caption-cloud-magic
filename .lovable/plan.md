# FA-4/P0 Sync Fan-out — Deploy Review (Scope-Nachweis, kein Deploy, kein Render)

Read-only Nachweis abgeschlossen. Ergebnis unten; danach STOP bis zum Deploy-GO.

## 1. Importer von `_shared/fa4-turn-pass-guard.ts`

Repo-weite Suche (`fa4-turn-pass-guard`, ohne node_modules):

| Fundstelle | Art |
|---|---|
| `supabase/functions/compose-dialog-segments/index.ts:121` | produktiver Importer (einziger) |
| `supabase/functions/_shared/fa4-turn-pass-guard.test.ts:2` | Test, nicht deploybar |
| `docs/v433-motion-studio-final-acceptance.md` | Doku |

Produktive Importer: **genau 1 — `compose-dialog-segments`.**

## 2. Wurde `_shared/v431-ledger.ts` geändert?

Ja. Letzte Änderung heute (Commit `5ff9e4183`, 19:29 UTC), davor `c78d0e011` vom 15.08.
Diff = 7 Zeilen, rein additiv:

- optionales Feld `segmentId?` im `expect`-Objekt von `adoptPreAcquiredLedgerJob()`
- `segment_id` zusätzlich in der `select`-Spaltenliste
- neuer Guard → `skip / preacquired_segment_mismatch` (greift nur, wenn `expect.segmentId` gesetzt ist)

Keine Signaturänderung mit Pflichtparameter, keine geänderte Semantik für Aufrufer ohne `segmentId`.

### Produktive Importer von `_shared/v431-ledger.ts`

`compose-clip-webhook`, `compose-video-clips`, `compose-dialog-segments`,
`sync-so-webhook`, `lipsync-watchdog`, `modelark-poll`,
`recover-stuck-composer-clip`, `remotion-webhook`, `render-sync-segments-audio-mux`.

Entscheidend: **`adoptPreAcquiredLedgerJob()` hat repo-weit genau einen produktiven
Aufrufer — `compose-dialog-segments/index.ts:6139`.** Alle übrigen Importer nutzen
ausschließlich unveränderte Exporte (`resolveLedgerDispatch`, `bindSyncPassAttempt`,
`settleLedgerDispatchFailure`, `readRetryContext`, …). Ihr Verhalten ändert sich durch
den Diff nicht; ein Redeploy dieser Funktionen ist fachlich nicht erforderlich.

## 3. Weiterer geänderter Produktivcode dieses Fix-Blocks

`compose-twoshot-audio/index.ts` (Commit 19:27 UTC): führt `turnId` im `DialogBlock`
und `turn_id` in `voicedRange.turns[]` mit. Das ist die Quelle der kanonischen
Segmentidentität, die `compose-dialog-segments` fail-closed erwartet.

## 4. Minimaler Edge-Deploy-Scope

Verbindliche Reihenfolge (Produzent vor Konsument):

1. `compose-twoshot-audio` — liefert `turn_id` im Audio-Plan
2. `compose-dialog-segments` — Guard + `segmentId`-Adoption (bündelt beide Shared-Dateien)

Nicht im Scope: alle übrigen Ledger-Importer, Ledger-RPCs, Datenbank.

- Kein Schema-Change
- Keine Migration
- Kein Ledger-RPC-Deploy
- Kein Render, kein FA-4-Retest

Hinweis zur Reihenfolge: wird nur `compose-dialog-segments` deployed, während der
Audio-Plan noch ohne `turn_id` liefert, blockiert der Guard planmäßig fail-closed
(`fa4_p0_turn_pass_mismatch`, HTTP 422, Refund). Deshalb ist Schritt 1 Pflicht und
muss vor Schritt 2 abgeschlossen sein.

## 5. Tests vor Deploy — erneut ausgeführt, grün

```text
_shared/fa4-turn-pass-guard.test.ts      10 passed
_shared/v431-ledger-adoption.test.ts      4 passed
--------------------------------------------------
ok | 14 passed | 0 failed
```

HEAD zum Zeitpunkt des Nachweises: `465312e47` (2026-08-17 19:42 UTC).

## 6. Nach Deploy-GO (noch nicht ausführen)

- Deploy in der Reihenfolge aus Abschnitt 4
- `T_FA4_P0_FANOUT_effective` festhalten
- Boot-Smoke beider Funktionen ohne Render-Payload
- Ergebnis in `docs/v433-motion-studio-final-acceptance.md` protokollieren

**FA-4/P0 SYNC FAN-OUT DEPLOY SCOPE READY — STOP. Kein Deploy, kein Render.**
