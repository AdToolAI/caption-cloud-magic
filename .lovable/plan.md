
# Plan B+ Hebel D — Parallele Sync.so-Passes (mit Hintergrund & Vorher/Nachher)

## TL;DR

- **Zeit**: 4-Sprecher-Szene 10:30 min → **~5:40 min** (-46%)
- **Geld**: **identisch** (€ pro Szene ändert sich NICHT, weil Sync.so pro Sekunde abrechnet, nicht pro Wallclock)
- **Risiko**: niedrig, wenn 3 Race-Conditions vorher abgefangen werden
- **Reversibel**: per Feature-Flag in <5 Sekunden zurückgeschaltet

---

## 1. Hintergrund — was passiert eigentlich pro Pass?

Eine **4-Sprecher-Szene** läuft heute so:

```text
T+0:00 ── Plate-Render (Hailuo i2v 6-10s)         ~60s
T+1:00 ── TTS x4 (ElevenLabs)                     ~60s
T+2:00 ── Anchor-Image (Nano Banana)              ~30s
T+2:30 ── Pre-Lipsync done (Pass 0 dispatch)
          │
          │ Sync.so PASS 0 (Sprecher 1)           ~75s
T+3:45 ── Pass 0 done → audio-mux Lambda
T+4:00 ── Pass 1 dispatch
          │ Sync.so PASS 1 (Sprecher 2)           ~75s
T+5:15 ── Pass 1 done → audio-mux Lambda
T+5:30 ── Pass 2 dispatch
          │ Sync.so PASS 2 (Sprecher 3)           ~75s
T+6:45 ── Pass 2 done → audio-mux Lambda
T+7:00 ── Pass 3 dispatch
          │ Sync.so PASS 3 (Sprecher 4)           ~75s
T+8:15 ── Pass 3 done → audio-mux Lambda
T+9:30 ── Final-Stitch (ffmpeg concat)            ~60s
T+10:30 ─ FERTIG
```

**Was jeder Pass macht** (alle 4 sind strukturell identisch):
- Input: dieselbe Original-Plate (locked Hailuo-Video, alle Münder geschlossen)
- Audio: nur die isolierte Stimme dieses einen Sprechers (andere stumm)
- Face-Coords: nur der Mund dieses Sprechers via manual ASD
- Output: ein 9s-Video mit nur diesem einen sprechenden Mund

Am Ende kombiniert die `render-sync-segments-audio-mux` Lambda die 4 Output-Videos zu einem einzigen Track (jeder Sprecher behält seinen Mund-Crop).

**Kritische Erkenntnis aus der DB-Analyse**: Pass 1 wartet NICHT auf Pass 0's Output. Alle 4 Passes lesen denselben Input. Die serielle Ausführung ist eine Konvention aus v33 (Race-Schutz), kein architektonischer Zwang.

---

## 2. Wird es wirklich günstiger? — Ehrliche Antwort: NEIN bei Geld, JA bei Zeit

Ich war beim ersten Plan ungenau. Hier die saubere Aufschlüsselung:

### Sync.so Pricing (Creator Plan $19/mo)
- Abrechnung: **$0.005 pro Sekunde Output-Video**, Modell-unabhängig
- Formel: `ceil(durationSec) × 9 × passes` Credits in unserer Wallet
- **Das ändert sich durch Parallel-Dispatch nicht.** 4 Passes à 9s = 4×9×9 = 324 Credits, egal ob seriell oder parallel.

### Wo Geld gespart wird (Nebeneffekte)
| Position | Heute | Parallel | Differenz |
|---|---|---|---|
| Sync.so Generation-Cost | 324 Credits | 324 Credits | **0 €** |
| Edge-Function Wallclock (compose-dialog-segments wakes) | 8x à ~1s | 5x à ~1s | ~€0.0001 |
| audio-mux Lambda Invocations | 4 (eine pro Pass) | 4 (eine pro Pass) | **0 €** |
| Watchdog Polls (`poll-dialog-shots` pg_cron) | ~10 Runs | ~5 Runs | ~€0.0001 |
| **User wartet** | **10:30 min** | **~5:40 min** | **— (UX!)** |

