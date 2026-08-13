# Schritt 2 — Zentrale Provider-Capability-Matrix (v430)

Ziel: Eine einzige Wahrheit für Provider-Fähigkeiten (Dauern, Lip-Sync-Zertifizierung, Multi-Speaker, Native Audio, Sprachen, Speaker-Caps, Labels). Bestehendes Verhalten wird 1:1 überführt — keine Verhaltensverbesserungen in diesem Schritt.

## Ist-Zustand (verifiziert)

Capability-Wissen liegt heute in vier Quellen:

- `src/lib/video-composer/providerCapabilities.ts` — `PROVIDER_CAPS` (manuelle Tabelle) + Registry-Overlay: Dauern werden beim Modul-Load aus `AI_VIDEO_TOOLKIT_MODELS` überschrieben, `lipsync` aus dem v425-Vertrag neu gesetzt (mutierende Nebenwirkung auf ein exportiertes Objekt).
- `src/lib/video-composer/lipsyncMasterProvider.ts` — v425-Zertifizierung (`DIALOG_MASTER_PROVIDERS`) plus `clampDialogMasterDuration()` mit den Hailuo-Buckets (`>=10 → 10`, sonst `6`) und HappyHorse `3..15`.
- `src/config/aiVideoModelRegistry.ts` (via `modelMapping.modelIdToSource`) — Modell-Ground-Truth für Dauern und Capability-Flags.
- `supabase/functions/_shared/composer-ai-sources.ts` — handgepflegter Backend-Spiegel `LIPSYNC_CERTIFIED_AI_SOURCES`; Dauer-Buckets stehen zusätzlich inline in `compose-video-clips` (z. B. `Number(scene.durationSeconds) === 10 ? 10 : 6`, Runway-Fallback `>= 8 ? 10 : 6`).

Damit existieren zwei unabhängig gepflegte Wahrheiten (Client-Tabelle vs. Backend-Set/Inline-Buckets).

## Umsetzung

### 1. Neue Matrix `src/lib/composer/providerMatrix.ts`

- Reines Modul, keine Mutation exportierter Objekte: eine gefrorene `PROVIDER_MATRIX: Record<ClipSource, ProviderCapabilityEntry>`, deterministisch gebaut aus Registry-Dauern + v425-Zertifizierungsliste + statischen Feldern (Label, multiSpeaker, nativeLipSync, nativeAudio, supportedLanguages, multiShot, startEndFrames, maxSpeakers).
- Lookup-API (semantikgleich zu heute): `getProviderDurations`, `snapDurationToProvider`, `providerSupportsLipsync`, `providerSupportsMultiSpeaker`, `providerHasNativeLipSync`, `providerHasNativeAudio`, `providerSupportedLanguages`, `providerMaxSpeakers`, `getProviderLabel`, `getLipsyncProviders`, `clampProviderDuration` (übernimmt exakt die Hailuo-6/10- und HappyHorse-3..15-Semantik).
- `lipsyncMaster` bleibt reine Capability: kein `pipelineMode`, kein `lipsyncPlateSource`, keine Plate-Quellen-Semantik in der Matrix.

### 2. Backend-Spiegel `supabase/functions/_shared/provider-matrix.ts`

- Enthält dieselben Einträge in Deno-kompatibler Form (kein `@/`-Import), plus dieselben Lookup-Funktionen.
- Wird nicht unabhängig gepflegt: ein harter Parity-Test vergleicht Feld für Feld gegen die Client-Matrix und schlägt bei jeder Abweichung fehl.

### 3. Leser schrittweise auf Matrix-Lookups umstellen

- `providerCapabilities.ts` wird zum dünnen Adapter: exportiert weiterhin `PROVIDER_CAPS` und alle bisherigen Funktionen, delegiert aber ausschließlich an die Matrix (Re-Export). Keine Signaturänderung, damit `SceneCard.tsx`, `validateSceneForCinematicSync.ts`, `renderWarnings.ts` unverändert bleiben.
- `lipsyncMasterProvider.ts` bleibt der v425-Vertrag (Zertifizierungsliste, Primary/Secondary, Guard). `clampDialogMasterDuration()` wird intern auf den Matrix-Lookup umgestellt — identische Rückgabewerte, dokumentiert per Test.
- `composer-ai-sources.ts` behält `isLipsyncCertifiedSource()` als Signatur, liest die Menge aber aus der Backend-Matrix.
- In `compose-video-clips` werden nur die Hailuo-Bucket-Ausdrücke durch `clampProviderDuration('ai-hailuo', …)` ersetzt — Ergebniswerte bleiben identisch (inkl. Runway-Fallback-Verhalten). Kein Umbau von Slot-Arbitration, Passes, Sync.so, Assignment, Webhooks oder State Machine.
- `modelProfiles.ts` liest die Lip-Sync-Zertifizierung künftig über die Matrix (statt direkt über den Vertrag) — Ergebnis unverändert.

### 4. Tests

- Parity-Test Client ↔ Backend-Matrix (jeder Provider, jedes Feld).
- Regressionstest „Semantikgleichheit“: Snapshot der heutigen Werte je Provider (Dauern, lipsync, multiSpeaker, Label, Caps) gegen die Matrix.
- Duration-Tests: `snapDurationToProvider` und `clampProviderDuration` gegen die bisherige Implementierung, inkl. Hailuo-Grenzfälle (5, 6, 7, 9, 10, 13) und HappyHorse-Clamp.
- Guard-Test: `provider_not_lipsync_certified` bleibt fail-closed; nur `ai-happyhorse` und `ai-hailuo` sind zertifiziert.
- Bestehende Suites müssen grün bleiben: alle Composer-Tests, die 118 Anchor-Tests, `tsgo`.

### 5. Abschluss

Deployment der berührten Edge Functions, danach Bericht mit der Liste aller verbliebenen Capability-Quellen und der Begründung (Adapter vs. Vertrag vs. entfernbar). Danach STOP — Schritt 3 (Slot-Arbitration) startet nicht.

## Nicht Teil von Schritt 2

Visual Input / Slot-Arbitration, Continuity-Kette, State/Legacy-Migration, UI-Änderungen, Verhaltensänderungen an Provider-Regeln.
