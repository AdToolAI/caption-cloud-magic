---
name: v131.5 — Final dispatch-path safety override + version pin
description: compose-dialog-segments and syncso-replay enforce a final ASD mutex right before fetch to Sync.so; coords-pro on clean single-face preclip is hard-forced to auto_detect:true with no coords/frame; build version stamped into syncso_dispatch_log.meta.compose_version
type: feature
---

## Why
v131.4 added a Rule-0 override at line ~3640 of `compose-dialog-segments/index.ts`
that forces `{ auto_detect: true }` when `retryVariant === "coords-pro"` on a
clean single-face preclip. Forensik on scene `83145f34…` showed the dispatched
payload still carried `{ auto_detect:false, coordinates:[360,363], frame_number:2 }`.

Root cause: the snap-via-strategy block at line ~4498 legitimately
overwrites `syncOptions.active_speaker_detection` AFTER the v131.4 override
runs, restoring coordinates whenever the Face-Gate snapped. The sanitizer at
line 4243 then ran on the already-snapped value because the snap mutates
`payload.options` too.

## Fix (v131.5)
1. **Version pin** — `COMPOSE_DIALOG_SEGMENTS_VERSION = "v131.5"` stamped into
   every `syncso_dispatch_log.meta.compose_version`. Trivial SQL to attribute
   any production failure to a specific deploy.
2. **Final pre-fetch safety override** — Immediately before the `fetch` to
   `${SYNC_API_BASE}/generate`, re-evaluate Rule 0 on `payload.options`. On
   clean single-face preclip + coords-pro, force `{ auto_detect: true }`,
   null `pass.coords`, log `_v131_5_final_override` with the previous shape.
3. **ASD mutex** — When `auto_detect === true`, drop `coordinates`,
   `frame_number`, `bounding_boxes`, `bounding_boxes_url`.
4. **Hard assertion** — Refuse dispatch (refund via `failBeforeProviderDispatch`)
   if the final payload violates the mutex.
5. **syncso-replay audit** — Same mutex + assert mirrored into the admin
   replay path; manual replays cannot dispatch a doc-violating shape.
6. **Test** — `_shared/asd-strategy.test.ts` adds a v131.5 invariant test
   for the final post-override shape.

## Out of scope
- `lipsync-watchdog` only GETs `/generate/:jobId`; no dispatch — skipped.
- `syncso-preflight` is a face-probe; no dispatch — skipped.

## Verification SQL
```sql
select meta->>'compose_version',
       v102_probe->>'asd_mode',
       meta->'v131_5_final_override',
       payload_summary->'options'->'active_speaker_detection',
       coords, frame_number, sync_status
from syncso_dispatch_log
order by created_at desc limit 10;
```
Expect: `compose_version = v131.5`, ASD = `{auto_detect:true}` (no coords/frame),
`sync_status = DISPATCHED → COMPLETED`.
