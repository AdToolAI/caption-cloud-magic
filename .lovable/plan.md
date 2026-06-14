
# v118 — Sync.so Preclip Silent-Loop Fix

## Was wirklich passiert (4-Personen-Szene `4fb6b816…`)
Die UI zeigt seit ~10 min „Lip-Sync läuft 95%" — sie läuft NICHT, sie hängt in einer stillen Endlosschleife.

DB-Beweis (`syncso_dispatch_log`, Pass 2 / Kailee, letzte 3 Versuche):
```
retry_variant    | active_speaker_detection                                           | result
coords-pro       | {auto_detect:false, coordinates:[360,360], frame_number:0}        | FAILED provider_unknown_error
coords-pro       | {auto_detect:false, coordinates:[360,360], frame_number:0}        | FAILED provider_unknown_error
coords-pro-box   | {auto_detect:false, coordinates:[360,360], frame_number:0}        | FAILED provider_unknown_error
```

Jeder Pass schickt **identische** Payload an Sync.so → identischer Fehler → Endlosretry.

## Root Cause (compose-dialog-segments/index.ts, Zeilen 2846–2891)
Die v115-Preclip-Branch läuft VOR der `retry_variant`-elseif-Kette (Zeile 2929 ff.). Wenn `usePassPreclip === true`:

1. **`passFaceCount === 1`** (Preclip-Face-Gate hat genau 1 Gesicht bestätigt) → `auto_detect: true` ✅
2. **`passFaceCount !== 1`** (0 oder >1 Gesichter) → Hardcoded Fallback:
   ```ts
   coordinates: [outSize/2, outSize/2]  // [360, 360] auf 720er Preclip
   ```
   Sync.so akzeptiert (HTTP 201), pollt das Video, findet kein Gesicht am Center-Point → `provider_unknown_error`. Der `retry_variant` Wert wird in dieser Branch **ignoriert**, weil das if/elseif ab 2929 nie erreicht wird.

Zusätzlich: **kein Circuit-Breaker** auf Pass-Ebene. `total_passes=4`, jeder Pass darf unbegrenzt retryen. Webhook re-invokes dispatcher, dispatcher schickt erneut identische Payload, Schleife läuft bis User abbricht. Kein Refund, kein `clip_status='failed'`.

## Fix-Plan (alles innerhalb v60 serial-chain, sync-3, ohne Schema-Wechsel)

### Fix A — Preclip-Branch nur bei verifiziertem Single-Face nehmen
`compose-dialog-segments/index.ts` ~2846:
- Wenn `usePassPreclip && passFaceCount === 1` → wie bisher: `auto_detect: true` ✅
- Wenn `usePassPreclip && passFaceCount !== 1` → **NICHT** mehr Center-Fallback. Stattdessen `usePassPreclip = false` für diesen Pass setzen und in die **Full-Plate `bbox-url-pro` Branch** fallen (Zeilen 2941+). Die nutzt echte Plate-Pixel-Box aus `faceMap` per `bounding_boxes_url` — Sync.so kann darauf zuverlässig das Gesicht finden.
- Plate-URL ist bereits in Scope (`videoUrl` ≠ `preclipUrl`), kein zusätzlicher Render nötig.
- Diagnose-Log: `asd_mode='preclip_facegate_failed_routed_to_bbox_url_pro'` + `preclip_face_count`.

### Fix B — `retry_variant` muss im Preclip-Pfad wirken
Wenn der Webhook nach einem ersten Preclip-Fail einen `retry_variant` (z.B. `coords-pro-lp2pro`, `auto-pro`) setzt:
- Im `usePassPreclip`-Zweig **vorher prüfen**: `if (retryVariant && retryVariant !== "preclip-default") { usePassPreclip = false; /* fall through to retry-variant chain */ }`.
- Damit eskaliert die Ladder (v84) auch bei Preclip-Szenen wie dokumentiert (`bbox-url-pro` → `coords-pro` → `coords-pro-box` → `coords-pro-lp2pro` → `auto-pro` → `auto-standard`).

### Fix C — Pass-Level Circuit-Breaker (Endlosschleife stoppen)
Neuer harter Cap pro `(scene_id, pass_idx)`: **max. 5 FAILED-Dispatches** in `syncso_dispatch_log`. Implementierung in `compose-dialog-segments/index.ts` direkt nach dem Lock-Acquire:

