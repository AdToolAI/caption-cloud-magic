/**
 * Lipsync provider safety classification (v209).
 *
 * Diagnose (siehe mem://architecture/lipsync/v209-risky-provider-consent):
 *   Kling und andere Provider ignorieren im Multi-Speaker-Fall zuverlässig
 *   den v171/v172-gehärteten Plate-Prompt („mouths and jaws stay still").
 *   Ergebnis ist Ghost-Mouthing der Nicht-Sprecher — kein Sync.so-Bug,
 *   kein Preclip-Bug, sondern reine Provider-Prompt-Adhärenz.
 *
 * Nur diese Provider halten den Plate-Prompt im N≥2-Fall stabil:
 *   - ai-hailuo    (Referenz-Provider)
 *   - ai-happyhorse (durch bestehende Dialog-Migration ebenfalls Hailuo-basiert)
 *
 * Konsequenz für die UI: Wenn Nutzer einen anderen Provider für Lipsync
 * wählt, muss vor dem Render-Dispatch ein expliziter Warn- und Consent-
 * Dialog kommen. Provider werden NICHT auto-migriert (User-Entscheidung).
 */

import type { ClipSource, ComposerScene } from '@/types/video-composer';

/** Provider, die bei Lipsync (auch N≥2) stabile Plate-Prompt-Adhärenz zeigen. */
export const LIPSYNC_SAFE_PROVIDERS: readonly ClipSource[] = [
  'ai-hailuo',
  'ai-happyhorse',
  // Kling 3.0 Omni: native lip-sync — kein Sync.so-Pass nötig, deshalb
  // per Definition "safe" (kein Ghost-Mouthing-Risiko).
  'ai-kling-omni',
] as const;

export function isSafeLipsyncProvider(source: ClipSource | string | undefined): boolean {
  if (!source) return false;
  return (LIPSYNC_SAFE_PROVIDERS as readonly string[]).includes(source);
}

export interface RiskyLipsyncInfo {
  provider: ClipSource | string;
  /** Anzahl unterschiedlicher Sprecher (≥1). */
  speakerCount: number;
  /** True, wenn ≥2 Sprecher → verschärfte Warnung (Ghost-Mouthing wahrscheinlicher). */
  multiSpeaker: boolean;
}

function sceneUsesLipsyncLocal(scene: ComposerScene): boolean {
  if ((scene as any).withAudio === false) return false;
  if ((scene as any).engineOverride === 'cinematic-sync') return true;
  if ((scene as any).lipSyncWithVoiceover === true) return true;
  const script = (scene as any).dialogScript;
  if (typeof script === 'string' && script.trim().length > 0) return true;
  return false;
}

function speakerCountForScene(scene: ComposerScene): number {
  const dv = (scene as any).dialogVoices;
  if (dv && typeof dv === 'object') {
    const n = Object.keys(dv).length;
    if (n > 0) return n;
  }
  return 1;
}

/**
 * Liefert Risk-Info für eine Szene oder `null`, wenn kein Risiko besteht
 * (kein Lipsync, oder Provider ist safe).
 */
export function getRiskyLipsyncInfo(scene: ComposerScene): RiskyLipsyncInfo | null {
  if (!sceneUsesLipsyncLocal(scene)) return null;
  const src = (scene as any).clipSource as ClipSource | undefined;
  if (isSafeLipsyncProvider(src)) return null;
  if (!src) return null;
  const speakerCount = speakerCountForScene(scene);
  return {
    provider: src,
    speakerCount,
    multiSpeaker: speakerCount >= 2,
  };
}

/** Menschenlesbarer Provider-Name für die Warn-Kopie. */
export function humanProviderName(source: ClipSource | string): string {
  const map: Record<string, string> = {
    'ai-hailuo': 'Hailuo',
    'ai-happyhorse': 'HappyHorse',
    'ai-kling': 'Kling',
    'ai-veo': 'Veo',
    'ai-wan': 'Wan',
    'ai-luma': 'Luma',
    'ai-seedance': 'Seedance',
    'ai-sora': 'Sora',
    'ai-runway': 'Runway',
    'ai-pika': 'Pika',
    'ai-vidu': 'Vidu',
    'ai-grok': 'Grok',
    'ai-ltx': 'LTX',
  };
  return map[source as string] ?? source;
}
