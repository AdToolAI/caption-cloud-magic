# Video Enhance — Orchestrierung: Ist-Zustand und Zielarchitektur

Read-only-Review. Keine Änderungen vorgenommen.

## Ist-Zustand (verifiziert im Code)

**Zustandsautomat** (`video_enhance_runs.status`, Autorität liegt vollständig im Backend):
`credits_reserved → provider_submitting → provider_submitted → provider_processing → provider_output_ready → asset_staging → asset_persisting → completed`
Nebenwege: `cancel_requested`, `local_poll_timeout`, `asset_persist_failed`, `provider_failed`, `output_lost`, `provider_cancelled_confirmed`, `manual_review`.

**Provider-Pfade**
- Replicate / ByteDance vCube: signierter Webhook (`video-enhance-webhook`, Callback-Token → genau ein Run, danach autoritatives Nachlesen beim Provider). Der Webhook setzt bei Erfolg `provider_output_ready` + `next_persist_at = now()` — er speichert die Datei aber nicht selbst.
- Topaz: `video-enhance/index.ts:798` — kein signierter Webhook. Erfolg wird ausschließlich vom Reconciler entdeckt. Der Status-Poll des Browsers (`fastProviderVerdict`) wertet bewusst nur Ablehnungen aus.

**Wann die Speicherung beginnt.** Nie im Erkennungspfad. Der einzige Ausführer ist `video-enhance-reconcile`, per pg_cron alle 5 Minuten, und dort pro Aufruf **genau ein** `video_enhance_claim_persist_run` (atomarer `UPDATE ... FOR UPDATE SKIP LOCKED` mit Lease). Daraus folgt der gemessene Leerlauf: bis zu 5 Minuten Wartezeit plus Warteschlange, wenn parallel weitere 4K-Runs anstehen.

**Transfer.** `video-enhance-transfer.ts`: 6-MB-Chunks, resumable Upload-URL + Offset in der DB, deterministischer Zielpfad `<user>/video-enhance/<run>.mp4`, Zeitbudget 60 s pro Aufruf, Lease 240 s, Retry-Plan `[0, 2, 5, 15, 30]` Minuten, danach `manual_review` **ohne** Refund. Diese Schicht ist gesund; der Engpass ist ausschließlich die Auslösung.

**UI.** `useEnhanceVideo.ts` hält genau einen Run, ein Poll-Intervall, ein `isRunning`. `open_run` liefert nur den neuesten nicht-terminalen Run. Der Anzeigezustand existiert nur, solange `EnhanceVideoPanel` gemountet ist — Backend läuft weiter, die Anzeige verschwindet.

**Queue.** Es gibt generische Tabellen (`ai_jobs`, `auto_post_queue`), aber `video_enhance_runs` ist bereits eine vollwertige Job-Tabelle mit Lease-, Backoff- und Idempotenzfeldern. Eine zweite Queue wäre reiner Zusatzaufwand.

## Zielarchitektur — Empfehlung zu den sechs Fragen

1. **Ja, sofort finalisieren.** Erkennung und Ausführung entkoppeln über einen internen Trigger-Aufruf: Webhook (Replicate) bzw. Status-Poll und Reconciler (Topaz) rufen nach dem Setzen von `provider_output_ready` `video-enhance-persist` per `fetch` mit Service-Role auf. Cron bleibt reiner Wächter.
2. **Ja, DB-Claim-Worker beibehalten** — `video_enhance_claim_persist_run` bleibt der einzige Einstieg in schwere Arbeit; die neue Funktion ruft dieselbe Claim-RPC. Keine neue Queue-Tabelle.
3. **Ja, Nebenläufigkeit begrenzen:** global 3 gleichzeitige Transfers, pro Nutzer 1. Umsetzung als Zählabfrage innerhalb der Claim-RPC (`persist_lease_until > now()`), nicht im Anwendungscode.
4. **Ja, `open_runs`** (Plural) als neue Aktion, rückwärtskompatibel neben `open_run`; darauf ein app-weites Job-Center-Symbol.
5. **Ja, Trennung beibehalten.** Provider-Arbeit, Persistenz, Geld und UI bleiben eigene Zustände — das ist heute schon richtig gelöst.
6. **Idempotenz** ergibt sich aus: deterministischer Zielpfad, `completed`-Kurzschluss in `finalizeSuccess`, Lease + `SKIP LOCKED`, deterministische Refund-Schlüssel. Zusätzlich nötig: der neue Sofort-Trigger darf nur anstoßen, nie selbst schreiben, und muss bei belegtem Claim geräuschlos aufgeben.

## Konkrete Änderungen (kleinstmöglich)

**Neu**
- Edge-Funktion `video-enhance-persist`: nur intern aufrufbar (gleicher Guard wie der Reconciler), claimt bis zu N Runs in einer Schleife bis zum Zeitbudget, sonst identische Logik.
- Spalte `persist_priority timestamptz` nicht nötig — `created_at` reicht als Reihenfolge.
- Aktion `open_runs` in `video-enhance/index.ts` (alle nicht-terminalen Runs des Nutzers).
- `src/hooks/useEnhanceVideo.ts`: Run-Map statt Einzel-Run, Polling je Run, abgeleitete Altfelder bleiben erhalten.
- Globales Job-Center (kleine Leiste/Popover), gespeist aus `open_runs`.

**Geändert**
- `video-enhance-webhook`, `video-enhance-reconcile`, `fastProviderVerdict`: nach `provider_output_ready` den Sofort-Trigger feuern (fire-and-forget, Fehler nur protokollieren).
- `fastProviderVerdict`: auch Erfolg auswerten, damit Topaz nicht auf den 5-Minuten-Takt wartet.
- `video_enhance_claim_persist_run`: Parameter `p_max_global` (3) und `p_max_per_user` (1).

**Unverändert**: Cron alle 5 Minuten (jetzt nur Wächter), Transfer-/Chunk-Logik, Preise, Wallet, Refund-Schlüssel, Lip-Sync, Director's Cut.

## Zeit- und Wiederholungspolitik

- Lease 240 s, Transferbudget 60 s pro Aufruf, Selbst-Weiterreichung solange Bytes fehlen.
- Persistenz-Retry `[0, 2, 5, 15, 30]` Minuten, danach `manual_review` ohne Refund (unverändert).
- Provider-Poll-Backoff unverändert; Horizont für `manual_review` unverändert.

## Rollout-Reihenfolge

1. Claim-RPC um Nebenläufigkeitsgrenzen erweitern (verhaltensneutral bei N=1).
2. `video-enhance-persist` deployen, zunächst nur vom Reconciler aufgerufen.
3. Sofort-Trigger im Webhook aktivieren, ByteDance-Lauf messen.
4. Erfolgserkennung im Status-Poll für Topaz aktivieren.
5. `open_runs` + Hook-Umbau + Job-Center.
6. Tests: paralleler Start, unabhängiger Abbruch, Wiederherstellung nach Neuladen, Webhook+Poll+Cron-Rennen führt zu genau einem Transfer und genau einer Abrechnung.

**Erwartetes Ergebnis:** Speicherbeginn von bis zu 5 Minuten auf wenige Sekunden nach Provider-Ende, bis zu 3 parallele Speicherungen, laufende Jobs überall in der App sichtbar.
