/**
 * v430.1 Schritt 1 — Fixture-Matrix für Lip-Sync-Intent-Gates.
 *
 * Vollständiges Kreuzprodukt der drei Intent-Felder. Die Matrix friert die
 * HEUTIGE Semantik ein; sie ändert kein Produktionsverhalten.
 *
 *   lipSyncWithVoiceover : true | false | undefined
 *   dialogMode           : true | false | undefined
 *   engineOverride       : auto | cinematic-sync | sync-segments |
 *                          native-dialogue | undefined
 *
 * = 3 * 3 * 5 = 45 Zeilen mit stabilen IDs der Form
 *   `L<t|f|u>-D<t|f|u>-E<auto|cs|ss|nd|u>`
 */

export type TriState = true | false | undefined;
export type EngineOverrideValue =
  | 'auto'
  | 'cinematic-sync'
  | 'sync-segments'
  | 'native-dialogue'
  | undefined;

export interface IntentFixtureScene {
  id: string;
  lipSyncWithVoiceover?: boolean | null;
  dialogMode?: boolean | null;
  engineOverride?: EngineOverrideValue;
}

const TRI: TriState[] = [true, false, undefined];
const ENGINES: EngineOverrideValue[] = [
  'auto',
  'cinematic-sync',
  'sync-segments',
  'native-dialogue',
  undefined,
];

const triTag = (v: TriState) => (v === true ? 't' : v === false ? 'f' : 'u');
const engineTag = (v: EngineOverrideValue) =>
  v === 'cinematic-sync'
    ? 'cs'
    : v === 'sync-segments'
      ? 'ss'
      : v === 'native-dialogue'
        ? 'nd'
        : v === 'auto'
          ? 'auto'
          : 'u';

function build(): IntentFixtureScene[] {
  const rows: IntentFixtureScene[] = [];
  for (const lipSyncWithVoiceover of TRI) {
    for (const dialogMode of TRI) {
      for (const engineOverride of ENGINES) {
        rows.push({
          id: `L${triTag(lipSyncWithVoiceover)}-D${triTag(dialogMode)}-E${engineTag(engineOverride)}`,
          lipSyncWithVoiceover,
          dialogMode,
          engineOverride,
        });
      }
    }
  }
  return rows;
}

export const LIPSYNC_INTENT_FIXTURES: IntentFixtureScene[] = build();

/** snake_case-Spiegel derselben Matrix (für Row-Gates). */
export function toRow(f: IntentFixtureScene) {
  return {
    id: f.id,
    lip_sync_with_voiceover: f.lipSyncWithVoiceover,
    dialog_mode: f.dialogMode,
    engine_override: f.engineOverride,
  };
}
