---
name: N=1 Anti-Clone Anchor Lock (v168)
description: compose-scene-anchor enforces single-person / no-triptych / no-split-screen rules also for N=1 scenes; EXACT_COUNT_SUFFIX, TWO_SHOT_NEGATIVE and STRICT_RETRY_SUFFIX now have N=1 variants. ANCHOR_AUDIT_VERSION 9→10 invalidates cached triptych anchors.
type: feature
---

## Problem
Für N=1 Szenen (z.B. Samuel solo) produzierte Nano Banana 2 ein **Triptychon** (3× Samuel nebeneinander), Audit blockte mit `anchor_extra_person_detected: humans=3/1`. Strict-Retry war an `isMulti` gekoppelt und gab für N=1 keinen zusätzlichen Hinweis → Retry produzierte exakt dasselbe Artefakt.

## Fix (`compose-scene-anchor/index.ts`)
- `EXACT_COUNT_SUFFIX` bekommt N=1-Variante: "EXACTLY 1 human being in 1 continuous frame", verbietet Triptych/Panel-Grid/Split-Screen/side-by-side variations/Duplikate/Spiegel/Poster/Statuen derselben Person.
- `TWO_SHOT_NEGATIVE` → N=1-Variante listet triptych, panel grid, photo collage, contact sheet, before/after grid, mirror duplicates, repeated face, zwei/drei der gleichen Person.
- `STRICT_RETRY_SUFFIX` Bedingung: `strictMode && isMulti` → `strictMode`. N=1-Retry-Text adressiert Triptych/Split-Screen explizit.
- `TWO_SHOT_FRAMING_SUFFIX` bleibt N≥2-only (Single-Shot braucht das nicht).

## Cache-Invalidierung
`ANCHOR_AUDIT_VERSION` 9 → 10 in `compose-video-clips/index.ts`. Bestehende Triptych-Anchors werden bei nächster Anforderung automatisch neu komponiert.

## Invarianten erhalten
- N≥2 Pfad (Two-Shot/Group-Shot/Asymmetric) unverändert.
- Lipsync v166/v167 Plate-Prompts und Audit-Pipeline unangetastet.
- `compose-video-clips` Audit-Logik (1669-1980) bleibt — sie blockt korrekt, brauchte nur sauberen Input.
