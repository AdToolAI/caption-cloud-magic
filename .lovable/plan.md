# Lipsync v166 — Safe Speedup für N=4 (Baseline 13:30 min)

Pipeline-Default ist **`sync-3` + `bbox-url-pro`** (verifiziert: `compose-dialog-segments/index.ts:4329` → `payloadModel = SYNC3_MODEL`). Alle drei Speedups sind modell-agnostisch und verletzen **keine** der 7 Frozen Invariants.

## Warum dauert N=4 heute 13:30 min?

Im v139-Fanout-Block (Z. 5708-5784) gilt aktuell `concurrencyCap = 2`:

```
fanOutEnd = min(4 passes, cap=2) = 2

t=0:00  Pass 0 + Pass 1 dispatchen parallel (jeweils Preclip-Lambda + sync-3)
t≈4:30  Pass 0 fertig → Webhook → Pass 2 startet (Preclip + sync-3)
t≈9:00  Pass 2 fertig → Webhook → Pass 3 startet (Preclip + sync-3)
t≈13:30 Pass 3 fertig → render-sync-segments-audio-mux → Stitch
```

Zwei serielle Webhook-Roundtrips à ~4-5 min = ~9 min Reine Wartezeit, die parallelisierbar ist.

---

## Schritt 1 — Plan-D Fanout cap 2 → 3

### Wo & Wie
- **File**: `supabase/functions/compose-dialog-segments/index.ts` Z. **5709**: `let concurrencyCap = 2;`
- **Override existiert bereits** (Z. 5718-5725): liest `system_config.composer.sync_so_concurrency_cap`, clampt auf `[1, 4]`.
- **Saubere Variante**: kein Code-Edit, nur DB-Upsert:
  ```sql
  INSERT INTO public.system_config (key, value)
  VALUES ('composer.sync_so_concurrency_cap', '3')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  ```

### Wirkung bei N=4
```
fanOutEnd = min(4, 3) = 3
t=0:00  Pass 0+1+2 parallel dispatchen
t≈4:30  Erster Webhook → Pass 3 startet (Preclip + sync-3)
t≈9:00  Pass 3 fertig → Mux → Stitch
```
**Ersparnis: ~4-5 min** (ein serieller Webhook-Roundtrip weniger).

### Was schiefgehen könnte
| Risiko | Wahrsch. | Mitigation |
|---|---|---|
| Sync.so Rate-Limit (429) | Gering | `SYNCSO_DEFAULT_MAX_PARALLEL = 3` im Preflight-Helper (`syncso-preflight.ts:667`) bestätigt 3 als dokumentierter Soft-Cap. Preflight klassifiziert 429 als `rate_limited` und retried sauber. |
| Lambda Concurrency | Gering | Max 5 Worker; 3 parallele Preclips lassen Headroom |
| Webhook-Race (3 COMPLETE simultan) | Gering | `update_dialog_pass_slot()` RPC ist atomic-per-slot (jsonb_set) — race-safe by design |
| Refund-Doppelung bei Parallel-Fail | Sehr gering | Deterministische UUID aus video_id → idempotent (A-Z Schritt M) |

### Rollback
DB-Wert auf `2` zurück. Sofort wirksam, kein Re-Deploy. Hard-Killswitch: `composer.plan_d_fanout_force_enable = false`.

---

## Schritt 2 — Preclip-Bbox-JSON pre-rendern (Pre-Fanout)

### Wo & Wie
- **File**: `supabase/functions/compose-dialog-segments/index.ts`, neuer Block **NACH** dem G.1+G.2+G.3 Identity-Resolve / Hard-Fail-Guard (also ca. nach Z. 3700, **vor** `if (v161PreclipEligible)`).
- **Gating**: nur wenn `!isAdvance && !isRetry && passes.length >= 3` (für N=2 unnötig, für N=3 macht Schritt 1 das schon).
- **Logik**: `Promise.allSettled` über alle Passes ohne `preclip_url`, ruft das **bestehende** `renderPassFacePreclip` aus `_shared/pass-face-preclip.ts` auf. Persistiert via demselben `update_dialog_pass_slot()`-Path wie heute.
- Bestehender Per-Pass-Lazy-Render bleibt 1:1 als Fallback → Regression unmöglich.
- Hinter Env-Flag: `FEATURE_PRECLIP_PREFANOUT=true` (default false beim Deploy, manuell aktivieren).

### Wirkung bei N=4 (Kombi mit Schritt 1)
```
t=0:00   Pre-Fanout: 4 Preclips parallel auf Lambda (~90-120 s)
t≈2:00   Alle Preclips fertig → Pass 0+1+2 dispatchen sync-3 parallel
t≈5:00   Erster Webhook → Pass 3 dispatched sync-3 SOFORT (Preclip schon da)
t≈8:00   Pass 3 fertig → Mux → Stitch
```
**Zusätzliche Ersparnis: ~1.5-2 min** gegenüber Schritt 1 allein.

