# v149 — Composer Master-Clip Watchdog & Replicate-Repoll

## Problem

Szene `3c145fef` hängt bei „Szene wird gebaut…" weil:
- Cinematic-Sync hat um 20:03:40 die Hailuo-i2v-Plate (Prediction `3e9vek5z2drmr0cywtgtrw9br8`) korrekt mit 4-Cast Anker dispatched.
- Replicate-Webhook `compose-clip-webhook` ist **nie** eingegangen (0 Logs für scene_id / prediction_id).
- Ergebnis: `clip_status='generating'` + `twoshot_stage='master_clip'` + `clip_url=NULL` für unbegrenzte Zeit.
- Lipsync konnte nicht greifen — die Plate war nie fertig, also nichts zum Synchen.

`qa-watchdog` (alle 2 min via pg_cron) überwacht aktuell nur **Stufe 2** (`lip_sync_status='running'` >10 min). **Stufe 1** (Hailuo/HappyHorse Master-Plate Generation) ist nicht gecovert → kein Auto-Refund, kein Auto-Fail, kein Repoll.

## Lösung

Zwei kleine, fokussierte Änderungen — kein Eingriff in den heilen Sync.so-Flow, keine Logikänderung am Lipsync-Watchdog.

### A) Neue Edge Function `recover-stuck-composer-clip`

Dünner Recovery-Worker, vom Watchdog (und manuell vom Admin) aufrufbar.

**Input:** `{ scene_ids: string[] }`

**Pro Scene:**
1. Lade `composer_scenes` Row (id, replicate_prediction_id, project_id, cost_euros, clip_status, updated_at, engine_override).
2. Wenn keine `replicate_prediction_id` → mark `clip_status='failed'`, `clip_error='watchdog_no_prediction_id'`, voller Refund, continue.
3. GET `https://api.replicate.com/v1/predictions/{id}` mit `REPLICATE_API_TOKEN`.
4. Switch auf `prediction.status`:
   - **`succeeded`** → `output` URL ist da. **Re-trigger** `compose-clip-webhook` per `fetch()` mit dem identischen Replicate-Payload (Idempotenz ist bereits gegeben). Log: `v149_webhook_replayed`.
   - **`failed` / `canceled`** → mark `clip_status='failed'`, `clip_error='replicate_${status}: ${prediction.error ?? "unknown"}'`, voller Refund (cost_euros aus Scene-Row → wallet). Log: `v149_clip_failed_refunded`.
   - **`processing` / `starting`** → wenn Alter >30 min: hard-kill (`failed` + Refund), sonst nur Heartbeat-Log (`v149_clip_still_processing age=Xmin`). Replicate selbst killt nach 60 min.

**Refund-Idempotenz:** prüfe `clip_error LIKE 'watchdog_%'` bevor refunded wird (verhindert Doppel-Refund bei Watchdog-Reruns).

### B) `qa-watchdog/index.ts` — neuer Block „4b. Stale composer master-clip"

Direkt nach dem bestehenden Lipsync-Block (Zeile ~226):

```ts
// ─── 4b. Stale composer master-clip (>10min generating, no webhook) ───
const { data: stuckClips } = await sb
  .from("composer_scenes")
  .select("id, project_id, replicate_prediction_id, updated_at, engine_override, clip_source")
  .eq("clip_status", "generating")
  .is("clip_url", null)
  .lt("updated_at", tenMinAgo)
  .limit(50);

if (stuckClips?.length) {
  // Dispatch to recovery worker (fire-and-forget via service-role invoke).
  await sb.functions.invoke("recover-stuck-composer-clip", {
    body: { scene_ids: stuckClips.map(s => s.id) },
  });
  anomalies.push({
    kind: "workflow",
    severity: "high",
    title: `Watchdog: ${stuckClips.length} composer master-clips stuck >10min`,
    description: stuckClips
      .map(s => `- ${s.id} engine=${s.engine_override ?? "none"} src=${s.clip_source} pred=${s.replicate_prediction_id ?? "null"} updated=${s.updated_at}`)
      .join("\n"),
    fingerprint: "composer-clip-stale",
  });
}
```

Damit läuft die Recovery **alle 2 min** automatisch.

### C) Sofort-Recovery für die aktuelle hängende Szene

Nach Deploy: einmaliger Direkt-Aufruf von `recover-stuck-composer-clip` mit `scene_ids: ["3c145fef-ba47-4840-8b3f-bfbc4b2cf106"]` als Smoke-Test. Erwartung: Replicate-Status wird gelesen, entweder Webhook-Replay (wenn Hailuo inzwischen fertig ist) oder Auto-Fail+Refund — Szene verlässt den "Szene wird gebaut…" Zustand.

### D) Memory

Neue Datei `mem/architecture/video-composer/v149-master-clip-watchdog.md` mit:
- Trigger (Replicate-Webhook-Drop bei Hailuo-Plates)
- 10 min Threshold, 30 min Hard-Kill
- Refund-Idempotenz über `clip_error LIKE 'watchdog_%'`

Eintrag in `mem/index.md` unter "Memories".

## Was NICHT geändert wird

- `compose-video-clips` Dispatch-Logik (Webhook-URL, HappyHorse→Hailuo Migration, Anker-Pinning) — alles korrekt.
- `compose-clip-webhook` Idempotenz — bereits gegeben, Replay ist safe.
- `qa-watchdog` Lipsync-Block (Stufe 2) — unverändert.
- v147/v148 Lipsync-Logik — unverändert.
- Wallet/Credit-Pfade — Refund nutzt denselben Pfad wie Lipsync-Watchdog.

## Validation

1. Aktuelle Scene `3c145fef` muss innerhalb ~2 min nach Deploy entweder `ready` (mit clip_url) oder `failed` (mit Refund) sein.
2. Logs zeigen `v149_webhook_replayed` oder `v149_clip_failed_refunded`.
3. Watchdog-Anomalie `composer-clip-stale` erscheint im QA-Cockpit.
4. Zukünftige gedroppte Hailuo-Webhooks werden automatisch innerhalb von 10–12 min recovered statt unendlich zu hängen.

## Dateien

- **neu:** `supabase/functions/recover-stuck-composer-clip/index.ts`
- **edit:** `supabase/functions/qa-watchdog/index.ts` (neuer Block 4b)
- **neu:** `mem/architecture/video-composer/v149-master-clip-watchdog.md`
- **edit:** `mem/index.md`
