
# Tiefenanalyse abgeschlossen — kritische Funde

Der Subagent hat zwei **fundamentale Probleme** identifiziert, die meinen letzten Plan invalidieren. Bevor wir irgendetwas anfassen, hier die Wahrheit:

## ❌ Pfad C ist heute funktional TOT

**Code-Beleg:** `compose-dialog-segments/index.ts` Z. 3200–3218 (v153-Block) **nullifiziert `preclip_url` / `preclip_crop` / `preclip_render_id` bei jedem Advance-Call bedingungslos**, sobald eine plate box existiert (= Normalzustand).

Konsequenz: Der v167-Pre-Fanout würde 3× Lambda (~90-120s pro Render) im Hintergrund rendern, der v153-Block würfe die Ergebnisse 300ms später weg, und v161-Lazy-Render würde alles neu rendern.

**Netto-Speedup: 0. Netto-Kosten: 3 verschwendete Lambda-Renders pro N=4-Run.**

→ `FEATURE_PRECLIP_PREFANOUT=true` jetzt zu setzen wäre **schädlich**. Wir lassen es AUS.

## ✅ Pfad B ist der richtige Hebel — aber tiefer als gedacht

Die Wurzel der Serialisierung ist **bestätigt**: `dialog_dispatch_locks` hat `scene_id UUID PRIMARY KEY`. Pass 0 hält 90s-Lock → Fanout-Self-Invokes für Pass 1/2 (250ms/500ms delayed) treffen auf BUSY → return 202 → fallen still auf serielle Webhook-Chain zurück. Genau das erklärt das beobachtete Pattern "nur 2 von 4 wirklich parallel".

**ABER:** Es gibt einen **zweiten Lost-Update-Vektor**, den ich vorher nicht gesehen hatte:

`compose-dialog-segments/index.ts` Z. 5667–5691 macht nach jedem Sync.so-Submit einen **Full-Row-UPDATE** auf `composer_scenes` mit kompletter `dialog_shots: mergedState` JSONB. Bei 4 parallelen Passes: jeder liest fresh state, merged seinen Slot, schreibt zurück. **Letzter Schreiber überschreibt Job-IDs der anderen.**

Per-Pass-Lock alleine reicht also **nicht** — wir müssen gleichzeitig diesen Full-JSONB-Write auf die atomare RPC `update_dialog_pass_slot` migrieren (was Frozen-Invariant I.9 ohnehin verlangt).

# Sauberster Implementierungspfad — 4 Phasen mit Validation-Gates

Reihenfolge ist nicht verhandelbar. Jede Phase wird einzeln deployed + an einer N=2 Test-Szene validiert bevor die nächste kommt. Bei jedem unerwarteten Log → Stop & Diagnose.

## Phase 0 — Diagnostik-Probe (1 Action, KEIN Code-Change)

Setze testweise `composer.sync_so_concurrency_cap = 4` (statt 3) in DB. Lasse N=4-Run.

**Ziel:** Bestätigen dass die Serialisierung wirklich am Scene-Lock liegt (und nicht z.B. an Edge-Runtime `setTimeout`-Verhalten). Erwartung: Logs zeigen 3 Fanout-Self-Invokes, davon werden 2-3 mit `scene_lock_busy` 202 abgewiesen.

**Risiko:** Null. cap=4 ändert nichts wenn der Lock blockt — Verhalten identisch zu cap=3 heute.

**Rollback:** DB-Update auf 3 zurück.

## Phase 1 — Full-JSONB-Write → atomare RPC (Code-Hygiene, KEIN Locking-Change)

`compose-dialog-segments/index.ts` Z. 5667-5691 umbauen:
- `dialog_shots: mergedState` → `update_dialog_pass_slot` RPC pro Slot
- Top-Level-Felder (`lip_sync_status`, `twoshot_stage`, `replicate_prediction_id`, `clip_error`, `lip_sync_source_clip_url`) bleiben als separates UPDATE — diese werden noch von cap-1 Pass exklusiv geschrieben weil Scene-Lock noch da ist

**Validation:** N=2-Run, Logs zeigen `update_dialog_pass_slot pass_idx=0` und `pass_idx=1` als separate Writes. End-to-end-Zeit identisch zu heute (keine Speedup-Erwartung).

**Risiko:** mittel-niedrig. Wenn das RPC die nötigen Felder nicht alle setzen kann → fail-fast vor dem ersten Sync.so-Submit. Vorher: RPC-Definition prüfen + ggf. erweitern.

**Rollback:** Code-Revert (1 Block, ~25 Zeilen).

## Phase 2 — Schema-Migration: `dialog_dispatch_locks` per-pass

```sql
ALTER TABLE dialog_dispatch_locks ADD COLUMN pass_idx INT NOT NULL DEFAULT -1;
ALTER TABLE dialog_dispatch_locks DROP CONSTRAINT dialog_dispatch_locks_pkey;
ALTER TABLE dialog_dispatch_locks ADD PRIMARY KEY (scene_id, pass_idx);
```

