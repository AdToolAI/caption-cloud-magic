-- Restore Sync.so multi-speaker dialog lipsync pipeline (Guide v169 §7.3, §8 "Duplicate dispatch").
--
-- Root cause: two overloads of try_acquire_dialog_lock and two of release_dialog_lock
-- coexist in the public schema. All edge-function callers (_shared/dialog-lock.ts,
-- compose-dialog-segments, cancel-dialog-lipsync) use the original short signatures.
-- PostgREST cannot disambiguate and returns PGRST203 "Could not choose the best candidate
-- function" on every RPC call, so dialog-lock.ts falls into its documented "proceed
-- WITHOUT lock" safety-net path. The per-pass advisory lock that prevents duplicate
-- Sync.so dispatches is therefore effectively disabled across the pipeline.
--
-- Additionally, the legacy 3-arg try_acquire_dialog_lock body uses
-- "ON CONFLICT (scene_id)" but the dialog_dispatch_locks PK has been migrated to
-- the composite (scene_id, pass_idx), so the legacy body would also fail at SQL
-- level if it ever did get selected. The new 4-arg version is the correct one and
-- already defaults _pass_idx to 0, so existing 3-arg callers keep working unchanged.
--
-- Fix: drop the legacy overloads. The remaining overloads have DEFAULTs that make
-- every current edge-function call site resolve unambiguously.

DROP FUNCTION IF EXISTS public.try_acquire_dialog_lock(uuid, text, integer);
DROP FUNCTION IF EXISTS public.release_dialog_lock(uuid, text);