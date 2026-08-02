---
name: v373 Clip generieren = harter Neustart
description: Generations-Vertrag für Composer-Szenen — Hard-Reset löscht alten Job vollständig vor Neustart, Lip-Sync nur auf Plate der aktuellen Generation
type: feature
---

**Regel:** „Clip generieren" ist ein harter Neustart. Erst alles Alte abbrechen und löschen, dann erst den neuen Job starten.

**Ablauf (`_shared/scene-hard-reset.ts` → `composer-hard-reset-scene`):**
1. Alle Sync.so-Jobs abbrechen, Inflight-Slots freigeben, Credits einmalig erstatten (`failLipSync`)
2. `dialog_dispatch_locks` + `syncso_inflight_jobs` der Szene löschen
3. Artefakte purgen: `ai-videos/composer/*`, `composer-frames/shared/<sceneId>`, `<user>/scene-anchors`, `<user>/<project>/asd`, `voiceover-audio/<user>/twoshot-vo`, `lipsync-plates` — gematcht über sceneId im Objektnamen
4. `plate_generation` hochzählen, alle Pipeline-Felder leeren (`audio_plan` behält den Nutzerplan, verliert `twoshot`/`lipsync`/`segments_payload`)

**Generations-Vertrag:**
- `composer_scenes.plate_generation` = aktueller Lauf; `plate_ready_generation` wird per DB-Trigger `stamp_plate_generation` gesetzt, sobald eine neue `clip_url` geschrieben wird.
- `compose-dialog-segments` bricht mit `v373_stale_plate_blocked` (409) ab, wenn `plate_ready_generation !== plate_generation`.
- `isRealizedScene()` gibt bei Generationsabweichung `false` zurück → Auto-Trigger startet nie auf einer Plate aus einem früheren Lauf.

**Reihenfolge im Frontend zwingend:** Hard-Reset awaiten **vor** Anchor-Erzeugung und Prompt-Bau (`useGenerateAllClips` Schritt 2b, `useSceneGenerate` Pre-Mark) — der Artefakt-Purge würde einen bereits erzeugten neuen Anchor sonst mitlöschen.

**Belegter Ursprungsdefekt (02.08.2026, Szene 6bf4e815):** 11:04:35 Neurender gestartet, 11:04:42 Preclips aus der Plate vom Vortag 21:28 geschnitten, 11:05:22 Passthrough-Fehlschlag, 11:08:57 neue Plate erst fertig. Alte und neue Plate teilten denselben Storage-Pfad.