**Fazit**: Direkter Kosten-Effekt = 0. Der gesamte Nutzen ist **UX (halbe Wartezeit)** und indirekt **Conversion** (Nutzer brechen seltener ab).

Falls in einem späteren Schritt Mux-Lambdas zusammengelegt werden (eine statt N), wären das ~€0.01 pro Szene. Das ist **nicht Teil dieses Plans** — Plan D ist reine Latenz-Optimierung.

---

## 3. Vorher / Nachher

```text
HEUTE (seriell, FROZEN I.9 v60)
═══════════════════════════════════════════════════════════════
[Plate ▰▰▰▰▰▰▰▰▰▰▰▰] 60s
                    [TTS ▰▰▰▰▰▰▰▰▰▰▰▰] 60s
                                       [Anch ▰▰▰▰▰▰] 30s
                                                    [P0 ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰] 75s
                                                                        [mux] 15s
                                                                             [P1 ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰] 75s
                                                                                                 [mux] 15s
                                                                                                      [P2 ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰] 75s
                                                                                                                          [mux] 15s
                                                                                                                               [P3 ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰] 75s
                                                                                                                                                   [mux] 15s
                                                                                                                                                        [stitch ▰▰▰▰▰▰▰▰▰▰▰▰] 60s
T+0                                                                                                                                                                   T+10:30 ✓


NACHHER (parallel, Plan D)
═══════════════════════════════════════════════════════════════
[Plate ▰▰▰▰▰▰▰▰▰▰▰▰] 60s
                    [TTS ▰▰▰▰▰▰▰▰▰▰▰▰] 60s
                                       [Anch ▰▰▰▰▰▰] 30s
                                                    [P0 ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰] 75s ┐
                                                    [P1 ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰] 75s │ parallel
                                                    [P2 ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰] 75s │ (selber Input,
                                                    [P3 ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰] 75s ┘  selbe Plate)
                                                                        [mux x4 parallel] 20s
                                                                                          [stitch ▰▰▰▰▰▰▰▰▰▰▰▰] 60s
T+0                                                                                                T+5:40 ✓
```

**Phasen-Vergleich:**

| Phase | Heute | Parallel | Δ |
|---|---|---|---|
| Pre-Lipsync (Plate + TTS + Anchor) | 150s | 150s | – |
| Sync.so-Chain | **436s** (4×~75s + 4×~15s mux + Switches) | **~95s** (max(P0..P3) + parallel mux) | **−341s** |
| Final-Stitch | 60s | 60s | – |
| **Total** | **~630s = 10:30** | **~340s = 5:40** | **−4:50 min** |

---

## 4. Warum es heute funktioniert (und v60 keine Lüge war)

| Historischer Block | Damals | Heute |
|---|---|---|
| **v33** doppelter Dispatch (zwei Pass-0 Jobs in 76ms) | kein Single-Flight-Lock in `compose-dialog-segments` | ✅ `try_acquire_dialog_lock(90s)` läuft seit v33 |
| **v60 FROZEN I.9** "kein Fan-Out für N≥2" | 2-Sprecher fan-out zeigte dieselben Race-Symptome wie v33 N≥3 | Lock greift mittlerweile auch dort — war eine **Vorsichts-Generalisierung** |
| **v56 `provider_unknown_error`** | EIN Sync.so-Call mit `segments[]` + lipsync-2-pro auf locked plate | ❌ **anderer Mechanismus** — wir würden N Einzel-Calls feuern, kein `segments[]` |
| **sync-3 Default (v62)** | lipsync-2-pro warf `unknown_error` auf static plates | ✅ sync-3 ist robust für locked plates, egal ob 1 oder N Calls |

Plan D verletzt **keine** der heute aktiven FROZEN-Invariants (I.1–I.12). Es ändert nur **wann** die Pass-Calls gestartet werden, nicht **was** Sync.so kriegt.

---

## 5. Was sind die echten Risiken & Mitigations?

