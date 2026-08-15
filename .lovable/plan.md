# v431 G3.1b — Schließung der drei Rest-Gates vor Deploy/Drain

Kein Deploy in diesem Schritt. Ziel: Retry-Abdeckung belegen und die eine echte
Lücke schließen, Testbaseline vergleichbar machen, Reaper-Semantik korrekt
formulieren.

## 1. Retry-Matrix (Belegen + eine Lücke schließen)

Befund aus dem Code (verifiziert):

| Pfad | Retry-Auslöser | Heutiger Ledger-Weg | Status |
| --- | --- | --- | --- |
| `compose-clip-webhook` (Replicate-Auto-Retry) | transienter Provider-Fehler | `replaceLedgerAttempt(previousJobId, retryReason)`, neue `pipeline_job_id` in der Callback-URL | vertragskonform |
| `sync-so-webhook` Retry-Varianten | Re-Dispatch an `compose-dialog-segments` (fire-and-forget) | dort `acquireLedgerJob()`; alter Sync-Attempt ist noch `dispatched` | **Lücke: legitimer Retry wird als `already_in_flight` unterdrückt** |
| `lipsync-watchdog` Advance/Re-Invoke | dieselben `compose-dialog-segments`-Aufrufe | wie oben | **gleiche Lücke** |
| Dialog-Poller (`n`) | Re-Dispatch nach Provider-Timeout | wie oben | **gleiche Lücke** |
| `render-sync-segments-audio-mux` Re-Dispatch / Self-Dispatch | eigener Mux-Attempt | `acquireLedgerJob()`; Vorgänger-Mux-Attempt ist bei echtem Re-Dispatch noch aktiv | **gleiche Lücke** |

Ergänzung zum Vertrag (ohne Verhalten des Renderers zu ändern, Observe bleibt read-only):

- Jeder dieser Re-Dispatch-Einstiege übergibt beim Aufruf einen expliziten
  Retry-Kontext (`retry_of_pipeline_job_id` + `retry_reason`) im Request-Body.
- `compose-dialog-segments` und `render-sync-segments-audio-mux` verzweigen dann
  auf `replaceLedgerAttempt()` statt `acquireLedgerJob()`. Ohne Retry-Kontext
  bleibt es exakt bei der heutigen idempotenten Initial-Akquise.
- Kommt `replaceLedgerAttempt()` mit `null` zurück (Race verloren), wird nicht
  dispatcht — der Gewinner läuft bereits.
- Ergebnis pro Retry: alter Attempt `stale` + `replaced_by`, neuer Attempt
  `attempt_no + 1`, dessen `pipeline_job_id` reist im Callback-Transport mit.
- Vorgänger-Status entscheidet **nicht** über den Einstieg: ein semantischer
  Retry bleibt immer Retry-Vertrag. `acquireLedgerJob()` ist nur zulässig, wenn
  für diese (Scene, Run, Stage, Segment) noch kein Attempt existiert; es erzeugt
  niemals bewusst Attempt > 1. Verbindliche Verdikte im Retry-Vertrag:
  - Vorgänger `succeeded` → kein Retry, No-op `already_completed`.
  - Vorgänger `stale` → kein neuer Zweig; `replaced_by` folgen bzw.
    `retry_superseded`. Nie per Acquire Attempt N+1 erzeugen.
  - Vorgänger `failed` → nur wenn der Retry-Vertrag diesen Failure explizit als
    retryfähig führt; neuer Attempt weiterhin atomar an `previousJobId` gebunden.
  - Vorgänger aktiv (`pending`, `dispatching`, `dispatched`,
    `dispatch_uncertain`) → atomarer Replace wie oben.

## 2. Testbaseline vergleichbar machen

Die gemeldeten 446 stammten vom engen Selektor. Der eingefrorene
Baseline-Command aus G2.3/G2.4 ist:

```text
npx vitest run src/lib/composer src/lib/video-composer
```

Dieser exakte Command wird erneut ausgeführt und im Bericht mit
Datei-/Testanzahl gegen 527 gestellt. Abweichungen werden einzeln erklärt
(inkl. der bewusst an G3.1 angepassten v427-Dual-Write-Erwartung). Zusätzlich
`tsgo` und `deno check` auf den berührten Funktionen.

## 3. Reaper-Semantik präzisieren

`composer_reap_orphaned_dispatches` verschiebt auf **recoverable**
`dispatch_uncertain`: kein `completed_at`, kein terminales Duplicate-Kriterium,
kein Credit-/State-Effekt. Ein später eintreffender legitimer Callback findet
den Job weiterhin über `pipeline_job_id` und verarbeitet ihn. Das wird per
DB-Smoke belegt (Reaper laufen lassen → Callback-Lookup findet Job weiterhin)
und in Code-Kommentar, Bericht und `docs/v427-run-contract.md` so formuliert:
„Reaper verschiebt auf recoverable `dispatch_uncertain`" — nicht
„terminalisiert".

## Verifikation vor Deploy

- DB-Smokes: Retry über Replace (alt `stale` + `replaced_by`, neu `attempt_no+1`),
  paralleler Replace-Verlierer, Reaper → recoverable, `plate_generation`-INSERT-Pflicht
  und Immutabilität, RPC-Security (nur `service_role`).
- Vertragstests: je ein Test pro Retry-Pfad, dass mit Retry-Kontext
  `replaceLedgerAttempt` und ohne Kontext `acquireLedgerJob` läuft, und dass ein
  legitimer Retry nicht als `already_in_flight` verschluckt wird.
- Frozen-Suite mit dem Baseline-Command oben.

## Danach

Deploy-GO → Drain-Fenster → Post-Deploy `missing_binding=0`, `job_not_found=0`,
`wrong_job=0` → Bericht → STOP. `binding_pending` wird weiter gemessen;
`stale_run`/`stale_generation` bleiben diagnostisch. G3.2 bleibt gesperrt.
