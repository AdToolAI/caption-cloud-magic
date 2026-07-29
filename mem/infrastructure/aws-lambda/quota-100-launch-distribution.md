---
name: AWS Lambda Quota 100 — Launch Distribution
description: Launch-Verteilung der AWS Lambda Concurrency (Quota 100, eu-central-1) auf Render-Pool und Edge/Burst. Definiert Trigger für die nächste Ausbaustufe.
type: architecture
---

# AWS Lambda Quota 100 — Launch Distribution

AWS hat die Lambda-Concurrency in `eu-central-1` auf **100** bestätigt.

## Verteilung

| Bucket | Slots | Verwendung |
|---|---|---|
| Render-Pool | **80** | Remotion Lambda Renders (UCC, Director's Cut, Motion Studio, AI Video Studio, Composer, Lip-Sync Mux) |
| Edge + Burst-Reserve | **20** | Edge Functions, Retry-Bursts, unerwartete Spikes |

- `RENDER_SLOT_BUDGET_DEFAULT = 80` in `supabase/functions/_shared/render-concurrency.ts`
- DB-Override: `system_config.render_queue_slot_budget = '80'`
- Frontend-Pill: `SLOT_BUDGET_DEFAULT = 80` in `src/hooks/useRenderSystemLoad.ts`

## Founder-Reserve

- `FOUNDER_RESERVE_HIGH_WATER = 68` (≈ 85 % Auslastung)
- Ab 68/80 belegten Slots werden Non-Founder mit 429 `RENDER_SLOT_BUSY` (reason `founder_reserve`) abgewiesen.
- Founders nutzen die letzten 12 Slots ohne Bremse.

## Bewusst NICHT angepasst

- `pickRenderTier` Worker-Caps (short=3, standard=5, long=8, export=12)
- `TARGET_MAX_LAMBDAS = 5` in `remotion-payload.ts`
- Stability-Tiers, `framesPerLambda`-Boden 270
- Lambda-Timeout 600 s, RAM 3008 MB
- Encode-Quality-Floor (JPEG 95 / CRF 16 / preset slow/medium)

Grund: Keine echten Peak-Daten. Erst nach Launch messen, dann skalieren.

## Nächste Ausbaustufe (Trigger)

Wenn `LambdaHealth`-Dashboard peak concurrency **> 60 an ≥ 3 Tagen** zeigt:

1. AWS Support Case auf **250 concurrency** in eu-central-1.
2. Nach Freigabe zweite Runde:
   - Render-Pool auf ~200
   - `TARGET_MAX_LAMBDAS` 5 → 8
   - Tier-Caps: short 4, standard 6, long 10, export 15
   - Stability-Tiers hochziehen bis 8 λ

## Verbote

- Diese Werte NICHT ohne AWS-Quota-Änderung weiter erhöhen — Overbook kostet Renders.
- Beim Anheben der AWS-Quota diese Memory neu berechnen, nicht raten.