### Was schiefgehen könnte
| Risiko | Wahrsch. | Mitigation |
|---|---|---|
| 4 Lambda-Renders gleichzeitig | Mittel | Max-Worker = 5; bei Cast-Hard-Cap N≤4 sicher |
| Race beim Persist von `preclip_url` | Gering | `update_dialog_pass_slot()` atomic — selber Write, nur früher |
| Pre-Render schlägt fehl | Mittel | `Promise.allSettled` + bestehender Lazy-Render-Fallback fängt → kein Regression |
| Preclip-Render für Pass, der später G.3-Hardfailt | Gering | **Reihenfolge entscheidend**: Pre-Fanout-Block muss NACH G.1-G.3 sitzen, also nur über Passes laufen, deren Identity bereits aufgelöst ist |
| Verschwendete Lambda-Kosten bei Early-Abort | Niedrig | Preclip-Kosten ~$0.01-0.02/Stück, vernachlässigbar |

### Rollback
Env-Var `FEATURE_PRECLIP_PREFANOUT=false` → Block übersprungen, sofort wirksam.

---

## Schritt 3 — Transient-Retry-Delay 8 s → 2 s

### Wo & Wie
- **File**: `supabase/functions/compose-dialog-segments/index.ts` Z. **2615**: `await new Promise((r) => setTimeout(r, 8_000));`
- **Change**: `8_000` → `2_000`.

### Wirkung
Nur aktiv bei transient-failing Audio-Preflight (Storage flaky beim Audio-Fetch).
- **Normal Run**: 0 s Ersparnis (Code-Pfad nicht erreicht).
- **Bei Hiccup**: **6 s** pro betroffenem Pass.
- Microoptimierung, mitgenommen.

### Was schiefgehen könnte
| Risiko | Wahrsch. | Mitigation |
|---|---|---|
| Storage noch nicht propagiert nach 2 s | Gering | Self-Retry läuft nur **einmal** pro Pass-Dispatch, nicht endlos. Bei Folge-Fail greift Hard-Fail-Pfad mit Refund |
| Hot-Loop | Sehr gering | Kein Loop-Konstrukt — single shot |

### Rollback
Eine Zahl im Code zurück.

---

## Gesamtergebnis bei N=4

| Stufe | Laufzeit N=4 | Ersparnis ggü. heute |
|---|---|---|
| Heute (Baseline) | **13:30** | — |
| + Schritt 1 (cap=3 via DB) | **~9:00** | -4:30 |
| + Schritt 1 + 2 (Pre-Fanout) | **~7:00-7:30** | -6:00 |
| + Schritt 1 + 2 + 3 | **~7:00-7:30** | -6:00 (Schritt 3 nur bei Hiccups sichtbar) |

Für N=3 (deine zweithäufigste Szene) bringt allein Schritt 1 schon ~5 → ~8-10 min.

## Bonusoption (zur Diskussion, nicht im Plan)
`concurrencyCap = 4` wäre möglich (Code clampt bis 4), würde bei N=4 alle Passes simultan dispatchen → Endzeit ~5:30-6:00 min. **Aber**: `SYNCSO_DEFAULT_MAX_PARALLEL = 3` ist der dokumentierte Sync.so-Soft-Cap. 4 parallele Dispatches haben echtes 429-Risiko. **Empfehlung: erst nach grünem cap=3-Lauf evaluieren.** Bei Bedarf später hochziehen.

## Deploy-Reihenfolge

1. **Schritt 1** zuerst (größter Hebel, null Code-Risiko): nur DB-Upsert. Test-Szene N=4 fahren. Log muss zeigen: `v139_fanout_active cap=3 fanout_size=3 N_passes=4`. Bei Problemen: DB-Wert auf 2 zurück.
2. **Schritt 3** danach (trivialer Code-Edit, Microgain).
3. **Schritt 2** zuletzt (größte Code-Änderung, hinter Env-Flag): manuell N=4-Test, dann Flag aktivieren.

Bei jedem Schritt: Rollback ist **eine Aktion** (DB-Wert, Env-Var, Zahl-Revert).

## Frozen Invariants — alle unangetastet
✅ `sync-3` bleibt einziges Modell · ✅ `bbox-url-pro` bleibt einzige ASD-Variante · ✅ characterId-Bridge (G.1) bleibt · ✅ Hard-Fail-Guard (G.3) bleibt · ✅ Per-Scene-Lock (B) bleibt · ✅ Keine Silent-Overlays · ✅ Ein Preclip pro Pass (wir rendern sie nur **parallel zueinander**, nicht **mehrere pro Pass**)

## Was wir NICHT anfassen
Sanitizer (Z. 236), v106 Doc-Strict Options, `sync-so-webhook`, `render-sync-segments-audio-mux`, `lipsync-watchdog`, `compose-twoshot-audio`, Lambda-Config (RAM/timeout/framesPerLambda), Schema-Migrationen.

## Frage
Soll ich in der Reihenfolge **1 → 3 → 2** mit Test-Pause zwischen den Schritten umsetzen?
