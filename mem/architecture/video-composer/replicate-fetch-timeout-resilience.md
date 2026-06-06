---
name: Composer Replicate Fetch-Timeout Resilience
description: Drei zusammenhängende Härtungen, die auftraten als HappyHorse-Szenen (S03 etc.) reproduzierbar mit `HTTPSConnectionPool ... Read timed out (read timeout=10)` ausfielen während Replicate die Scene-Anchor-PNG aus dem `composer-frames` Bucket lud. (1) CDN-Caching der Anchor-Uploads, (2) vollständige + synchronisierte `CLIP_COSTS` in compose-video-clips ↔ compose-clip-webhook für korrekte Refunds, (3) Auto-Retry im Webhook bei transienten Replicate-Infrastruktur-Fehlern.
type: architecture
---

## Symptom (Juni 2026)

Cinematic-Sync HappyHorse-Szene S03 schlug sofort fehl:

```
[compose-clip-webhook] Clip failed: HTTPSConnectionPool(host='lbunafpxuskwmsrraqxl.supabase.co', port=443): Read timed out. (read timeout=10)
[compose-clip-webhook] Refunded €1.05 (ai-happyhorse/standard)
```

Drei Bugs in einem Vorfall.

## Bug 1 — Origin-Roundtrip auf Reference-Image

`composer-frames` Bucket lieferte die 1.79 MB Scene-Anchor-PNG mit
`cache-control: no-cache` + `cf-cache-status: MISS`. Jeder Replicate-Fetch
ging zum Origin und überschritt unter Last das 10 s Read-Timeout, das
Replicate auf Input-URLs anwendet.

**Fix**: `compose-scene-anchor/index.ts` Storage-Upload mit
`cacheControl: "3600"`. Cloudflare cached die PNG am Edge → Folge-Fetches
in <100 ms. (`extract-video-last-frame` und `extract-video-frames`
verwendeten bereits cacheControl, nur Scene-Anchor war die Lücke.)

## Bug 2 — Unvollständige CLIP_COSTS

`CLIP_COSTS` in **beiden** `compose-video-clips` (initial deduct) und
`compose-clip-webhook` (refund) listete `ai-happyhorse`, `ai-vidu`,
`ai-grok`, `ai-ltx` nicht. Fallback war 0.15 €/s → HappyHorse 7s wurde
mit €1.05 statt €1.96 refunded (HappyHorse 720p = €0.28/s).

**Fix**: Beide Tabellen vervollständigt **und** explizit als
"keep in lockstep" kommentiert. Werte aus den `src/config/*VideoCredits.ts`:

| Source           | standard | pro    |
|------------------|----------|--------|
| ai-happyhorse    | 0.28     | 0.56   |
| ai-vidu          | 0.09     | 0.09   |
| ai-grok          | 0.20     | 0.20   |
| ai-ltx           | 0.08     | 0.12   |

## Bug 3 — Kein Auto-Retry bei transienten Infrastruktur-Fehlern

Ein einzelner Replicate-Read-Timeout (Bug 1) killed die Szene endgültig.
User musste manuell "Generate" klicken — schlechte UX bei klar transienten
Fehlern.

**Fix**: In `compose-clip-webhook` `failed`-Branch:

1. Klassifiziere `predError` über `isRetryableTransientError()` —
   matched Read-Timeouts, Connection-Resets, 502/504, "temporarily
   unavailable", "failed to fetch". Nicht: Content-Policy, NSFW, invalid input.
2. Wenn transient **und** `retry_count < 2`: re-dispatch denselben
   Replicate-Call mit identischem `model` + `input` + webhook URL aus dem
   Webhook-Payload, schreibe neue `replicate_prediction_id`, setze
   `clip_status='generating'` und inkrementiere `retry_count`. **Kein**
   Refund.
3. Wenn Retry-Dispatch selbst scheitert oder Limit erreicht → normaler
   Failed+Refund-Pfad (mit den jetzt korrekten CLIP_COSTS).

Replicate-Webhook-Payload enthält `model` (offizielle Modelle) oder
`version` (Community) plus `input` — beide werden bei `predictions.create`
1:1 wiederverwendet. Webhook-URL wird mit `appendWebhookToken()` neu
gebaut, damit der HMAC-Token gültig ist.

## Verifikation

- Edge-Log bei transientem Fehler: `auto-retry 1/2 for scene <id> → new pred <id>`, Szene endet als `done`.
- Echtes Content-Failure (z.B. NSFW): direkter `Refunded €1.96 (ai-happyhorse/standard)` — kein Retry-Versuch.
- HTTP-Headers für Scene-Anchor URL nach Re-Generation: `cache-control: max-age=3600`, zweiter Fetch `cf-cache-status: HIT`.

## Out of Scope

- Keine Änderung am Lipsync-Pfad (v60–v64 unverändert).
- Keine Änderung an Provider-Selektion / Prompt-Layer.
- Keine UI-Änderung.
