---
name: Lip-Sync Pipeline Cleanup v48 (June 2026)
description: Single active 3+ speaker lip-sync pipeline (sync-segments multi-pass), legacy two-shot functions deleted, partial-mux race fixed in COMPLETED webhook branch
type: constraint
---

# Lip-Sync Cleanup v48

## Single canonical pipeline (3+ speakers)

```
useTwoShotAutoTrigger
  → compose-dialog-scene (thin forwarder)
  → compose-dialog-segments (v5 multi-pass, ONE Sync.so call per speaker, chained)
  → sync-so-webhook (per pass)
  → render-sync-segments-audio-mux (only on ALL passes done)
```

The "official Sync.so single-call segments + bounding_boxes" payload is **structurally broken** against `lipsync-2-pro` (returns `An unknown error occurred`, DB-confirmed across May/June 2026). Do NOT try to replace v5 multi-pass with a single-call segments dispatch — it has been tried multiple times and always fails the same way.

## Deleted legacy functions (DO NOT recreate)

- `compose-lipsync-scene`
- `compose-twoshot-lipsync`
- `poll-twoshot-lipsync`
- `twoshot-lipsync-watchdog`
- `_shared/twoshotDiagnostics.ts`

These were a parallel legacy two-shot stack that nothing called anymore. Their related pg_cron jobs are unscheduled.

## Partial-mux race fix (the v47 freeze cause)

In `sync-so-webhook` COMPLETED branch:

```ts
if (allDone && failedCount > 0 && totalPasses >= 3) {
  // refuse partial mux, refund, fail scene cleanly
}
```

Previously the COMPLETED branch only checked `allTerminal && doneCount > 0`. When a sibling FAILED webhook arrived BEFORE the last COMPLETED webhook, the scene was marked done and muxed even though one speaker had failed → frozen-looking video with wrong audio. For 3+ speaker scenes, ANY failed pass → fail the scene, refund credits.

The 1- and 2-speaker partial-mux behaviour is preserved.
