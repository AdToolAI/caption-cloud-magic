# Bug — "Lip-Syncs starten gefühlt seriell"

## Diagnose (verifiziert an Logs der letzten Szene)

Szene `31bea8b9-c261-46ba-8c3a-2b7d3dd187e8` hat **3 Passes** (v95 Split: Sprecher A 2 Turns + Sprecher B 1 Turn). Log zeigt:

```
plan_d_parallel_dispatch_start N_passes=3 cap=2 fanout_size=2
```

→ Pass 0 + Pass 1 starten parallel, **Pass 2 bleibt `pending`** und wird erst gekickt, sobald Pass 0 oder 1 abgeschlossen ist (per Webhook-Chain). 

Das ist kein Bug — das ist exakt der `composer.sync_so_concurrency_cap = 2` Wert aus `system_config`. Plan D (v93) ist aktiv und parallelisiert wie erwartet, nur der Cap ist zu konservativ für 3+ Pass-Szenarien (insbesondere nach v95 Per-Turn-Split, der die Pass-Anzahl bei Multi-Turn-Sprechern erhöht).

## Fix

`system_config.composer.sync_so_concurrency_cap` von **2 → 4** anheben (Code-Clamp ist bereits `[1..4]`, kein Code-Change nötig).

```sql
UPDATE system_config SET value = '4'::jsonb
WHERE key = 'composer.sync_so_concurrency_cap';
```

### Effekt
- 2 Sprecher / 2 Passes: unverändert (alle parallel)
- 2 Sprecher / 3 Passes (1× Multi-Turn): **alle 3 parallel** statt 2+1
- 3 Sprecher / 3 Passes: alle 3 parallel statt 2+1
- 4 Sprecher / 4 Passes: alle 4 parallel statt 2+2
- MAX_SPEAKERS=4 (FROZEN I.6) bleibt das natürliche Obergrenze

### Wallclock-Erwartung
Aktuelle 3-Pass-Szene ~7:30 min mit cap=2 (1 Welle à 2 + 1 Welle à 1). Mit cap=4: **eine** Sync.so-Welle für alle 3 Passes parallel → erwartet **~5:30–6:00 min** (Speedup ~20–25 %).

### Was NICHT angefasst wird
- Kein Code-Change (Clamp ist bereits 4)
- Plan D Race-Safety (atomic RPCs `update_dialog_pass_slot`, `try_claim_mux_dispatch`) bleibt
- v95 Per-Turn-Split bleibt
- Webhook-Chain bleibt als Fallback aktiv (falls jemals N > cap)
- Sync.so-Kosten unverändert (Pricing pro Output-Sekunde × Passes, parallel spart nur Wall-clock)

### Rollback
```sql
UPDATE system_config SET value = '2'::jsonb
WHERE key = 'composer.sync_so_concurrency_cap';
```

### Verifizierung
Nächste 3-Pass-Szene: Log muss `cap=4 fanout_size=3` zeigen, **kein** `pendingIdxs[0]` Kick aus dem Webhook für Pass 2.

### Risiko
Minimal. Sync.so verträgt parallele Calls auf demselben gelockten Plate problemlos (kein Rate-Limit-Issue in bisherigen Tests bei cap=2). Falls Sync.so 429ed → einfacher Rollback auf 2.

### Memory-Update nach Fix
`mem://architecture/lipsync/v93-parallel-sync-so-passes.md` ergänzen: "Default-Cap nach v95-Per-Turn-Split auf 4 angehoben, da Pass-Anzahl pro Szene gestiegen ist."
