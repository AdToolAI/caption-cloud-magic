---
name: v317 Terminal Clip-Failure Gate
description: Kein Lip-Sync-Dispatch ohne fertigen Master-Clip; Content-Filter-Fails (Green Net/E005) und >=2 Render-Retries werden terminal statt auf clip_status='pending' zurückgesetzt.
type: feature
---

# v317 — Terminal Clip-Failure Gate

**Regel:** Lip-Sync darf nie starten, wenn der Master-Clip fehlt oder `clip_status='failed'` ist.

- `compose-dialog-segments`: Early-Gate direkt nach dem Scene-Load → `{ error: 'master_clip_failed' }` (200), keine Credits, kein Sync.so-Call; Lip-Sync-Felder werden geleert.
- `_shared/clip-terminal-failure.ts`: `isContentFilterError` (green_net_rejected, E005, sensitive, moderation …), `MAX_CLIP_RENDER_RETRIES=2`, `buildClipRerenderPatch()`. Alle Preflight-Gates (v117/v132/v133/v153) nutzen den Helper: Reset auf `pending` nur, solange die Szene noch Render-Versuche hat und kein Content-Filter-Fail vorliegt — sonst terminal `clip_status='failed'`.
- Client (`useTwoShotAutoTrigger`, `ClipsTab`): Self-Heal-Blöcke und Lip-Sync-Trigger überspringen `clip_status='failed'`; `master_clip_failed` gilt als stiller Grund und emittiert `lipsync:end` (Fortschrittsbalken stoppt).

Verhindert den „Gummiband"-Loop: Clip-Fail → Lip-Sync-Start → Preflight-Reset auf pending → erneuter Clip-Fail.
