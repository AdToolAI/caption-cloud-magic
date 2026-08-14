/**
 * v430.1 Schritt 1 — Inventar der heutigen Lip-Sync-Intent-LESEGATES.
 *
 * Jedes Gate wird als reines Prädikat nachgebildet — exakt die heutige
 * Bedingung an der genannten Stelle, ohne Refactor der Quelle. Nur der
 * Intent-Anteil der Bedingung wird abgebildet; orthogonale Faktoren
 * (clipSource, characters, dialogVoiceCount, Pipeline-Status …) bleiben
 * bewusst draussen, weil sie mit `isLipSyncIntentional()` nichts zu tun
 * haben und die Paritätsfrage nicht beeinflussen.
 */
import type { IntentFixtureScene } from './lipSyncIntentMatrix';

/** Spiegel von `isLipsyncEngine()` aus modelMapping.ts. */
const isLipsyncEngine = (engine: string | null | undefined): boolean =>
  engine === 'cinematic-sync' || engine === 'sync-segments';

export interface IntentGate {
  /** Stabile Gate-ID für den Bericht. */
  id: string;
  site: string;
  /** Was wird sichtbar/aktiv, wenn das Gate true ist. */
  purpose: string;
  /** Heutige Bedingung als Quelltext-Ausschnitt. */
  condition: string;
  predicate: (s: IntentFixtureScene) => boolean;
}

