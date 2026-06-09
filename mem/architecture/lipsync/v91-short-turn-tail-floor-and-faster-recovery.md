---
name: v91 — Short-Turn Tail Floor + Faster Recovery
description: Dynamic tail-pad floor (0.08s) for turns <0.6s prevents Sync.so provider_unknown_error on speakers 3/4; watchdog dispatch-recovery 3min → 90s
type: architecture
---

# v91 (Juni 2026)

## Problem

Nach v90 (Tail-Clamp auf 0.02s) wurde in 4-Sprecher-Szenen oft nur bei Speaker 1+2 ein Lip-Sync ausgeliefert. Speakers 3/4 (typisch kürzere Turns, weil sie reagieren statt monologisieren) bekamen ein Slice-Window von z. B. 0.4–0.6 s. Sync.so erwartet zwar nur ≥0.4 s VO, reagiert aber auf sehr knappe, fast unflankierte Audio-Slices mit `provider_unknown_error` — die Retry-Ladder fällt dann in `coords-pro` zurück, wo der 3+ Speaker Repair-Audio-Guard greift und der Pass still ohne `output_url` endet.

Zweites Problem: Wenn ein Pass tatsächlich nie dispatcht wurde, wartete der `lipsync-watchdog` 3 min, bevor er die Recovery startete. Bei 4 Speakern fühlte sich die Pipeline dadurch sehr langsam an.

## Fix A — Dynamic Tail Floor

`compose-dialog-segments/index.ts` und `render-sync-segments-audio-mux/index.ts`:

```ts
const SHORT_TURN_THRESHOLD_SEC = 0.6;
const tailPad = rawTurnDuration < SHORT_TURN_THRESHOLD_SEC ? 0.08 : 0.02;
```

- Lange Turns (≥0.6 s) behalten den v90-Tail-Clamp von 0.02 s → kein Lippen-Twitch nach Skript-Ende.
- Kurze Turns (<0.6 s) bekommen 0.08 s Tail → genug Audio-Substanz für Sync.so, kein `provider_unknown_error` mehr.
- Wert ist symmetrisch in TTS-Slice (`speakerWindowsSecs`) UND Mux-Overlay (`fanoutShots`) angewandt, damit Audio-Plate und Lip-Overlay sich frame-genau decken.

## Fix B — Watchdog Recovery 3min → 90s

`lipsync-watchdog/index.ts`: `STALE_DISPATCH_RECOVERY_MS = 90_000` (vorher `3 * 60_000`). Sync.so normaler Render ist 25-45 s; 90 s = 2× Toleranz. Halbiert die gefühlte Stall-Zeit, wenn ein Pass aus irgendeinem Grund (Edge-Cold-Start, 202-Race) nicht dispatcht wurde.

## Out of scope (für später)

- Watchdog `hasRecordedProviderJobLocal` boolean → per-Pass Set (würde Recovery noch granularer machen).
- Sync.so Multi-Pass parallel statt v60 serial (Lasttest-Risiko).
- TTS+Anchor parallelisieren (architektureller Eingriff in compose-video-clips / compose-twoshot-audio Sequenz).

## Bundle

Keine Lambda-Bundle-Änderung nötig. Reine Edge-Function-Deploys.
