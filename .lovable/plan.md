
# v129.7.1 — syncso-replay Schema-Adapter Fix

## Root Cause (Hard Evidence)

`syncso-replay/index.ts` Zeile 216–219 liest:
```ts
const videoUrl: string = pass.payload_video_url ?? "";
const audioUrl: string = pass.payload_audio_url ?? "";
if (!videoUrl || !audioUrl) return json({ error: "missing_payload_urls" }, 400);
```

**Aber** die aktuellen `dialog_shots.passes[]` schreiben diese URLs unter anderen Keys (verifiziert direkt am Pass-0 von Scene `85e38890…`):

| Code erwartet | Pass hat tatsächlich |
|---|---|
| `pass.payload_video_url` | `pass.input_url` *(und* `pass._v105_probe.payload_video_url`*)* |
| `pass.payload_audio_url` | `pass.audio_url` *(und* `pass._v105_probe.payload_audio_url`*)* |
| `pass.payload_model ?? pass._v106_probe?.payload_model` | `pass._v102_probe.payload_model` / `pass._v105_probe.payload_model` (kein `_v106_probe`) |
| `pass.sync_mode` | `pass._v102_probe.sync_mode` / `pass._v105_probe.sync_mode` |
| `pass.provider_job_id ?? pass.job_id` | `pass.job_id` ✓ (funktioniert bereits) |

→ `videoUrl` und `audioUrl` werden leer → 400 `missing_payload_urls` → UI zeigt "Edge Function returned a non-2xx status code".

Das ist ein **reiner Reader-Mismatch in v129.5**, keine Pipeline-Regression — und kein Beweis gegen die sync_mode-Hypothese, der Replay konnte sie noch gar nicht testen.

## Fix (rein additive Fallback-Kette in `syncso-replay`)

In `supabase/functions/syncso-replay/index.ts`:

1. **Asset-URL-Resolver** (Zeile 216–217) erweitern:
   ```ts
   const videoUrl = pass.payload_video_url
     ?? pass._v105_probe?.payload_video_url
     ?? pass.input_url
     ?? "";
   const audioUrl = pass.payload_audio_url
     ?? pass._v105_probe?.payload_audio_url
     ?? pass.audio_url
     ?? "";
   ```

2. **Model-Resolver** (Zeile 233–234) erweitern:
   ```ts
   let model: string =
     pass.payload_model
     ?? pass._v106_probe?.payload_model
     ?? pass._v105_probe?.payload_model
     ?? pass._v102_probe?.payload_model
     ?? "sync-3";
   ```

3. **sync_mode-Resolver** (Zeile 251) erweitern:
   ```ts
   let sm = pass.sync_mode
     ?? pass._v105_probe?.sync_mode
     ?? pass._v102_probe?.sync_mode
     ?? "cut_off";
   ```

4. **Bessere Fehler-Diagnose** für künftige Mismatches: bei `missing_payload_urls` zusätzlich `available_keys: Object.keys(pass)` in der 400-Response zurückgeben.

## Akzeptanzkriterien

1. Replay mit Preset `omit_sync_mode` auf Scene `85e38890…` Pass 0 läuft durch (kein 400 mehr).
2. `syncso_replay_log` zeigt eine neue Zeile mit `override_preset='omit_sync_mode'`, `provider_status='dispatching'`, `sent_payload_json.model='sync-3'`, `sent_payload_json.options` enthält **kein** `sync_mode` aber `active_speaker_detection`.
3. Webhook (`syncso-replay-webhook`) aktualisiert die Zeile innerhalb 60–90s auf `succeeded`/`failed` mit echtem Sync.so-Result → erst dann ist die sync_mode-Hypothese ent-/bestätigt.

## Explizit NICHT in Scope
- Keine Änderung an Live-Dispatch (`compose-dialog-scene`, `poll-dialog-shots`)
- Keine DB-Migration
- Kein Strip von `sync_mode` in Produktion (das wäre v129.8, abhängig vom Replay-Outcome)
- Kein Face-Probe-Fix (separates Ticket)

## Files
- `supabase/functions/syncso-replay/index.ts` — 3 kleine Resolver-Patches + 1 Error-Detail-Ergänzung
