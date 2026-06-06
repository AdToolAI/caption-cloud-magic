---
name: v67 Frame-exact tight WAV slicing
description: Fixes "offset is out of bounds" crash in sliceWavToWindows that broke 4-speaker dialog scenes after v66. Allocation and copy now derive from the same integer frame boundaries.
type: architecture
---

## Symptom (Juni 2026)

4-Sprecher-Dialog-Szene (`7a430ebd…`, 9s plate) scheiterte mit
`prepare_failed_no_tight_audio`, Pass 3 (Kailee, Fenster `[3.717, 6.71]`).
Edge-Log: `v39_tight_audio_failed: offset is out of bounds`. Drei Retries,
gleicher Fehler — Sync.so wurde nie aufgerufen.

v66 (sync_mode tight-gated) hatte den Loop-Fehler beseitigt, der echte
Crash sass tiefer im WAV-Slicer.

## Root Cause

`sliceWavToWindows()` allokierte `outFrames` mit
`Math.round((end - start) * sampleRate)`, kopierte aber Samples mit
`floor(end*sr) - floor(start*sr)`. Für `[3.717, 6.71]` @ 44100 Hz:

- Alloc:  `round(2.993 * 44100) = 131991` Frames
- Copy:   `floor(6.71 * 44100) - floor(3.717 * 44100) = 295911 - 163919 = 131992` Frames

`out.set(..., dstByteOff)` schrieb damit 1 Frame über das Ende von `out`
hinaus → `RangeError: offset is out of bounds`. Bei N=2 trat es seltener
auf, weil die Turn-Boundaries dort zufällig häufiger frame-aligned waren.

## v67 Fix

`supabase/functions/_shared/syncso-preflight.ts`:

1. Frame-Boundaries einmalig in `segs` berechnen (`floor`).
2. `outFrames` summiert exakt diese `nFrames` — kein `round` mehr.
3. Copy verwendet dieselben `nFrames` + defensives
   `copyLen = min(nFrames*bpf, src_remaining, dst_remaining)`.

Keine Änderung an `compose-dialog-segments`, Sync.so Payload, Audio-Mux,
Refund-Pfad oder Retry-Ladder. Lambda-Bundle muss nicht neu deployed
werden.

## Verifikation

- 4-Sprecher Szene: alle 4 Passes liefern `v39_tight_audio dur≈…`,
  Sync.so 200 OK, danach `render-sync-segments-audio-mux` Fan-In.
- 1- und 2-Sprecher Szenen: unverändert grün (gleicher Code-Pfad, jetzt
  frame-exakt).

## Regel (FROZEN-INVARIANT)

In `sliceWavToWindows` (und allen Tight-Slice-Pfaden) müssen Output-Buffer
und Sample-Copy aus **denselben integer Frame-Grenzen** stammen.
Niemals `round(durSec*sr)` für die Allokation kombiniert mit
`floor(timeSec*sr)` für die Kopie.