| Risiko | Wie es zuschlägt | Mitigation in diesem Plan |
|---|---|---|
| **A) Sync.so Concurrency-Cap überschritten** | HTTP 429 von Sync.so beim 4. parallelen Call | Pre-Flight Phase 0: Limit klären. Hard-Cap-Flag `composer.sync_so_concurrency_cap`, default 2, vorsichtig hochschrauben |
| **B) JSONB Lost-Update** | 2 Webhooks lesen `passes[]`, modifizieren je eine Zelle, letzter überschreibt erste → Pass-Status verloren → Watchdog refundet fälschlich | Phase 1: atomare `update_dialog_pass_slot(scene_id, idx, patch)` RPC mit `jsonb_set` |
| **C) audio-mux 4× dispatched** | jeder COMPLETE-Webhook triggert mux statt nur der letzte | Phase 2: `acquireMuxDispatchLock(scene_id)` + Gate auf `passes.every(done)` |
| **D) try_acquire_dialog_lock blockt zu früh release** | parallel-Dispatch hält Lock 90s während alle 4 Jobs starten — kein Problem, weil Dispatch <2s pro Pass | unverändert |
| **E) Sync.so wirft `provider_unknown_error`** auf einem der 4 Calls | wie heute auch — kein neues Verhalten | bestehender Retry-Ladder (v82/v84) greift pro Pass unverändert |

**Was NICHT mehr passieren kann** (im Vergleich zur v33-Welt):
- Doppel-Dispatch desselben Passes — `try_acquire_dialog_lock` ist global pro Szene
- `job ... not in passes[]` — die Passes-Slots existieren ALLE schon bei Dispatch, nicht erst beim Webhook

---

## 6. Plan im Detail

### Phase 0 — Pre-Flight (KEIN Code, ~30 min Recherche)

1. **Sync.so Doku** lesen: https://docs.sync.so/ — Suche nach "concurrent" / "rate limit" / "Creator plan"
2. Falls Doku unklar: **Support-Mail** an Sync.so. Frage wörtlich:
   > "What is the maximum number of concurrent generations allowed on the Creator $19/mo plan? Do you rate-limit per API key, per account, or per IP?"
3. **Lambda-Headroom**: Memory-Check — `Lambda Concurrency Policy` sagt `max 3 parallel workers` für Composer. Audio-Mux ist leichtgewichtig (15s/Pass) → 4 parallele Invocations okay, aber wir cappen sicherheitshalber auf 4
4. **Entscheidung dokumentieren** in `mem/architecture/lipsync/v93-parallel-sync-so-passes.md`

### Phase 1 — Atomare State-Updates (Migration + Code)

**Migration:** neue Postgres-Function
```sql
CREATE OR REPLACE FUNCTION public.update_dialog_pass_slot(
  _scene_id uuid,
  _pass_idx int,
  _patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _new_shots jsonb;
BEGIN
  UPDATE composer_scenes
  SET dialog_shots = jsonb_set(
        dialog_shots,
        ARRAY['passes', _pass_idx::text],
        COALESCE(dialog_shots->'passes'->_pass_idx, '{}'::jsonb) || _patch,
        false
      ),
      updated_at = now()
  WHERE id = _scene_id
  RETURNING dialog_shots INTO _new_shots;
  RETURN _new_shots;
END $$;

-- Mux-Lock via existing dialog_dispatch_locks Tabelle
-- (kein neues Schema nötig)
```

**Code:** beide Edge-Functions ersetzen ihr direktes `UPDATE composer_scenes SET dialog_shots = ...` für per-Pass-Felder durch `supabase.rpc('update_dialog_pass_slot', { _scene_id, _pass_idx, _patch })`.

### Phase 2 — Parallel-Dispatch (gated)

**System-Config Flags** (default beide OFF):
- `composer.parallel_sync_so_passes` (boolean)
- `composer.sync_so_concurrency_cap` (number, default 2)

**`compose-dialog-segments`** (~L2418):
```ts
const parallelAllowed = await getFlag('composer.parallel_sync_so_passes');
const cap = await getFlag('composer.sync_so_concurrency_cap') ?? 2;
const fanOutAllowed = parallelAllowed && passes.length >= 2;
const fanOutBatchSize = Math.min(passes.length, cap);

if (fanOutAllowed) {
  const initialBatch = passes.slice(0, fanOutBatchSize);
  const results = await Promise.allSettled(
    initialBatch.map((p, i) => dispatchSyncSoPass(scene, p, i))
  );
  // Telemetrie loggen
  // Wenn passes.length > cap: Rest läuft via Webhook chained weiter
} else {
  // Bestehende serielle v60-Logik (unverändert)
}
```

