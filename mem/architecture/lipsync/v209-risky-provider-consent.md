---
name: v209 Risky Provider Consent (Kling N≥2 Ghost-Mouthing)
description: Diagnose Kling ignoriert Plate-Prompt bei Multi-Speaker → In-Dialog Warn- und Consent-Block statt Auto-Migration
type: architecture
---

# v209 — Risky Provider Consent

## Diagnose (final, nach v208-Isolation)

Ghost-Mouthing im Multi-Speaker-Dialog ist **Layer 1 (Master Plate)**:
- Hailuo hält den v171/v172 gehärteten Plate-Prompt (`mouths and jaws stay still, no listener mouth movement`) auch bei N≥2 zuverlässig.
- HappyHorse ebenfalls (via bestehender Dialog-Migration ohnehin Hailuo-basiert).
- **Kling ignoriert den Plate-Prompt bei N≥2** — generiert eine Sequenz "jeder redet mal". Sync.so tauscht pro Pass nur den aktiven Sprecher-Mund; die anderen zwei rohen Plate-Münder bleiben sichtbar → wirkt wie Ghost-Mouthing.

Kein Sync.so-Bug, kein Preclip-Bug, kein v157-Morph. Reine Provider-Prompt-Adhärenz.

## Entscheidung

**Kein Auto-Migrate** (User wollte volle Kontrolle über den Provider behalten).
**Statt dessen: Consent-Gate im Kosten-Bestätigungs-Dialog.**

- `LIPSYNC_SAFE_PROVIDERS = ['ai-hailuo', 'ai-happyhorse']` (Single Source of Truth in `src/config/lipsyncProviderSafety.ts`).
- `getRiskyLipsyncInfo(scene)` liefert `{ provider, speakerCount, multiSpeaker }` nur wenn Lipsync aktiv UND Provider nicht safe.
- `aggregateCost` bündelt alle risky Szenen im `AggregatedCost.riskyLipsyncScenes`.
- `SceneRenderConfirmDialog` rendert einen roten Warn-Block mit Consent-Checkbox; Confirm-Button ist disabled ohne Häkchen.
- Suppression („30 Min nicht mehr fragen") ist bei Risiko-Szenen deaktiviert — jeder Risk-Render braucht aktiven Consent.

## Consent-Persistenz

Bei bestätigtem Risk-Render schreibt `SceneRenderConfirmProvider` fire-and-forget in `composer_scenes.scene_assets.risky_provider_consent`:
```json
{
  "acknowledged": true,
  "provider": "ai-kling",
  "speaker_count": 3,
  "multi_speaker": true,
  "acknowledged_at": "…",
  "consent_version": "v209",
  "scope": "lipsync_artifacts",
  "refund_excluded_for": "lipsync_artifacts_only"
}
```

## Refund-Regel

Der Ausschluss gilt **nur** für Lipsync-Artefakte (Ghost-Mouthing, verzerrte Münder, Sync-Drift).
Lambda-Timeouts, Sync.so-Ausfälle, Provider-500er, Netzwerkfehler bleiben unverändert refundfähig (Automatik via `_shared/lipsync-fail.ts` unangetastet). Support-Team prüft `scene_assets.risky_provider_consent` bei Refund-Requests, die als „Lipsync-Artefakt" kategorisiert werden.

## Was bewusst NICHT geändert wurde

- Kein Rollback v171/v172 Plate-Prompt.
- Keine Auto-Migration Kling → Hailuo (Nutzerentscheidung).
- Kein neuer Overlay-Layer.
- Kein Preclip- oder Sync.so-Dispatch-Change.
- Kein Blockieren von Kling im Provider-Picker.

## Dateien

- `src/config/lipsyncProviderSafety.ts` — Config + Helper
- `src/lib/composer/estimateSceneRenderCost.ts` — `riskyLipsync` in Cost-Breakdown
- `src/components/video-composer/SceneRenderConfirmDialog.tsx` — Warn-Block, Checkbox, Disabled-Logik
- `src/lib/composer/sceneRenderConfirm.tsx` — State-Management, Persistenz, Suppression-Sperre
