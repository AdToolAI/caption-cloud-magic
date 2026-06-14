---
name: v112 — Preclip ≥720p + "speaking naturally" Plate-Hint
description: Two doc-compliant fixes that make Sync.so sync-3 actually animate mouths on AI plates — 720p preclip floor (≥480p per official docs) and the official "the character should be speaking naturally" plate-prompt hint that gives sync-3 the idle mouth motion it needs to drive lipsync
type: feature
---

# v112 — Was `auto_detect` zu sehen bekommt: doc-conform machen

`auto_detect: true` bleibt für sync-3 der offizielle Default. Der Fehler
("mouths don't move") lag am **Input** in den Preclip — zu klein und mit
einem statisch geschlossenen Mund, was sync-3 zwingt das Plate
unverändert zurückzugeben (COMPLETED + bit-identisches Output).

## Offizielle Sync.so-Belege

1. `sync.so/docs/compatibility-and-tips/improving-lip-sync-quality`:
   > "Use at least **480p resolution for reliable face detection**.
   >  […] We recommend **1080p as the best balance**."

2. `sync.so/docs/compatibility-and-tips/media-content-tips`:
   > "When creating videos with third-party AI video generation models,
   >  include this instruction in the text prompt: **'the character
   >  should be speaking naturally'**. The generated AI video will have
   >  some random mouth movements, which are **necessary to get the best
   >  results from our lipsync model**."

## Änderungen

### A — Preclip-Auflösung: Floor 720p, Cap 1280p

`supabase/functions/_shared/pass-face-preclip.ts`

```ts
// v112 — sync.so ≥480p; target 720p safety margin, cap 1280p for cost.
const nativeOut = Math.min(1280, Math.max(720, crop0.size));
```

Ersetzt v109's `Math.max(256, crop0.size)`, das in der Praxis 220–360px
Preclips erzeugte (deutlich unter 480p Floor).

### B — Plate-Prompt: "speaking naturally" Hint

`supabase/functions/compose-video-clips/index.ts`

- `neutralTwoShotPrompt` — "jaw loose but still" → "softly mobile jaw —
  small, subtle, natural idle mouth and jaw motion (the character
  should be speaking naturally, no specific words, no exaggerated
  speech)".
- `buildCinematicSyncMasterPrompt` Suffix erweitert:
  *"Every visible character should be speaking naturally with subtle,
  natural idle mouth and jaw movements throughout the entire clip"*.

### C — Negative-Prompt-Konflikt aufgelöst

`CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` enthielt bisher
*"talking mouth, lip movement, speaking animation, open mouth speech,
mouthing words, mouth flapping"* — direkter Widerspruch zur offiziellen
Anleitung. Entfernt; nur noch *"exaggerated facial talking, dialogue
performance, singing, yelling, words clearly visible on lips"* bleibt
als Anti-Über-Drift-Guard. Framing-Change-Keywords (FROZEN I.4) bleiben
unverändert vollständig erhalten.

## Out of Scope

- Speaker-Selection-Modus (bleibt `auto_detect: true`, doc-conform für sync-3)
- Sync.so-Modell, `sync_mode`, Audio-Mux, Stitcher, `audio_plan`
- Composer-Clip-Auflösungen (nur Dialog-Preclips)
- FROZEN I.4 Camera-Lock-Wortlaut bleibt verbatim

## Verifikation

- Szene `e57ef6dd-31a4-4b9d-9b49-5894d64bea7d` wurde resettet (dialog_shots,
  clip_url, lip_sync_status, twoshot_stage, reference_image_url, anchor cache).
- Beim nächsten Render: Plate enthält "speaking naturally" Hint, Preclip
  rendert in 720p. sync-3 sollte jetzt sichtbar Mundbewegung erzeugen.
