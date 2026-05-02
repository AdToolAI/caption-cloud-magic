## Problem

Im Video Composer hängen alle HappyHorse-Szenen dauerhaft auf "Wird generiert…", obwohl Replicate die Clips längst fertig hat. In der DB sind die 6 Szenen seit 18:24 Uhr unverändert auf `clip_status='generating'` mit gesetzter `replicate_prediction_id`, aber ohne `clip_url`.

## Ursache

Alle anderen 10 Composer-Provider (Hailuo, Kling, Wan, Seedance, Luma, Veo, Runway, Pika, Vidu, Image) rufen Replicate **direkt** in `compose-video-clips` auf und registrieren dabei den Composer-spezifischen Callback:

```
webhook: ${SUPABASE_URL}/functions/v1/compose-clip-webhook?scene_id=...&project_id=...
```

`compose-clip-webhook` ist die einzige Funktion, die `composer_scenes.clip_status` und `clip_url` updated.

**HappyHorse ist die Ausnahme**: `compose-video-clips` ruft den Toolkit-Endpoint `generate-happyhorse-video` als HTTP-Proxy auf. Diese Toolkit-Funktion startet zwar einen Background-Task (`rehostAndPersist`), schreibt aber ausschließlich in die `generations`-Tabelle (für das Standalone-Toolkit) — sie kennt `composer_scenes` nicht und registriert auch keinen Composer-Webhook bei Replicate. Resultat: Replicate ist fertig, niemand updated die Szene.

## Lösung

`compose-video-clips` so umbauen, dass HappyHorse genauso behandelt wird wie alle anderen Provider — direkter Replicate-Aufruf mit `compose-clip-webhook` als Callback, kein Umweg über die Toolkit-Funktion.

### Änderungen

1. **`supabase/functions/compose-video-clips/index.ts`** — HappyHorse-Block (Zeilen 830–877) ersetzen:
   - Direkter `fetch` an `https://api.replicate.com/v1/predictions` mit `version: "alibaba/happyhorse-1.0"` (oder das vom Toolkit verwendete Model-Slug; aus `generate-happyhorse-video/index.ts` übernehmen).
   - Input-Mapping wie im Toolkit: `prompt`, `duration`, `aspect_ratio`, `resolution` (720p für standard, 1080p für pro), optional `image` für I2V.
   - `webhook: ${webhookUrl}?scene_id=${scene.id}&project_id=${projectId}` und `webhook_events_filter: ["completed"]` mitsenden — analog zu Hailuo (Zeilen 419/420).
   - `replicate_prediction_id` in `composer_scenes` speichern.
   - Credits werden weiterhin im Standard-Composer-Flow (am Ende von `compose-video-clips`) abgerechnet — der Toolkit-Wallet-Abzug entfällt für Composer-Szenen.

2. **One-shot Recovery für die 6 hängenden Szenen** des aktuellen Projekts (`6af4eda9-…`):
   - SQL-Migration / einmaliger Job, der die 6 `replicate_prediction_id`s direkt bei Replicate abfragt und (bei `succeeded`) `clip_url` + `clip_status='ready'` setzt, bzw. bei `failed` auf `failed` mit Credit-Refund. Alternative: per Hand in der DB als `failed` markieren und der User regeneriert — günstiger und sauberer, da die 6 Predictions ggf. eh schon abgelaufen sind.
   - Empfehlung: **Refund + auf `failed` setzen**, damit der User mit dem Fix neu rendern kann.

3. **`compose-clip-webhook`** muss nichts ändern — die Funktion ist bereits provider-agnostisch und arbeitet nur über `replicate_prediction_id` + Output-URL.

### Out of Scope

- Das Standalone-HappyHorse-Toolkit (`/ai-video-toolkit?model=happyhorse-…`) bleibt unverändert. Es nutzt weiterhin `generate-happyhorse-video` mit der eigenen `generations`-Tabelle.
- Keine Änderung an Pricing/Credits-Logik — der Composer rechnet HappyHorse über `getClipCost('ai-happyhorse', quality, duration)` ab (bereits implementiert).

## Ergebnis

- Neue HappyHorse-Renders im Composer schalten innerhalb von Sekunden nach Replicate-Completion auf "ready", `clip_url` füllt sich, Polling endet automatisch.
- Die 6 aktuell hängenden Szenen werden refundiert und können neu gerendert werden.