**`sync-so-webhook`** (~Audio-Mux Branch):
```ts
const allDone = scene.dialog_shots.passes.every(p => p.status === 'done');
if (allDone && !scene.dialog_shots.audio_mux?.render_id) {
  const locked = await acquireMuxDispatchLock(scene.id);
  if (locked) await dispatchAudioMux(scene);
}
```

### Phase 3 — FROZEN-Invariants aktualisieren

I.9 wird **umgeschrieben** (nicht entfernt):
```markdown
## I.9 — Dispatch-Race-Schutz für Sync.so-Passes (v93, supersedes v60)

Parallele Dispatches sind erlaubt, ABER:
- compose-dialog-segments MUSS try_acquire_dialog_lock halten
- Jeder per-Pass State-Write MUSS via update_dialog_pass_slot() RPC laufen
- Audio-Mux MUSS via acquireMuxDispatchLock() gehen
- Concurrency-Cap = composer.sync_so_concurrency_cap
- Flag composer.parallel_sync_so_passes=false → serielle v60-Logik bleibt aktiv
```

### Phase 4 — Stufen-Rollout (über 3-4 Tage)

| Tag | Schritt | Test-Szene | Abbruch wenn |
|---|---|---|---|
| 1 | Migration + Code deployed, **Flags OFF** | bestehende Szene läuft seriell | irgendeine Regression |
| 1 | Flag ON + Cap=**2**, **2-Sprecher**-Szene | 2 parallel, kein `not in passes[]`, mux 1× | jegliche Sync.so FAIL |
| 2 | Cap=**3**, **3-Sprecher**-Szene | 3 parallel | Sync.so 429 oder JSONB-Bug |
| 3 | Cap=**4**, **4-Sprecher**-Szene | **Ziel <6 min wallclock** | 429 / unknown_error / lost update |
| 4 | 24h ohne Regression → Default in Code ziehen, FROZEN I.9 final aktualisieren | | |

### Phase 5 — Telemetrie (für Validierung)
```
plan_d_parallel_dispatch_start  N_passes=X cap=Y
plan_d_parallel_dispatch_done   ms_total=Z ok=A fail=B
plan_d_mux_lock_acquired        scene_id=…
plan_d_mux_lock_skipped         reason=already_locked
plan_d_sync_so_429              retry_after=…
```

---

## 7. Was bleibt unverändert (Sicherheits-Anker)

- Sync.so Payload + Retry-Ladder (v82/v84)
- sync-3 als Default-Modell (v62, I.10)
- Pricing-Formel `ceil(durSec) × 9 × N_passes`
- v23 server-owned state + idempotente Refunds
- v33 `try_acquire_dialog_lock`
- Locked-camera Prompt (I.4)
- Manual-ASD Guard (I.5)
- MAX_SPEAKERS=4 (I.6)
- Audio-Mux Lambda (`render-sync-segments-audio-mux`)

---

## 8. Was NICHT in diesem Plan ist

- **Hebel A** (TTS+Anchor parallel) — eigener Plan, Duration-Lock-Subtilität
- **Hebel C** (Audio-Mux konsolidieren auf 1 Lambda) — könnte später ~15s sparen
- **framesPerLambda-Tuning** — separater Bereich
- **Pricing-Senkung** — durch reine Parallelisierung nicht möglich (ehrliche Korrektur oben)

---

## 9. Reversibilität

Falls irgendwas schiefgeht:
```sql
UPDATE system_config SET value='false'::jsonb
WHERE key='composer.parallel_sync_so_passes';
```
→ nächste Szene läuft wieder im v60-seriell-Modus. **Kein Deployment, kein Code-Rollback nötig.**

Falls Migration selbst Probleme macht (extrem unwahrscheinlich, weil sie nur eine RPC hinzufügt): Lovable History-Revert auf den Zustand vor Plan D.
