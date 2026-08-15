# v431 G3.1 — Deploy + Drain-Fenster

## Scope

Nur Deployment der bereits verifizierten Observe-Verdrahtung und anschließende Messung. Keine Code- oder Vertragsänderung, kein G3.2.

## Deploy-Set

Functions mit Ledger-Verdrahtung (`_shared/v431-ledger.ts`) plus Watchdog:

```text
compose-video-clips                compose-clip-webhook
compose-dialog-segments            sync-so-webhook
render-sync-segments-audio-mux     remotion-webhook
lipsync-watchdog
```

Alle DB-Objekte (Acquire-/Replace-RPC, Predecessor-Guard, Retry-Allowlist, Reaper, REVOKE) sind bereits migriert; in diesem Schritt keine neue Migration.

## Ablauf

1. Deploy der sieben Functions in einem Zug.
2. Deploy-Zeitstempel (UTC) festhalten und im Bericht als Drain-Startmarke `T0` führen. Alle Auswertungen filtern strikt auf `created_at >= T0` (Post-Deploy-Jobs).
3. Post-Deploy-Rauchprüfung: Function-Logs der sieben Functions auf Boot-/Import-Fehler prüfen. Ein Importfehler bricht den Drain sofort ab.
4. Drain-Fenster laufen lassen, Observe bleibt read-only.

## Messung im Drain

Harte Gates für Post-Deploy-Dispatches, jeweils **0**:

- `missing_binding`
- `job_not_found`
- `wrong_job`

Messwerte ohne Blockade:

- `binding_pending` — gezählt und ausgewertet (Callback vor `bindLedgerExternalJob()`).
- `stale_run`, `stale_generation` — diagnostisch, müssen je Vorkommnis auf einen legitimen Run-Wechsel zurückführbar sein.

## Berichtsform

Je Callback-Kanal separat, damit eine Gesamt-0 keinen unbeobachteten Kanal verdeckt:

| Kanal | Quelle |
| --- | --- |
| Replicate / Base-Video | `compose-clip-webhook` |
| Sync.so-Segment | `sync-so-webhook` |
| Audio-Mux | `render-sync-segments-audio-mux` |
| Remotion | `remotion-webhook` |

Pro Kanal ausgewiesen: Anzahl Post-Deploy-Attempts, `missing_binding`, `job_not_found`, `wrong_job`, `binding_pending`, `stale_run`, `stale_generation`. Kanäle mit 0 Attempts werden ausdrücklich als „nicht beobachtet" markiert, nicht als grün.

Zusätzlich: Attempt-Verteilung (Attempt 1 vs. Replace-Attempts) und jeder aufgetretene `predecessor_exists` / `retry_superseded` / `failure_not_retryable`-Verdikt mit Begründung.

## Abbruchkriterien

- Ein `missing_binding`, `job_not_found` oder `wrong_job` auf einem Post-Deploy-Job → Drain stoppen, Ursache melden, kein Weiterlauf.
- Boot-/Importfehler in einer der sieben Functions → sofortiger Stopp.

## Danach

Bericht → STOP. G3.2 bleibt während des gesamten Fensters gesperrt und wird erst nach Abnahme von G3.1 (DONE / FROZEN) separat freigegeben.