```ts
const { count: passFailCount } = await supabase
  .from("syncso_dispatch_log")
  .select("id", { count: "exact", head: true })
  .eq("scene_id", sceneId)
  .eq("meta->>pass_idx", String(currentPassIdx + 1))
  .eq("sync_status", "FAILED");

if ((passFailCount ?? 0) >= 5) {
  await refundOnceForScene(sceneId, userId, totalCost, "v118_pass_circuit_breaker");
  await supabase.from("composer_scenes").update({
    clip_status: "failed",
    clip_error: `lipsync_exhausted_pass_${currentPassIdx + 1}_speaker_${pass.speaker_name}`,
  }).eq("id", sceneId);
  await logDispatch({ sync_status: "CIRCUIT_BREAKER_OPEN", error_class: "v118_pass_circuit_breaker", ... });
  releaseLock();
  return json({ error: "v118_pass_circuit_breaker", refunded: totalCost }, 422);
}
```

Refund ist idempotent (existierende `refundOnceForScene` Helper). Gilt **vor** jedem neuen Sync.so-Call → keine weiteren Kosten.

### Fix D — Globaler Szene-Watchdog (Belt & Braces)
Neue `pg_cron` Job alle 2 min (oder vorhandenen `qa-watchdog` erweitern):
```sql
UPDATE composer_scenes
SET clip_status='failed', clip_error='watchdog_lipsync_stuck_15min'
WHERE dialog_mode=true
  AND clip_status IN ('processing','dispatching')
  AND updated_at < NOW() - INTERVAL '15 minutes';
```
+ einmaliger Refund-Trigger via vorhandenem `refund-stuck-lipsync-scenes` Edge-Hook (falls existiert; sonst inline). Damit kann eine festhängende Szene niemals länger als 15 min stehen.

### Fix E — UI surface
`useTwoShotAutoTrigger` / Lipsync-Tab zeigt schon `clip_error` an. Mit Fix C/D wird `clip_status='failed'` gesetzt → bestehende Toast/Banner-Logik triggert automatisch. Zusätzlich Reset-Button (`useResetLipSync`) bleibt verfügbar.

## Was NICHT geändert wird
- v60 serial chain, sync-3 model, v115 single-face `auto_detect:true`, v82 `bbox-url-pro` Ladder, v106 doc-strict options, v116/v117 Plate-Quality-Gate.
- Sync.so Optionen-Format, Webhook-Chain, Pricing, Refund-Helper.

## Erwartetes Ergebnis
1. Szene `4fb6b816…` resetten → Pass 2 (Kailee) führt nicht mehr in Center-Fallback. Stattdessen `bbox-url-pro` auf der Original-Plate mit echten Kailee-Koordinaten aus `faceMap` → Sync.so liefert sauberen Lipsync.
2. Falls Sync.so trotzdem 5× failt → Circuit-Breaker → Refund + sichtbarer Fehler im UI nach ~75 s statt 10+ min.
3. Watchdog garantiert: keine Szene bleibt jemals > 15 min in `processing`.

## Verifizierung
1. Scene reset, Edge-Logs zeigen `asd_mode=preclip_facegate_failed_routed_to_bbox_url_pro` für Kailee.
2. `syncso_dispatch_log` neue Zeile mit `bbox-url-pro`, Payload enthält `bounding_boxes_url`, ASD-Coords sind nicht mehr `[360,360]`.
3. Künstlicher 5-Fail-Test → `clip_status='failed'`, Wallet-Balance zurück.
4. 1-/2-/3-Sprecher Regression unverändert (Preclip-Pfad bleibt für `passFaceCount === 1`).

## Betroffene Dateien
- `supabase/functions/compose-dialog-segments/index.ts` (Zeilen ~2846–2891 + neuer Circuit-Breaker-Block früh).
- `supabase/migrations/<ts>_lipsync_watchdog.sql` — pg_cron Job.
- `mem/architecture/lipsync/v118-preclip-loop-breaker-and-circuit.md` + `mem/index.md`.

## Rollback
- Fix A/B: eine Zeile zurück (`if (usePassPreclip)` ohne retry_variant Guard).
- Fix C: Cap auf 999 stellen ⇒ effektiv aus.
- Fix D: `DROP` des cron Jobs.

