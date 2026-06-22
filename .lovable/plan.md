# Phase 1 + 2: Echte 4-Way-Fanout für Sync.so Dialog-Passes

## Was die Logs zeigen (Run cf344a0d, 11:40 wallclock, cap=4)

```text
t=0s     Pass 0  STARTED
t=50s    Pass 0  DISPATCHED  (face-probe 45s + dispatch 5s)
t=51s    Pass 1  STARTED        ← fanout aktiv (1s gap)
t=70s    Pass 1  DISPATCHED
                                ← 60s LÜCKE: warten auf Pass 0 webhook
t=131s   Pass 2  STARTED
t=194s   Pass 2  DISPATCHED  (face-probe 60s)
                                ← 68s LÜCKE: warten auf Pass 2 webhook
t=263s   Pass 3  STARTED
t=312s   Pass 3  DISPATCHED
         + sync.so render & mux → 11:40 total
```

## Diagnose — der eigentliche Bottleneck ist **nicht** mehr der Scene-Lock

`composer.sync_so_concurrency_cap = 4` hat **bereits funktioniert** — Pass 0+1 dispatchen jetzt 1s auseinander (gestern: 0+2 parallel, Pass 1 erst nach 110s). Aber:

1. **Nur 2-Way-Fanout, nicht 4-Way.** Pass 2 und Pass 3 starten erst nach `webhook-from-previous-pass` (~60–80 s pro Hop). Der `preclip-prefanout`-Code rendert offenbar nur N=2 Preclips parallel und chained den Rest.
2. **Face-Gate-Probe ist seriell.** Jeder Pass macht eine eigene 40–60 s `FACE_GATE_PROBE_UNAVAILABLE`-Probe vor dispatch. 4 × 50 s = **200 s rein für Face-Probes**, die mit echter Parallelität auf ~50 s kollabieren.
3. **Scene-Lock-Block** (`try_acquire_dialog_lock(scene_id)`) ist immer noch da, aber durch die 60–80 s Webhook-Lücken wird er nie wirklich getroffen — Pass N+1 startet erst nachdem Pass N-Lock längst frei ist. Lock ist **nicht der Top-Bottleneck**, aber blockiert die Lösung.

## Realistische Zielzeiten

| Szenario | Wallclock | Δ |
|---|---:|---:|
| Heute (cap=4, 2-way fanout) | **11:40** | Baseline |
| + Echte 4-Way-Fanout (alle Passes STARTED in <10 s) | **~8:00** | −3:40 |
| + Per-Pass-Lock + Per-Slot-Write RPC (sicher gegen Lost-Update) | **~7:30** | −4:10 |

Multi-Speaker-Single-Job (Path A) bleibt explizit **ausgeschlossen** (Qualität).

## Implementierungs-Plan (4 Phasen, jede einzeln rollback-bar)

### Phase 1 — Per-Slot-Write RPC (Code-Hygiene, kein Speedup, low risk)
**Ziel:** Vor Per-Pass-Lock muss der Full-Row-`UPDATE composer_scenes SET dialog_shots = …` weg, sonst überschreibt der letzte paralleles Pass-Webhook die Job-IDs der anderen.

- Neue RPC `update_dialog_pass_slot(p_scene_id uuid, p_pass_idx int, p_patch jsonb)` — macht `jsonb_set` auf `dialog_shots[pass_idx]` atomar mit `FOR UPDATE`-Row-Lock.
- `compose-dialog-segments/index.ts` Zeilen 5667–5691 → ersetzen mit RPC-Call pro Slot.
- Top-Level-Scene-Felder (`dialog_status`, `dialog_completed_at`) bleiben als separater UPDATE.
- **Validierung:** N=2 Run muss identische Wallclock zeigen (~6 min). Schreib-Logs zeigen separate `UPDATE` statt eines Merge.