Plus RPCs `try_acquire_dialog_lock` und `release_dialog_lock` um `_pass_idx INT DEFAULT -1` Parameter erweitern. Backward-compat: `pass_idx=-1` = scene-level (für Watchdog).

**Code-Stellen:** 5 (alle in Bericht §B-7 dokumentiert):
- `compose-dialog-segments/index.ts:667` → `pass_idx=currentPassIdx`, TTL 90s→30s
- `compose-dialog-segments/index.ts:5972` → release mit pass_idx
- `_shared/dialog-lock.ts` Z. 24-87 → `withDialogLock(sceneId, passIdx, ...)` Signatur
- `lipsync-watchdog/index.ts:224` → `withDialogLock(sceneId, -1, ...)` (scene-level Convention)
- DB-Migration siehe oben

**Validation:** N=2-Run zuerst — Logs zeigen Pass 0 und Pass 1 acquiren **getrennte Locks**, beide Dispatchen parallel. Erwartung: N=2 fällt von ~7 min auf ~5 min. Dann N=4-Run.

**Risiko:** hoch-mittel. Wenn die RPC-Signatur-Änderung nicht atomar mit dem Code-Deploy ankommt → fail-open (Z. 670-671: "proceeding without lock") → mögliche kurze Race-Window. Mitigation: Migration ZUERST deployen, dann Code-Deploy in dem die neue Signatur aufgerufen wird.

**Frozen-Invariant I.9 wird geändert** — laut Doku-Bericht ist das legitim solange Lock-RPC atomic + per-slot writes via `update_dialog_pass_slot` (Phase 1) + `try_claim_mux_dispatch` für Mux (unverändert).

**Rollback:** Schema-Migration zurück (PK auf scene_id, Column droppen), Code-Revert. Sauber wenn Phase 1 sauber war.

## Phase 3 — Re-Test C nur falls nötig

**Bedingung:** Nach Phase 2 mit cap=4 sollten **alle 4 Passes wirklich parallel** dispatchen. Wenn das den N=4-Wallclock auf ~5-6 min bringt, brauchen wir Pfad C nicht mehr (er wäre dann eine Mikro-Optimierung an der falschen Stelle).

Wenn doch nötig: v153-Block (Z. 3200-3218) so patchen dass er pre-gecachte preclips respektiert:
```ts
const alreadyCached = !!(pass as any).preclip_url && !!(pass as any).preclip_crop
  && !!(pass as any).preclip_frame_count;
if (v153UnifiedBboxEligible && !alreadyCached) {
  (pass as any).preclip_url = null;
  // ...
}
(pass as any)._v153BboxPrimary = true;
```

Erst **dann** `FEATURE_PRECLIP_PREFANOUT=true`.

# Erwartete Wall-Clock für N=4

| Phase | Erwartung | Risiko |
|---|---|---|
| Heute | 13:30 | — |
| Nach Phase 0 (cap=4, kein Code) | 13:30 (Bestätigung dass Lock blockt) | 0 |
| Nach Phase 1 (RPC-Migration) | 13:30 (keine Speedup, nur Race-fix) | low-med |
| Nach Phase 2 (Per-Pass-Lock) | **~5:00–6:00** | **med-high** |
| Phase 3 optional | −1 bis −2 min weiter | low |

# Was diese Analyse von meinem letzten Plan ändert

1. **Pfad C wird NICHT als "1-Klick-Win" aktiviert** — er ist heute schädlich (3 wasted Lambda) und braucht erst einen v153-Patch.
2. **Pfad B braucht eine vorgeschaltete RPC-Migration (Phase 1)** — sonst Lost-Update-Race auf `dialog_shots[]`.
3. **Phase 0 (Diagnostik mit cap=4) ist neu** — bestätigt die Hypothese ohne Risiko bevor wir am Lock anfassen.
4. **Watchdog-Compat ist geklärt** — er nutzt `pass_idx=-1` Convention, kollidiert nicht mit per-pass Locks.

# Frage an dich

Soll ich mit **Phase 0** starten (DB cap=4 setzen, 1× Testrun beobachten, dann Logs interpretieren)?
Das ist null-Risiko und gibt uns harte Daten ob die Lock-Hypothese stimmt, bevor wir Migration + Code-Refactor planen.

Oder soll ich direkt Phase 1 (RPC-Migration als Code-Hygiene) als ersten echten Schritt vorbereiten?

Drittens: Ich kann auch zuerst die exakte Definition von `update_dialog_pass_slot` aus der DB ziehen und prüfen ob sie alle nötigen Felder schreibt — das wäre eine Vor-Phase-1-Sicherheit. Sag mir, wo wir anfangen.
