## v110 — Remove v107 Coords-Collision Pre-Guard

### Root cause (DB-verified)
- Scene `f2a58546-692a-4ef5-a690-ba93b513abf5` failed with `v107_coords_collision:face_coords_collision_76px_min_120px_pair_2_3`.
- The v107 pre-guard (in `supabase/functions/compose-dialog-segments/index.ts`, lines ~1179-1269) refuses to dispatch the whole scene when any two speaker face-coords on the master plate are closer than `max(120 px, plate.width × 0.08)`.
- This guard was written for the legacy v69 single-face-preclip pipeline, where a close sibling collapsed the crop into a useless tiny square.
- With **v109 native-resolution preclip** already shipped, a smaller crop is no longer destructive — Sync.so either lip-syncs cleanly or returns a per-pass closed-mouth no-op. The other speakers must not be killed alongside.

### Fix
1. **Delete the v107 pre-guard block** (`compose-dialog-segments/index.ts`, lines 1179–1269). Replace with a soft warning log only (`v110_coords_close speakers=…  minDist=…`), no refund, no scene-failure.
2. **Keep the v107 hard-fail on full-plate dispatch without a valid preclip** (lines ~2616–2700) — that one still protects us from Sync.so multi-face confusion on the full plate. Untouched.
3. **Memory + index update**: add `mem/architecture/lipsync/v110-soft-coords-collision.md` documenting the rule (close coords are no longer a pre-dispatch blocker; preclip is allowed to be small; per-pass results determine success). Reference from `mem/index.md`.
4. **Reset & refund scene `f2a58546…`**: clear `lip_sync_status`, `twoshot_stage`, `clip_error`, `dialog_shots`, `lip_sync_applied_at`, `updated_at`; clear `syncso_inflight_jobs` and `dialog_dispatch_locks` for the scene; refund the consumed credits idempotently. Migration SQL.
5. **No client-side change**. The existing `useResetLipSync` / "Sauber neu starten" button stays as the user's escape hatch.

### Files
- `supabase/functions/compose-dialog-segments/index.ts` — delete lines 1179-1269, replace with single log line.
- `mem/architecture/lipsync/v110-soft-coords-collision.md` — new.
- `mem/index.md` — add v110 entry.
- `supabase/migrations/<timestamp>_v110_reset_collision_scene.sql` — reset + refund for `f2a58546…`.

### Verification
- After re-dispatch, `qa_live_runs`/edge logs must show no `v107_coords_collision`; instead expect `v110_coords_close` warning followed by normal per-pass preclip dispatch.
- Outcome on a 4-speaker close-face scene: at minimum 2–3/4 speakers lip-sync correctly (full success ideal). A single closed-mouth pass must not kill the scene.
- No regression on well-spaced scenes (no new warnings, identical happy path).

### Out of scope (deliberate)
- Sibling-mask overlay on preclip (black ellipse over neighbor mouth) — bigger change; revisit if v110 still produces closed mouths on close-face passes.
- Per-pass result audit (mouth-static detection) — already discussed for v109; not part of this hotfix.
