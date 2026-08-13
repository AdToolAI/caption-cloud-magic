# v427/v428 — Nächste Schritte nach der Anker-Härtung

## Verifizierter aktueller Stand

- Block 1 (Anker-Härtung) ist deployed: Drei unabhängige Schichten verhindern, dass Lip-Sync-Szenen jemals einen Continuity-Frame erhalten.
- `system_config`: `v427.callback_guard_mode = observe` und `v427.pipeline_jobs_dual_write = false` (für den Operator-Account).
- Tabellen `composer_scene_runs`, `composer_pipeline_jobs`, `composer_continuity_queue` existieren, enthalten aber 0 Zeilen.
- `composer_scenes` hat bereits `base_clip_status`, `base_clip_url`, `run_contract_version`.
- Kein Vier-Sprecher-Fixture-Test vorhanden.

## Schritt 1 — 4-Zustands-Callback-Guard

Der aktuelle Guard kennt nur den Claim-Lease (`callback_processing`). Wir führen eine getrennte Callback-Delivery-State-Spur ein:

- `received` — Webhook hat den Callback angenommen.
- `processing` — Claim aktiv, Business-Logik läuft.
- `succeeded` — Verarbeitung erfolgreich.
- `failed_redeliverable` — Verarbeitung gescheitert, Callback bleibt aber erneut zustellbar.

Massnahmen:

- Neue Spalte `callback_delivery_status` auf `composer_pipeline_jobs` (oder saubere Enum-Erweiterung, falls Migration einfacher ist).
- `claimPipelineCallback` setzt `received` → `processing` statt nur `callback_processing`.
- `completePipelineJob` unterscheidet `succeeded` und `failed_redeliverable`; letzterer hält den Job nicht-terminal.
- Guard in `observe` belassen, bis ein echter Lauf die Zustände durchlaufen hat.

## Schritt 2 — Vier-Sprecher-Fixture-Test

Neuer Vertragstest `src/lib/composer/__tests__/fourSpeakerFixture.test.ts` simuliert:

- 4 Sprecher, 1 Szene, 1 Run.
- Jeder Sprecher bekommt einen eigenen `sync_segment`-Job im Ledger.
- Die Aggregationsbarriere öffnet sich erst, wenn alle 4 Segment-Jobs `succeeded` sind.
- Kein Job überschreibt den Status eines anderen Segments.
- Lip-Sync-Provider bleibt HappyHorse oder Hailuo.

## Schritt 3 — A2/A3 aktivieren (beobachtend)

- `v427.pipeline_jobs_dual_write = true` für den Operator-Account setzen.
- Eine einzelne Szene fahren und prüfen, dass pro Stage genau eine Ledger-Zeile entsteht.
- `v427.callback_guard_mode = observe` belassen; Logs auf Ablehnungsgründe prüfen.

## Schritt 4 — Phase B: Geldvertrag

- `v427.credit_reservations = true` für den Operator-Account.
- Reservierung vor Dispatch, Settlement nach Callback.
- Offene Produktregel klären: Wer trägt TTS-Kosten, wenn der gemessene Dialog in kein Providerfenster passt?

## Schritt 5 — Phase C: Fertig-Semantik

- `v427.ready_semantics` aktivieren.
- `compose-clip-webhook` schreibt `base_clip_status = ready`, sobald das Basisvideo vorliegt.
- Alle Consumer aus `docs/v427-ready-consumers.md` auf die zwei Gates umstellen.

## Schritt 6 — Phase D: Leases, Drafts, UI

- `v427.provider_leases` gegen Doppelbuchungen desselben Providerslots.
- Storyboard-Persistenz (Drafts) und Fortschrittsanzeige aus `pipeline_state` ableiten.

## Technische Details

- Kein Eingriff in die eingefrorene Lip-Sync-Kette (`.lovable/LIPSYNC-FEATURE-FREEZE.md`).
- Alle Änderungen flag-geschützt; Default bleibt v426-Verhalten.
- Freeze-Tests (`lipsyncAnchorCoherence.test.ts`, `lipsyncFrozenContract.test.ts`) müssen weiterhin grün bleiben.
- Migration für `callback_delivery_status` benötigt GRANT auf `composer_pipeline_jobs` (bereits vorhanden, da Tabelle aus A1).