export const INTENT_GATES: IntentGate[] = [
  {
    id: 'scenecard-engine-migration',
    site: 'src/components/video-composer/SceneCard.tsx:510',
    purpose: 'Auto-Migration der clipSource auf den zertifizierten Lip-Sync-Provider',
    condition: "isLipsyncEngine(scene.engineOverride ?? null)",
    predicate: (s) => isLipsyncEngine(s.engineOverride ?? null),
  },
  {
    id: 'scenecard-native-dialogue-verbatim',
    site: 'src/components/video-composer/SceneCard.tsx:833',
    purpose: 'Prompt-Modus "verbatim" statt "intent"',
    condition: "scene.engineOverride === 'native-dialogue'",
    predicate: (s) => s.engineOverride === 'native-dialogue',
  },
  {
    id: 'scenecard-dialog-preflight',
    site: 'src/components/video-composer/SceneCard.tsx:1353',
    purpose: 'Dialog-Preflight (Längenprüfung) vor dem Generieren',
    condition: "isLipsyncEngine(scene.engineOverride ?? null)",
    predicate: (s) => isLipsyncEngine(s.engineOverride ?? null),
  },
  {
    id: 'scenecard-dialog-model-picker',
    site: 'src/components/video-composer/SceneCard.tsx:1703',
    purpose: 'Modell-Picker zeigt nur die Dialog-Modelle',
    condition: 'scene.dialogMode === true',
    predicate: (s) => s.dialogMode === true,
  },
  {
    id: 'scenecard-dialog-studio-entry',
    site: 'src/components/video-composer/SceneCard.tsx:2273',
    purpose: 'Einstiegs-Button in das Scene Dialog Studio',
    condition: 'scene.dialogMode !== true → null',
    predicate: (s) => s.dialogMode === true,
  },
  {
    id: 'scenecard-dialog-studio-mount',
    site: 'src/components/video-composer/SceneCard.tsx:2355',
    purpose: 'Mount des Scene Dialog Studio (Intent-Anteil)',
    condition: 'scene.dialogMode === true',
    predicate: (s) => s.dialogMode === true,
  },
  {
    id: 'scenecard-lipsync-actions',
    site: 'src/components/video-composer/SceneCard.tsx:2386',
    purpose: 'Leiste "Lip-Sync Aktionen" (Intent-Anteil der OR-Kette)',
    condition: 'isLipSyncIntentional(scene)  // v430.1 Schritt 2A',
    predicate: (s) => ssot(s),
  },
  {
    id: 'dialogstudio-wants-lipsync',
    site: 'src/components/video-composer/SceneDialogStudio.tsx:1335',
    purpose: 'Studio-Start erlaubt (sonst Toast "Lip-Sync ist ausgeschaltet")',
    condition: 'isLipSyncIntentional(scene)  // v430.1 Schritt 2B',
    predicate: (s) => ssot(s),
  },
  {
    id: 'dialogstudio-force-cinematic',
    site: 'src/components/video-composer/SceneDialogStudio.tsx:1468',
    purpose: 'Einzelblock-Dialog erzwingt die Cinematic-Sync-Kette (Intent-Anteil)',
    condition: 'isLipSyncIntentional(scene)  // v430.1 Gate 9',
    predicate: (s) => ssot(s),
  },
  {
    id: 'clipprogress-is-cinematic',
    site: 'src/components/video-composer/SceneClipProgress.tsx:126',
    purpose: 'Cinematic-Marker für die Fortschrittsanzeige',
    condition: 'isLipSyncIntentional(scene)  // v430.1 Schritt 2A',
    predicate: (s) => ssot(s),
  },
  {
    id: 'clipprogress-should-be-lipsync',
    site: 'src/components/video-composer/SceneClipProgress.tsx:132',
    purpose: 'Szene gilt als Lip-Sync-Szene (Spinner/Warnungen)',
    condition: 'isLipSyncIntentional(scene)  // v430.1 Schritt 2A',
    predicate: (s) => ssot(s),
  },
  {
    id: 'inlineplayer-needs-lipsync',
    site: 'src/components/video-composer/SceneInlinePlayer.tsx:76',
    purpose: 'Grüner Haken erst nach Lip-Sync (Intent-Anteil)',
    condition: 'isLipSyncIntentional(scene)  // v430.1 Schritt 2A',
    predicate: (s) => ssot(s),
  },
  {
    id: 'inlineplayer-legacy-happyhorse-warn',
    site: 'src/components/video-composer/SceneInlinePlayer.tsx:223',
    purpose: 'Warnung "Lip-Sync auf veraltetem Video" (Intent-Anteil)',
    condition: 'isLipSyncIntentional(scene)  // v430.1 Schritt 2A',
    predicate: (s) => ssot(s),
  },
  {
    id: 'clipstab-locks-user-duration',
    site: 'src/components/video-composer/ClipsTab.tsx:445',
    purpose: 'Nutzer-Dauer wird gegen die gemessene Clip-Dauer verteidigt',
    condition:
      "engineOverride === 'cinematic-sync' || engineOverride === 'sync-segments'",
    predicate: (s) => isLipsyncEngine(s.engineOverride ?? null),
  },
  {
    id: 'clipstab-poll-cinematic',
    site: 'src/components/video-composer/ClipsTab.tsx:550',
    purpose: '3s-Polling läuft weiter, solange Lip-Sync arbeitet (Intent-Anteil)',
    condition: 'isLipSyncIntentional(s)  // v430.1 Schritt 2A',
    predicate: (s) => ssot(s),
  },
  {
    id: 'preflight-dialog-checks',
    site: 'src/components/video-composer/RenderPreFlightDialog.tsx:148',
    purpose: 'Dialog-spezifische Preflight-Blocker (Cast/Skript)',
    condition: 's.dialogMode (truthy)',
    predicate: (s) => !!s.dialogMode,
  },
  {
    id: 'pipelineprogress-cinematic-generating',
    site: 'src/hooks/usePipelineProgress.ts:922',
    purpose: 'Szene zählt als "in Arbeit" während Lip-Sync (Intent-Anteil)',
    condition: 'isLipSyncIntentional(s)  // v430.1 Schritt 2A',
    predicate: (s) => ssot(s),
  },
  {
    id: 'generateall-needs-lipsync',
    site: 'src/hooks/useGenerateAllClips.ts:62',
    purpose: 'Szene gilt erst nach Lip-Sync als pipeline-ready (Intent-Anteil)',
    condition: 'isLipSyncIntentional(scene)  // v430.1 Schritt 2B',
    predicate: (s) => ssot(s),
  },
  {
    id: 'mouthprobe-cinematic',
    site: 'src/hooks/useMouthYavgProbe.ts:41',
    purpose: 'Mouth-Y-Probe läuft überhaupt',
    condition: "scene.engineOverride === 'cinematic-sync'",
    predicate: (s) => s.engineOverride === 'cinematic-sync',
  },
];

/** Lokaler Spiegel der SSoT — bewusst dupliziert, damit das Inventar pur bleibt. */
function ssot(s: IntentFixtureScene): boolean {
  if (s.lipSyncWithVoiceover === false) return false;
  if (s.lipSyncWithVoiceover === true) return true;
  if (s.dialogMode === true) return true;
  return ['cinematic-sync', 'sync-segments', 'native-dialogue'].includes(
    String(s.engineOverride ?? ''),
  );
}

export type Parity = 'exact' | 'broader' | 'narrower' | 'mixed';

export interface GateParityResult {
  gate: IntentGate;
  falsePositives: string[];
  falseNegatives: string[];
  parity: Parity;
}

export function classifyParity(
  falsePositives: string[],
  falseNegatives: string[],
): Parity {
  if (falsePositives.length === 0 && falseNegatives.length === 0) return 'exact';
  if (falseNegatives.length === 0) return 'broader';
  if (falsePositives.length === 0) return 'narrower';
  return 'mixed';
}
