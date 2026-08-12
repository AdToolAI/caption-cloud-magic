# v427 — Run-Vertrag (kanonische Spezifikation)

Verbindliche Fassung. Ältere v427-Entwürfe sind ungültig. Archiv des freigegebenen Plans:
`.lovable/plan/v427-run-vertrag-kanonische-fassung-2026-08-12.md`.

## 0. Oberste Regel — Lip-Sync-Freeze

v427 wird **um** die Lip-Sync-Kette herum gebaut, nie hinein. Verboten: Framing, Preclip-Parameter,
Maskengeometrie, Kamerapfad, Sync.so-Payloads, Provider-Payloads, Reprojektion, Schwellenwerte,
Timing-Regeln, Mux-Konfiguration, neue Retries. `beginSceneRun()` bleibt der einzige Run-Start,
`run_guard_discarded` bleibt unverändert. Die Freeze-Tests sind Abnahmebedingung jedes Teilschritts.

`tail_padding_ms` wird aus der produktiven Timing-Logik (`compose-twoshot-audio`) übernommen und
nicht neu gesetzt. Ein eigener Wert wäre eine Qualitäts- und Kostenänderung.

## 1. Zustände

`composer_pipeline_jobs.status`:
`pending → dispatching → dispatched → running → callback_processing → succeeded | failed | cancelled | stale | dispatch_uncertain`

Szenen-`pipeline_state`: unverändert bis v427C; danach zusätzlich `base_clip_ready` und
`audio_mux_pending` (beide nichtterminal).

## 2. Datenmodell (angelegt in A1)

- `composer_scene_runs` — autoritative, unveränderliche Wahrheit pro Lauf (Dauern, Preis,
  Reservierung, eingefrorenes Audio-Asset, `contract_frozen_at`).
- `composer_pipeline_jobs` — ein Datensatz pro Stage; `id` ist die primäre Callback-Identität.
  `UNIQUE(idempotency_key)`, `UNIQUE NULLS NOT DISTINCT (scene_id, run_id, stage, segment_id, attempt_no)`.
- Spiegelspalten auf `composer_scenes` (nur UI), plus `base_clip_status` / `base_clip_url`.

## 3. Zwei getrennte Operationen

| Aufrufer | Operation | Wirkung |
|---|---|---|
| `modelark-poll` (Poller/Worker) | `assertActivePipelineJob()` | validiert Run + Job, setzt Heartbeat, **konsumiert nichts** |
| `compose-clip-webhook` | `claimPipelineCallback()` (`base_video`) | beansprucht den Abschluss genau einmal |
| `sync-so-webhook` | `claimPipelineCallback()` (`sync_segment`) | beansprucht nur das eigene Segment |
| `render-sync-segments-audio-mux` | eigener `audio_mux`-Job | kein erneuter Sync-Claim |

Ablehnungsgründe: `stale_callback | duplicate_callback | wrong_run | wrong_job | already_terminal | claim_locked | job_missing`
— strukturiert protokolliert, ohne Szenenmutation. Claim-Lease 5 Minuten; abgestürzte Handler
geben frei, erfolgreiche bleiben No-op. Dispatch-Rückschreibung nur `dispatching → dispatched`.

## 4. Parallele Sync-Segmente

Jedes Segment schreibt nur seinen Job und sein Segmentergebnis; die Szene bleibt auf
`lipsync_running`. `allRequiredSyncJobsSucceeded()` ist die Aggregationsbarriere — erst danach
genau ein Übergang auf `audio_mux_pending`.

## 5. Dauer- und Geldvertrag (v427B)

```text
raw_required_duration_ms = max(requested_duration_ms, measured_audio_end_ms + tail_padding_ms)
→ Providerfenster aufrunden → effective_duration_ms / _frames → billable → Preis
```

Reihenfolge: Auth → Dialog kanonisieren → Provider-Zulässigkeit → Maximalkosten
(Hailuo 10 s, HappyHorse 15 s, Seedance 30 s) → Run + Obergrenzen-Reservierung atomar → TTS
(idempotent, Bestandslogik unverändert, nur früher) → messen → exakter Vertrag → Reservierung
reduzieren → einfrieren → Videodispatch. Kein bezahlter Auftrag ohne Reservierung.
Offene Produktregel: Wer trägt TTS-Kosten, wenn der Dialog in kein Providerfenster passt.

## 6. Fertig-Semantik (v427C, C1 → C2 → C3)

```text
Kontinuitäts-Gate:   base_clip_status = ready AND Übergangsmaterial vorhanden
Nutzer-/Export-Gate: clip_status = ready AND (requires_lip_sync = false OR lip_sync_status = done)
```

## 7. Flags (Default = v426-Verhalten)

`v427.pipeline_jobs_dual_write`, `v427.callback_guard_mode` (`off|observe|enforce`),
`v427.audio_preflight`, `v427.credit_reservations`, `v427.ready_semantics`, `v427.provider_leases`
— in `system_config`, gelesen über `_shared/v427-flags.ts`.

## 8. Phasen

Phase 0 (Spezifikation, Flags, Fixtures, Inventar) → A1 Schema → A2 Dual-Write → A3 Guard
`observe` → `enforce` → B Dauer/Geld → C Fertig-Semantik → D Leases, Drafts, UI.
Rollout Expand-and-Contract; strikte Prüfungen nur für `run_contract_version = 427`.
