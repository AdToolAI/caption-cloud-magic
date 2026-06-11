
## Root-Cause-Analyse

**Was beim User passiert ist** (Scene `07185a89…`, 4-Sprecher Dialog):

1. ~17:00 — Erster `compose-dialog-segments` Dispatch wurde aufgerufen. Er hat den Scene-State auf `lip_sync_status=pending, twoshot_stage=master_clip` gesetzt UND `dialog_shots={version:5}` geschrieben, ist dann aber **vor dem ersten Sync.so-Submit gecrashed** (uncaught throw — wahrscheinlich in der v99 bbox-Computation, face-map resolve, oder Plate-Identity-Resolution; das passierte ausserhalb eines try/catch, weshalb nichts in `syncso_dispatch_log` landete und keine sichtbare Error-Zeile im Edge-Log).
2. 17:07:01 — `lipsync-watchdog` läuft, sieht: scene älter als `STALE_PREFLIGHT_MS` (4 min), `dialog_shots` ohne `job_id` und `syncso_dispatch_log` leer → ruft `failLipSync` mit `reason=watchdog_preflight_aborted` auf, refundet Credits, setzt `dialog_shots={status:"failed", error:"watchdog_preflight_aborted", refunded:true}`.
3. 17:07:27+ — Der Auto-Trigger im UI ruft alle ~30 s weiter `compose-dialog-segments` auf. Die `isStaleFailedState`-Guard (Z. 583-600) sieht `existingStatus="failed"` und returnt **409 `reset_required`** — kein Recovery passiert.
4. Der User sieht den roten "Fehler / Lip-Sync abgebrochen"-Banner und muss manuell "Sauber neu starten" klicken (`reset-lipsync-scene`).

DB-Beweis: 6 `syncso_dispatch_log`-Zeilen, alle mit `sync_status=DISPATCH_ATTEMPT_STARTED` und Meta `existing_state_status="failed", existing_state_version: 5` — d.h. der allererste Crash hatte noch nicht mal in `syncso_dispatch_log` geloggt; nur die nachfolgenden geblockten Versuche tauchen dort auf.

---

## Fix in zwei Schichten

### Schicht A — Self-Healing in `compose-dialog-segments`

In Z. 583-600 (`isStaleFailedState` Branch) statt 409 `reset_required` zu returnen:

```text
WENN existing.status === "failed"
  UND existing.refunded === true               (watchdog hat sauber refundet)
  UND existing.version === 5                   (v5 sync-segments State)
  UND KEINE active passes (passes[*].status ∉ {rendering, queued})
  UND request ist `auto` (Auto-Trigger, kein manueller Klick)
→
  1. Lösche dialog_shots aus composer_scenes (= das was reset-lipsync-scene auch tut)
  2. Setze lip_sync_status='pending', clip_error=null
  3. Continue mit dem Dispatch-Flow als wäre es ein frischer Start
  4. Log: "auto-reset-stale-failed scene=… prev_error=…"
```

Resultat: Der nächste Auto-Tick (alle 30 s) heilt sich selbst, der User muss den Reset-Button nicht mehr klicken. Manuelle Aufrufe (`auto !== true`) bleiben unverändert geblockt, damit der User weiterhin den "Sauber neu starten"-Button als bewusste Eskalation hat.

### Schicht B — Crash-Safe Envelope (verhindert die Klasse "preflight aborted" komplett)

Das ganze Dispatch-Body von `compose-dialog-segments` (ab dem Punkt wo `lip_sync_status=pending` gesetzt wird, bis zum ersten erfolgreichen Sync.so-Submit oder einem expliziten Return) wird in einen `try/catch` gewrapped:

```text
try { ... existing dispatch logic ... }
catch (e) {
  console.error(`[compose-dialog-segments] dispatch_crash scene=${sceneId} err=${e.message}\n${e.stack}`)
  // Stelle sicher dass syncso_dispatch_log eine Crash-Zeile bekommt
  await logSyncDispatch({ sceneId, sync_status: "DISPATCH_CRASH",
                          error_class: "dispatch_crash", error_message: e.message })
  // Sofort sauberer Failure-State + Refund (damit nicht 4 min auf watchdog gewartet wird)
  await failLipSync({ supabase, sceneId, userId, reason: `dispatch_crash: ${e.message}`,
                      refundCredits: 0, /* nothing charged yet — TTS was per-character */ })
  return json({ error: "dispatch_crash", message: e.message }, 500)
}
```

Effekt: Ein zukünftiger Crash erzeugt sofort einen sauberen `dialog_shots={status:"failed", refunded:true}` State (statt 4 min Phantom-`pending`), und Schicht A auto-heilt beim nächsten Auto-Tick — d.h. der User merkt im Idealfall einen kurzen "Retrying"-Flash statt einem 6-Min-Totalausfall.

### Schicht C — Sofort-Aktion für die aktuelle Szene

Da der Auto-Reset erst nach Deploy aktiv wird und der User die Szene jetzt sauber haben will: zusätzlich ein einmaliges SQL-Update als Teil der Migration (idempotent):

```sql
update composer_scenes
   set dialog_shots = null,
       lip_sync_status = 'pending',
       clip_error = null,
       updated_at = now()
 where id = '07185a89-6540-4d49-ab91-69e4e554d182'
   and dialog_shots->>'status' = 'failed'
   and dialog_shots->>'error' = 'watchdog_preflight_aborted';
```

Dann startet der bestehende Auto-Trigger im UI den frischen v99-Dispatch innerhalb von 30 s.

---

## Was NICHT geändert wird

- `STALE_PREFLIGHT_MS` (4 min) im Watchdog bleibt — er ist die letzte Sicherheitslinie für echte Hänger.
- v99 bbox-Logik, face-map, plate-identity bleibt unverändert. Falls Schicht B den nächsten Crash fängt, sehen wir im Log endlich den echten Stack-Trace und können dann gezielt fixen.
- Manueller "Sauber neu starten"-Button bleibt als Eskalationspfad.
- FROZEN-Invariants I.1–I.13 unverändert.

---

## Files

- `supabase/functions/compose-dialog-segments/index.ts` — `isStaleFailedState`-Branch (Z. 583-600) um Auto-Reset-Pfad erweitern; gesamtes Dispatch-Body in `try/catch` wrappen.
- Migration für das einmalige SQL-Update der betroffenen Szene.
- Memory-Update: `mem://architecture/lipsync/auto-reset-stale-failed.md` (neue Datei) + Index-Eintrag.

## Verifikation

1. Nach Deploy: betroffene Szene ist sauber, Auto-Trigger startet frischen v99-Dispatch, Lip-Sync läuft in ~7:30 min wieder durch.
2. Falls v99 erneut crasht: neuer `[compose-dialog-segments] dispatch_crash scene=… err=…` Log mit Stack-Trace → echte Root-Cause-Investigation auf Basis konkretem Error.
3. Kein 4-Min-Phantom-`pending` mehr; kein roter "Fehler"-Banner für transiente Dispatch-Crashes.
