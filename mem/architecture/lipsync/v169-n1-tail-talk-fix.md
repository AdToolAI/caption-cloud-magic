---
name: v169 — N=1 Tail-Talk Fix (Single-Speaker bypasses Overlay-Mode)
description: Single-Speaker Cinematic-Sync verwendet nie Overlay-Mode. Tight-Slice nur ab N≥2. Behebt sichtbares Mund-Wackeln nach Skript-Ende, ausgelöst durch v167-Plate-Prompt + v64-Tight-Slice + v164-Overlay-Mux Stack.
type: architecture
---

## Symptom (Juni 2026)

Bei N=1 Cinematic-Sync Szenen (z.B. Samuel-Nahaufnahme) bewegen sich die Lippen
nach Skript-Ende weiter. Lipsync zum Text passt (v167), aber der Mund stoppt
nicht — sichtbar als "Tail-Talk" am Plate-Ende.

## Root Cause

Drei v-Stufen multiplizieren sich:

1. **v167 Plate-Prompt (N=1)** sagt: *"speaking naturally with subtle idle
   mouth and jaw motion"* → die rohe Hailuo-Plate zeigt über die GANZE
   Plate-Dauer einen leicht bewegten Mund (Voraussetzung für sync-3 Animation).
2. **v64 Tight-Slice (N=1..4)** schneidet das VO auf das gesprochene Fenster
   (z.B. 6.99–8.59s). Sync.so liefert mit `cut_off` einen ~1.6s Lipsync-Clip.
3. **v164 Overlay-Mux** (`useOverlay = donePasses.length >= 1 && anyTight`)
   legt diesen 1.6s Clip als Face-Mask-Overlay NUR im Turn-Fenster auf die
   pristine Plate. Außerhalb läuft die **pristine v167-Plate** weiter — Mund
   wackelt nach Textende sichtbar.

Bei N≥2 ist Overlay-Mode korrekt: Sprecher 1 spricht in seinem Fenster, die
restliche Plate zeigt 2/3/4 die jeweils anderen Sprecher. Bei N=1 gibt es
keinen "anderen Sprecher" außerhalb des Turns → Overlay-Mode ist redundant
und schädlich.

## v169 Fix

Zwei minimale Änderungen:

### A — `compose-dialog-segments/index.ts`

Tight-Slice wird auf N≥2 begrenzt:

```ts
const allowTightSlice = passes.length >= 2;
if (allowTightSlice && speakerWindowsSecs.length > 0) { /* slice */ }
```

N=1 schickt wieder das volle VO (inkl. trailing silence) an Sync.so.
`payloadSyncMode` ist über die existierende v66-Regel (`tightAudioInfo
? "cut_off" : "loop"`) für N=1 jetzt `loop` → Output-Länge = Plate-Länge,
sync-3 schließt während Stille natürlich den Mund.

### B — `render-sync-segments-audio-mux/index.ts`

Overlay-Mode für N=1 hart aus:

```ts
const isSingleSpeaker = donePasses.length === 1 && !isFanout;
const useOverlay = !isSingleSpeaker && (isFanout || (donePasses.length >= 1 && anyTight));
```

Falls bei N=1 doch jemals Tight-Audio gesetzt wäre (Legacy-Daten,
Re-Render), wird der Sync.so-Output direkt als Master verwendet.

## Was bleibt unverändert

- **v167 Plate-Prompt** (camera-lock + subtle mouth motion für N=1)
- **N≥2 Pfad** (Tight-Slice + Overlay-Mux + `cut_off`) — komplett unverändert
- **v89 TTS Tail-Trim**, **v90 Multi-Turn-Offsets**, **v66 sync_mode tight-gated**
- **Refund / Watchdog / ASD / Face-Gate-Ladder**

## Body-Motion bleibt erhalten

Sync.so sync-3 verändert ausschließlich die Mund-/Kieferregion. Body-Motion
aus der Hailuo-Plate (Auto fahren, joggen, gestikulieren, Hintergrundaktion)
passiert sync-3 unverändert. v169 nutzt den Sync.so-Output 1:1 als finale
Szene → Body-Motion bleibt vollständig erhalten.

## Verifikation

1. Edge-Log N=1: `v164_mode=single-audio-swap` (statt `single-tight-overlay`),
   kein `v90_tight_audio` Log für die einzige Pass.
2. Finale N=1 Szene: Lippen bewegen sich während Skript, Mund schließt am
   Audio-Ende, keine Idle-Bewegung danach, Body-Motion (Steering, Jogging) intakt.
3. N=2/3/4 Regression: weiterhin `v90_tight_audio` pro Pass und
   `fanout-N-speakers-windowed` Mux — unverändert.

## Invariante (FROZEN)

> Single-Speaker Cinematic-Sync verwendet **nie** Overlay-Mode.
> Tight-Slice nur ab N≥2.
