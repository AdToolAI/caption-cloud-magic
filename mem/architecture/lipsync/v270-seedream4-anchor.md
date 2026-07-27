---
name: v270 Seedream 4 Anchor
description: Multi-Sprecher Anchor-Compose läuft über Seedream 4 (Replicate); Nano Banana 2 bleibt Fallback + 1-Sprecher-Pfad
type: architecture
---

# v270 — Anchor auf Seedream 4

## Problem
Nano Banana 2 (`google/gemini-3.1-flash-image-preview`) verwechselt bei 3–4 Charakteren mit ähnlichen Merkmalen (v.a. gleicher Nachname) Identitäten oder klont Sprecher. Symptome:
- `anchor_identity_duplicate_detected` (z.B. „Matthew 2×")
- `missing character` trotz korrektem Prompt

## Lösung
`compose-scene-anchor/index.ts` routet Multi-Sprecher-Anker (N≥2) an **Seedream 4** (`bytedance/seedream-4`) über die direkte Replicate-API, mit `image_input[]` als nativer Multi-Reference. Portraits + Identity-Headshots + World-Refs werden in fester Reihenfolge (max 10) übergeben.

## Feature-Flag
- Env: `ANCHOR_MODEL_MULTI` = `seedream4` (Default) | `nano_banana_2`
- Rollback ohne Deploy: Flag setzen → nächster Call nutzt Nano Banana 2.

## Routing
| Sprecher | Provider | Grund |
|----------|----------|-------|
| 1        | Nano Banana 2 | funktioniert dort, billiger |
| ≥2       | Seedream 4 (Fallback: Nano Banana 2) | native Multi-Reference |

## Fallback
Wenn Seedream fehlschlägt (Timeout, 4xx/5xx, kein Output-URL) → automatischer Fallback auf Nano Banana 2 im selben Request. Erst wenn beide fehlschlagen: `strategy: "text-only"`.

## Audit
Identity-Audit (v267) bleibt Soft-Signal — kein Hard-Fail bei Seedream-Anchor.

## Response
`{ composedUrl, cached, strategy: "first-frame-composed" }` — Provider wird im Log geführt (`provider=seedream4|nano_banana_2`).
