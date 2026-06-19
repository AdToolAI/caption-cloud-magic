# v134 NOOP Escalation Ladder — IMPLEMENTED

Status: shipped 2026-06-19

## What changed

### `supabase/functions/sync-so-webhook/index.ts`
Replaced the v129.26 single-shot escalation block (lines 595–690) with a deterministic 2-rung ladder driven by `noop_escalation_step: 0|1|2`:
- Step 0 → variant `bbox-url-pro` (per-frame bounding_boxes_url, sync-3)
- Step 1 → variant `coords-pro-box` (bounding-box ASD, sync-3)
- Step 2 → HARD FAIL + idempotent refund + `twoshot_stage='needs_clip_rerender'` + German user message naming speaker & turn timestamp.

No model swap (stays on sync-3 per v129.29 directive). Both `NOOP_ESCALATING` and `NOOP_LADDER_EXHAUSTED` log rows carry `turn_idx`, `meta.speaker_name`, `meta.from_variant`, `meta.to_variant`, `meta.rung_label`, `meta.attempt_id`.

### `supabase/functions/compose-dialog-segments/index.ts`
- Bumped `COMPOSE_DIALOG_SEGMENTS_VERSION` → `v134.0`.
- Terminal coord-refresh guard (v128) now carves out an exception when a pass is in an active NOOP-retry cycle (`status=pending` + `noop_escalation_step > 0` + `noop_retry_attempt_id` set). Lets the escalation actually use better coords.
- `DISPATCH_ATTEMPT_STARTED` log populates `turn_idx` from `body.pass_idx` and threads `noop_auto_escalation` / `noop_escalation_step` / `requested_retry_variant` into meta.
- `DISPATCHED` log populates `turn_idx` from `currentPassIdx`.

### `src/components/video-composer/SceneInlinePlayer.tsx`
New banner state: when any pass has `noop_escalation_step > 0` + status pending/rendering, the spinner shows `NOOP-Retry läuft (Stufe N/2)` and names the speaker + rung label. Default `Lip-Sync läuft…` line now shows `Pass N/M` instead of generic `~60 s pro Sprecher-Turn` when pass count is known.

### `mem/architecture/lipsync/v134-noop-escalation-ladder.md`
Created — full architectural doc, wall-time table, validation checklist.

### `mem/index.md`
Added v134 entry under the lipsync section.

## Validation steps for the user

1. Sofort: Sprecher 2 in der betroffenen Szene `6b4fda29…` ist mit NOOP-Output ausgeliefert worden. Bitte diese Szene über `Lip-Sync zurücksetzen` neu laufen lassen — der neue Code räumt die NOOPs sauber auf.
2. Bei der nächsten Multi-Speaker-Szene: Forensik in `syncso_dispatch_log` sollte bei jedem Eintrag `turn_idx` gefüllt zeigen und im NOOP-Fall die neuen Statuswerte `NOOP_ESCALATING` / `NOOP_LADDER_EXHAUSTED`.
3. UI zeigt `NOOP-Retry läuft (Stufe N/2)` während der Eskalation — kein stummer Spinner mehr.
