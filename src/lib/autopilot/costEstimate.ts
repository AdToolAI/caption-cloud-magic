import { tx } from "@/lib/i18nText";
/**
 * Cost preview.
 *
 * Shown before a single credit is spent. Numbers come from the same margin
 * table the billing path uses, so the preview cannot drift from the invoice.
 * 100 credits = 1.00 EUR throughout the platform.
 */

import { needsChapterMode } from './ideaFeasibility';

export const CREDITS_PER_EUR = 100;

/** Sell prices per unit, mirroring src/lib/cost/videoProviderMargins.ts. */
const PRICE = {
  /** Anchor still (Seedream / Nano Banana class). */
  anchorImage: 0.04,
  /** One repair pass when the anchor gate rejects a still. */
  anchorRepair: 0.04,
  /** Hailuo 2.3 Pro 1080p, per second of generated motion. */
  motionPerSecond: 0.23,
  /** Kling Omni lip-sync, per second of speaking footage. */
  lipSyncPerSecond: 0.32,
  /** ElevenLabs voiceover, per second of speech. */
  voicePerSecond: 0.012,
  /** Music bed, flat per film. */
  music: 0.18,
  /** One generated audio layer — foley hit or room-tone bed. */
  soundLayer: 0.05,
  /** Remotion Lambda final cut, per second of output. */
  renderPerSecond: 0.02,
} as const;

export interface CostInput {
  sceneCount: number;
  totalDurationSeconds: number;
  voiceoverEnabled: boolean;
  lipSyncEnabled: boolean;
  lipSyncSpeakers: number;
  /** Seconds of speaking footage, defaults to a third of the film. */
  speakingSeconds?: number;
  musicEnabled?: boolean;
}

export interface CostLine {
  label: string;
  detail: string;
  euros: number;
  credits: number;
}

export interface CostEstimate {
  lines: CostLine[];
  totalEuros: number;
  totalCredits: number;
  /** True when runtime pushes this into a long, slow, expensive render. */
  longFormWarning: boolean;
}

function line(label: string, detail: string, euros: number): CostLine {
  const rounded = Math.round(euros * 100) / 100;
  return { label, detail, euros: rounded, credits: Math.round(rounded * CREDITS_PER_EUR) };
}

export function estimateProductionCost(input: CostInput): CostEstimate {
  const scenes = Math.max(1, input.sceneCount);
  const total = Math.max(1, input.totalDurationSeconds);
  const speaking = input.lipSyncEnabled
    ? Math.min(total, input.speakingSeconds ?? total / 3)
    : 0;

  const lines: CostLine[] = [];

  // Every scene gets a still first; roughly one in four needs a repair pass.
  const anchorEuros = scenes * PRICE.anchorImage + Math.ceil(scenes * 0.25) * PRICE.anchorRepair;
  lines.push(line('Bildfreigabe', `${scenes} Standbilder inkl. Nachbesserung`, anchorEuros));

  lines.push(
    line('Bewegtbild', tx({ de: `${Math.round(total)} Sekunden Hailuo 2.3 Pro`, en: `${Math.round(total)} seconds Hailuo 2.3 Pro`, es: `${Math.round(total)} segundos Hailuo 2.3 Pro` }), total * PRICE.motionPerSecond),
  );

  if (input.lipSyncEnabled && speaking > 0) {
    lines.push(
      line(
        'Lip-Sync',
        tx({ de: `${Math.round(speaking)} Sekunden · ${Math.max(1, input.lipSyncSpeakers)} Sprecher`, en: `${Math.round(speaking)} seconds · ${Math.max(1, input.lipSyncSpeakers)} speaker`, es: `${Math.round(speaking)} segundos · ${Math.max(1, input.lipSyncSpeakers)} altavoz` }),
        speaking * PRICE.lipSyncPerSecond,
      ),
    );
  }

  if (input.voiceoverEnabled) {
    lines.push(line('Voiceover', tx({ de: `${Math.round(total)} Sekunden Sprachaufnahme`, en: `${Math.round(total)} seconds of voice recording`, es: `${Math.round(total)} segundos de grabación de voz` }), total * PRICE.voicePerSecond));
  }

  if (input.musicEnabled !== false) {
    lines.push(line('Musik', tx({ de: 'Musikbett für den ganzen Film', en: 'Music bed for the whole film', es: 'Cama musical para toda la película.' }), PRICE.music));
  }

  // Room tone per scene plus a foley hit in roughly every second scene.
  const soundLayers = scenes + Math.ceil(scenes / 2);
  lines.push(
    line('Ton-Design', tx({ de: `${soundLayers} Ebenen Raumton und Geräusche`, en: `${soundLayers} Layers of spatial sound and noise`, es: `${soundLayers} Capas de sonido y ruido espacial` }), soundLayers * PRICE.soundLayer),
  );

  lines.push(line('Endschnitt', tx({ de: `${Math.round(total)} Sekunden Render`, en: `${Math.round(total)} seconds render`, es: `${Math.round(total)} segundos de renderizado` }), total * PRICE.renderPerSecond));

  const totalEuros = Math.round(lines.reduce((acc, l) => acc + l.euros, 0) * 100) / 100;

  return {
    lines,
    totalEuros,
    totalCredits: Math.round(totalEuros * CREDITS_PER_EUR),
    longFormWarning: needsChapterMode(total),
  };
}

export function formatEuro(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}