### Phase 2 — Per-Pass-Lock (Schema + RPC, Kernfix für Fanout)
- Migration:
  - `ALTER TABLE dialog_dispatch_locks DROP CONSTRAINT pkey, ADD COLUMN pass_idx INT NOT NULL DEFAULT 0, ADD PRIMARY KEY (scene_id, pass_idx)`
  - `try_acquire_dialog_lock(scene_id, pass_idx)` + `release_dialog_lock(scene_id, pass_idx)` erweitert.
- `compose-dialog-segments` & `propagateDialogLock.ts`: alle Lock-Aufrufe nehmen `pass_idx`-Argument.
- **Hinter Feature-Flag** `FEATURE_PER_PASS_LOCK` (Edge-Function-Env). Default OFF.
- **Rollback:** Flag OFF + Reverse-Migration; alte Lock-Aufrufe bleiben backward-kompatibel via `pass_idx DEFAULT 0`.

### Phase 3 — Echter 4-Way Preclip + Dispatch Fanout
- Im `composer-self-invoke` Code-Pfad: statt N=2 vorab zu dispatchen, **alle N Passes** als parallele Self-Invokes feuern (mit `pass_idx` an Lock-RPC).
- `FEATURE_PRECLIP_PREFANOUT` bleibt der Schalter; intern wird `MAX_PREFANOUT` von hardcoded 2 → `Math.min(N, 4)` (Sync.so Plan-Limit).
- Face-Gate-Probe läuft dadurch automatisch parallel (jeder Self-Invoke macht eigene Probe).
- **Validierung im Log:** Alle 4 `DISPATCH_ATTEMPT_STARTED` innerhalb <10 s (heute: 263 s).

### Phase 4 — Rollout
- N=2 Test mit Flag ON → erwartete Wallclock ~3:30 (heute ~6 min).
- N=3 Test → ~5:00 (heute ~8:30).
- N=4 Test → ~7:30–8:00 (heute 11:40).
- Bei jeder Stufe: 0 % Failure-Rate als Gate, sonst Flag OFF und Phase debuggen.

## Was NICHT angefasst wird (Frozen-Invariants)

- ✅ `try_claim_mux_dispatch(scene_id)` — bleibt scene-weit, single-flight beim finalen Mux.
- ✅ Sync.so-3-Optionen (nur `sync_mode` + `active_speaker_detection`, kein temperature) — unverändert.
- ✅ v153-Block (Preclip-Nullify) — wird in Phase 3 patched, **nur wenn nötig** (erst Logs nach Phase 3 zeigen, ob Preclips überschrieben werden).
- ✅ ASD-Strategie (frame_number+coords pro Pass) — unverändert.
- ✅ 8-min Sync.so Watchdog — unverändert.

## Risiken & Mitigationen

| Risiko | Mitigation |
|---|---|
| Lost-Update auf `composer_scenes.dialog_shots` bei 4 parallelen Webhooks | Phase 1 (Per-Slot-RPC) ist Prerequisite vor Phase 2 |
| Sync.so Plan-Limit (Creator: 6 concurrent jobs) überschritten | `MAX_PREFANOUT = Math.min(N, 4)` lässt Headroom |
| Face-Gate-Probe-Storm (4× parallel auf gleicher Source) | Probes laufen schon idempotent gegen Preclip-URL; kein Server-Stress |
| Edge-Function CPU-Limit bei 4 parallel Self-Invokes | Self-Invokes sind separate Function-Instanzen, kein gemeinsames Limit |
| Webhook-Race auf finalen Mux-Trigger | `try_claim_mux_dispatch` bleibt unverändert, behält single-flight |

## Reihenfolge der Lieferung

1. Phase 1 Migration + Code in einem Schub → User testet N=2 (Soll: gleiche Zeit, keine Regression)
2. Phase 2 Migration + Code mit Flag OFF → kein Verhaltens-Change
3. Phase 3 Code-Change + Flag ON für User-Account → N=2 Test
4. N=3 + N=4 Tests, dann Flag global ON
