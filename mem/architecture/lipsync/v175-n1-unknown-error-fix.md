---
name: v175 — N=1 generation_unknown_error Fix (Tight-Slice + Overlay restored)
description: Bei N=1 läuft Cinematic-Sync wieder durch den N≥2-Pfad (Tight-Slice + Overlay-Mode). Tail-Talk wird stattdessen durch closed-mouth Hailuo-Plate verhindert (v167 idle mouth motion entfernt). Sync.so generation_unknown_error durch trailing silence (v64) bleibt damit gefixt.
type: architecture
---

## Symptom

N=1 Cinematic-Sync (z.B. Samuel-Nahaufnahme, 8s Hailuo + 6.8s VO mit
1.2s trailing silence) liefert von Sync.so:

```
syncso_segments_FAILED: [generation_unknown_error]
"Something went wrong while processing this generation."
```

Payload war doc-strict (`model=sync-3`, `sync_mode=loop`,
`active_speaker_detection.bounding_boxes_url`) — die Ursache ist nicht
das Schema sondern der trailing-silence-Mismatch im WAV.

## Root Cause

v169 (Tail-Talk-Fix, Jun 29) hat in `compose-dialog-segments` das
Tight-Slice für N=1 abgeschaltet (`allowTightSlice = passes.length >= 2`).
Damit ging die volle VO inkl. trailing silence an Sync.so — genau der
Failure-Mode den v64 dokumentiert und durch Tight-Slice gefixt hatte.

Tail-Talk (der Grund für v169) kam aber primär aus v167's
Plate-Prompt-Erweiterung *"speaking naturally with subtle idle mouth
and jaw motion"* in `compose-video-clips`, NICHT aus Tight-Slice.

## v175 Fix

Drei chirurgische Änderungen, alles andere bleibt:

### A — `compose-dialog-segments/index.ts`

```ts
const allowTightSlice = passes.length >= 1; // revert v169 (war >= 2)
```

Tight-Slice trimmt das WAV auf das voiced-Window (z.B. 0.1–6.8s statt
0–8s) → kein trailing-silence-Mismatch mehr. v169.1 Preflight-Gate
feuert automatisch wieder ab N≥1.

### B — `compose-video-clips/index.ts` (N=1 Plate-Prompt)

v167 Suffix *"speaking naturally with small, continuous idle mouth and
jaw motion"* wird ersetzt durch *"mouth softly closed in a natural
neutral resting position throughout the plate — NO idle mouth motion,
NO jaw motion … sync-3 opens the mouth in post only during the actual
speech window"*. Sync-3 hat built-in face-open/obstruction-handling und
animiert closed-mouth Plates problemlos.

### C — `render-sync-segments-audio-mux/index.ts`

```ts
const useOverlay = isFanout || (donePasses.length >= 1 && anyTight); // revert v169
```

Overlay-Mode für N=1 wieder aktiv. Sync.so-Output liegt im
Speaker-Window, außerhalb zeigt die pristine (closed-mouth) Plate → kein
Tail-Talk, kein Lipsync-Drift.

## Was unverändert bleibt

- v168 Anti-Clone Anchor-Lock (N=1 darf nicht 3× Samuel sein)
- v170 Cast-Integrity Audit (Bystanders erlaubt)
- v174 Respect-User-Provider (HappyHorse migriert nicht still auf Hailuo)
- v131.6 Face-Lock Attempt-3
- v77/v78 Plate-Face-Targeting
- N≥2 Pfad komplett unverändert
- Refund / Watchdog / ASD-Builder

## Invariante (FROZEN)

> N=1 Cinematic-Sync verwendet Tight-Slice + Overlay-Mode wie N≥2.
> Tail-Talk wird verhindert durch closed-mouth Idle in der Hailuo-Plate
> (compose-video-clips), nicht durch Disablen von Tight/Overlay.
> v64-Provider-Stop-Loss (Trailing-Silence → unknown_error) bleibt aktiv.

## Verifikation

1. Dispatch-Log N=1: `tight_audio_dur_sec ≈ voiced_sec` (z.B. 6.7s
   statt 8.0s), `tight_audio_url` gesetzt, `payloadSyncMode='cut_off'`.
2. Sync.so callback: `status=completed`, kein `generation_unknown_error`.
3. Final Clip: Lippen synchron, Mund am Sprech-Ende geschlossen, keine
   Idle-Bewegung in der Stille.
4. N=2/3/4 Regression: Tight-Slice + Overlay-Mux unverändert,
   `fanout-N-speakers-windowed` Mux-Mode.
