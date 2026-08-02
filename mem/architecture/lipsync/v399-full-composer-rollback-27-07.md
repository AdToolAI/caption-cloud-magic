---
name: Vollständiger Composer-Rollback 27.07.2026 (v399)
description: Gesamter Composer-Pfad (Clip-Erzeugung, Webhooks, Audio, Lip-Sync, Frontend-Trigger) steht strikt auf Commit 58060cffe; Post-Juli-Module entfernt
type: constraint
---

# v399 — Strikter Composer-Rollback auf 27.07.2026

**Verbindlicher Stand:** Commit `58060cffe` (Baseline v283).

## Zurückgesetzt (1:1)
Backend: `compose-video-clips`, `compose-clip-webhook`, `compose-twoshot-audio`,
`compose-scene-anchor`, `compose-stitch-and-handoff`, `compose-video-assemble`,
`auto-director-compose`, `compose-dialog-segments`, `sync-so-webhook`,
`lipsync-watchdog`, `_shared/happyhorse-green-net.ts`, `_shared/render-concurrency.ts`.
Frontend: `useTwoShotAutoTrigger`, `useSceneGenerate`, `usePipelineProgress`,
`useGenerateAllClips`, `useComposerPersistence`, `lib/composer/isRealizedScene.ts`.
Einzige bewusste Abweichung: der Versions-String
`v283-baseline-27-07-full-composer-rollback` (Log-Grep).

## Entfernt (Post-Juli, nicht reaktivieren)
`dialog-director`, `lipsync-closeup-contract`, `face-track`, `frame-space`,
`camera-path` (nur noch Remotion-Template), sämtliche `preclip-*`-Contracts,
`mouth-motion-verdict`, `aws-frame-probe`, `rek-image-space`,
`rekognition-face-collection`, `cast-identity-lock`, `cast-clause`,
`canonical-cast`, `plate-identity-split`, `still-sanity`,
`generation-provenance`, `twoshot-audio-contract`, `assignment-lock`,
`clip-terminal-failure`.

## Stillgelegt
`composer-start-scene-generation` (v377 Single-Run-Vertrag) wird nicht mehr
aufgerufen. `src/lib/composer/startSceneGeneration.ts` ist nur noch ein dünner
Adapter, der direkt `compose-video-clips` aufruft — so wie am 27.07.

## Regel
Keine neuen Framing-, Preclip- oder Verdict-Contracts in den Composer-Pfad
einbauen, ohne dass ein echter 4-Sprecher-Lauf auf dieser Baseline zuvor grün
war. Alle Post-Juli-Reparaturversuche haben das Plate-Quality-Gate (v117)
gegen sich selbst arbeiten lassen.
