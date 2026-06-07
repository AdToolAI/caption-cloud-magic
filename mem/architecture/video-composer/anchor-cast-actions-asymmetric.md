---
name: Scene Anchor — CastActions + Asymmetric Framing (v14)
description: compose-scene-anchor extracts [CastActions] bullets BEFORE the dialog stripper (otherwise the generic `- Name:` regex deletes them), re-injects them as a protected CHARACTER ACTIONS clause, and softens TWO_SHOT_FRAMING_SUFFIX (no more "equal screen share") when any action contains an asymmetric keyword (background/foreground/phone/standing/walking/leaning/behind/etc.). EXACT_COUNT_SUFFIX and "N distinct faces" requirement stay so Lip-Sync v69/v76 face detection keeps working. Cache key bumped to v14 + includes castActions signature + asym flag.
type: architecture
---

Without this, per-character actions like "Matthew is making a phone call in the background" never reached Nano Banana 2 and the mandatory equal-share two-shot rule placed every character symmetrically side-by-side. Hailuo i2v then locked that pose. Fix lives entirely in `supabase/functions/compose-scene-anchor/index.ts`.
