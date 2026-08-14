/**
 * v430.1 Schritt 1 — Charakterisierungstest der Lip-Sync-Intent-Gates.
 *
 * Dieser Test ÄNDERT NICHTS. Er friert die heutige Sichtbarkeits-/
 * Aktivierungssemantik jedes direkten Intent-Gates über die 45er
 * Fixture-Matrix ein und dokumentiert die Differenz zur SSoT
 * `isLipSyncIntentional()` getrennt nach:
 *
 *   falsePositives — Gate true, SSoT false
 *   falseNegatives — SSoT true, Gate false
 *   parity         — exact | broader | narrower | mixed
 *
 * Ändert jemand ein Gate, ohne diesen Vertrag anzufassen, wird der Test rot.
 */
import { describe, expect, it } from 'vitest';
import { isLipSyncIntentional, isLipSyncIntentionalRow } from '../lipSyncIntent';
import {
  LIPSYNC_INTENT_FIXTURES,
  toRow,
  type IntentFixtureScene,
} from './fixtures/lipSyncIntentMatrix';
import {
  INTENT_GATES,
  classifyParity,
  type Parity,
} from './fixtures/lipSyncIntentGates';

interface Frozen {
  parity: Parity;
  falsePositives: string[];
  falseNegativeCount: number;
}

/**
 * Eingefrorener Ist-Zustand (Stand v430.1 Schritt 1). Die false-positive
 * Mengen sind klein und stehen deshalb vollständig hier; die
 * false-negative Mengen sind über ihre Kardinalität fixiert und im Bericht
 * `docs/v430-1-intent-gate-parity.md` vollständig aufgeführt.
 */
const FROZEN: Record<string, Frozen> = {
  'scenecard-engine-migration': {
    parity: 'mixed',
    falsePositives: ['Lf-Dt-Ecs', 'Lf-Dt-Ess', 'Lf-Df-Ecs', 'Lf-Df-Ess', 'Lf-Du-Ecs', 'Lf-Du-Ess'],
    falseNegativeCount: 14,
  },
  'scenecard-native-dialogue-verbatim': {
    parity: 'mixed',
    falsePositives: ['Lf-Dt-End', 'Lf-Df-End', 'Lf-Du-End'],
    falseNegativeCount: 20,
  },
  'scenecard-dialog-preflight': {
    parity: 'mixed',
    falsePositives: ['Lf-Dt-Ecs', 'Lf-Dt-Ess', 'Lf-Df-Ecs', 'Lf-Df-Ess', 'Lf-Du-Ecs', 'Lf-Du-Ess'],
    falseNegativeCount: 14,
  },
  'scenecard-dialog-model-picker': {
    parity: 'mixed',
    falsePositives: ['Lf-Dt-Eauto', 'Lf-Dt-Ecs', 'Lf-Dt-Ess', 'Lf-Dt-End', 'Lf-Dt-Eu'],
    falseNegativeCount: 16,
  },
  'scenecard-dialog-studio-entry': {
    parity: 'mixed',
    falsePositives: ['Lf-Dt-Eauto', 'Lf-Dt-Ecs', 'Lf-Dt-Ess', 'Lf-Dt-End', 'Lf-Dt-Eu'],
    falseNegativeCount: 16,
  },
  'scenecard-dialog-studio-mount': {
    parity: 'mixed',
    falsePositives: ['Lf-Dt-Eauto', 'Lf-Dt-Ecs', 'Lf-Dt-Ess', 'Lf-Dt-End', 'Lf-Dt-Eu'],
    falseNegativeCount: 16,
  },
  'scenecard-lipsync-actions': {
    // v430.1 Schritt 2A — bewusst auf die SSoT umgestellt.
    parity: 'exact',
    falsePositives: [],
    falseNegativeCount: 0,
  },
  'dialogstudio-wants-lipsync': {
    // v430.1 Schritt 2B — bewusst auf die SSoT umgestellt.
    parity: 'exact',
    falsePositives: [],
    falseNegativeCount: 0,
  },
  'dialogstudio-force-cinematic': {
    parity: 'mixed',
    falsePositives: ['Lf-Dt-Ecs', 'Lf-Df-Ecs', 'Lf-Du-Ecs'],
    falseNegativeCount: 8,
  },
  'clipprogress-is-cinematic': {
    // v430.1 Schritt 2A — bewusst auf die SSoT umgestellt.
    parity: 'exact',
    falsePositives: [],
    falseNegativeCount: 0,
  },
  'clipprogress-should-be-lipsync': {
    // v430.1 Schritt 2A — bewusst auf die SSoT umgestellt.
    parity: 'exact',
    falsePositives: [],
    falseNegativeCount: 0,
  },
  'inlineplayer-needs-lipsync': {
    // v430.1 Schritt 2A — bewusst auf die SSoT umgestellt.
    parity: 'exact',
    falsePositives: [],
    falseNegativeCount: 0,
  },
  'inlineplayer-legacy-happyhorse-warn': {
    // v430.1 Schritt 2A — bewusst auf die SSoT umgestellt.
    parity: 'exact',
    falsePositives: [],
    falseNegativeCount: 0,
  },
  'clipstab-locks-user-duration': {
    parity: 'mixed',
    falsePositives: ['Lf-Dt-Ecs', 'Lf-Dt-Ess', 'Lf-Df-Ecs', 'Lf-Df-Ess', 'Lf-Du-Ecs', 'Lf-Du-Ess'],
    falseNegativeCount: 14,
  },
  'clipstab-poll-cinematic': {
    // v430.1 Schritt 2A — bewusst auf die SSoT umgestellt.
    parity: 'exact',
    falsePositives: [],
    falseNegativeCount: 0,
  },
  'preflight-dialog-checks': {
    parity: 'mixed',
    falsePositives: ['Lf-Dt-Eauto', 'Lf-Dt-Ecs', 'Lf-Dt-Ess', 'Lf-Dt-End', 'Lf-Dt-Eu'],
    falseNegativeCount: 16,
  },
  'pipelineprogress-cinematic-generating': {
    // v430.1 Schritt 2A — bewusst auf die SSoT umgestellt.
    parity: 'exact',
    falsePositives: [],
    falseNegativeCount: 0,
  },
  'generateall-needs-lipsync': {
    // v430.1 Schritt 2B — bewusst auf die SSoT umgestellt.
    parity: 'exact',
    falsePositives: [],
    falseNegativeCount: 0,
  },
  'mouthprobe-cinematic': {
    parity: 'mixed',
    falsePositives: ['Lf-Dt-Ecs', 'Lf-Df-Ecs', 'Lf-Du-Ecs'],
    falseNegativeCount: 20,
  },
};

function evaluate(predicate: (s: IntentFixtureScene) => boolean) {
  const falsePositives: string[] = [];
  const falseNegatives: string[] = [];
  for (const f of LIPSYNC_INTENT_FIXTURES) {
    const gate = predicate(f);
    const ssot = isLipSyncIntentional(f);
    if (gate && !ssot) falsePositives.push(f.id);
    if (!gate && ssot) falseNegatives.push(f.id);
  }
  return { falsePositives, falseNegatives };
}

describe('v430.1 — Fixture-Matrix', () => {
  it('deckt das volle Kreuzprodukt mit eindeutigen IDs ab', () => {
    expect(LIPSYNC_INTENT_FIXTURES).toHaveLength(45);
    expect(new Set(LIPSYNC_INTENT_FIXTURES.map((f) => f.id)).size).toBe(45);
  });

  it('SSoT: Toggle-Veto schlägt jeden Engine-Override', () => {
    const vetoed = LIPSYNC_INTENT_FIXTURES.filter((f) => f.lipSyncWithVoiceover === false);
    expect(vetoed).toHaveLength(15);
    expect(vetoed.every((f) => isLipSyncIntentional(f) === false)).toBe(true);
  });

  it('SSoT ist auf 26 der 45 Zeilen true', () => {
    expect(LIPSYNC_INTENT_FIXTURES.filter((f) => isLipSyncIntentional(f)).length).toBe(26);
  });

  it('camelCase- und snake_case-Resolver sind über die ganze Matrix deckungsgleich', () => {
    for (const f of LIPSYNC_INTENT_FIXTURES) {
      expect(isLipSyncIntentionalRow(toRow(f)), f.id).toBe(isLipSyncIntentional(f));
    }
  });
});

describe('v430.1 — Gate-Parität (2A umgestellt, Rest eingefroren)', () => {
  it('das Inventar enthält jedes eingefrorene Gate genau einmal', () => {
    const ids = INTENT_GATES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice().sort()).toEqual(Object.keys(FROZEN).slice().sort());
  });

  for (const gate of INTENT_GATES) {
    it(`${gate.id} (${gate.site}) hält die eingefrorene Differenz`, () => {
      const frozen = FROZEN[gate.id];
      const { falsePositives, falseNegatives } = evaluate(gate.predicate);
      expect(falsePositives).toEqual(frozen.falsePositives);
      expect(falseNegatives).toHaveLength(frozen.falseNegativeCount);
      expect(classifyParity(falsePositives, falseNegatives)).toBe(frozen.parity);
    });
  }

  it('genau die sieben v430.1-2A-Gates sind paritätisch zur SSoT', () => {
    const exact = INTENT_GATES.filter((g) => {
      const { falsePositives, falseNegatives } = evaluate(g.predicate);
      return classifyParity(falsePositives, falseNegatives) === 'exact';
    });
    expect(exact.map((g) => g.id).sort()).toEqual(
      [
        'clipprogress-is-cinematic',
        'clipprogress-should-be-lipsync',
        'clipstab-poll-cinematic',
        'inlineplayer-legacy-happyhorse-warn',
        'inlineplayer-needs-lipsync',
        'pipelineprogress-cinematic-generating',
        'scenecard-lipsync-actions',
        'dialogstudio-wants-lipsync',
        'generateall-needs-lipsync',
      ].sort(),
    );
  });

  it('die verbliebenen cinematic-sync-Gates verletzen das Toggle-Veto identisch', () => {
    const vetoBreakers = ['Lf-Dt-Ecs', 'Lf-Df-Ecs', 'Lf-Du-Ecs'];
    // v430.1 Schritt 2A/2B: die umgestellten Gates respektieren das Veto jetzt.
    for (const id of ['mouthprobe-cinematic']) {
      const gate = INTENT_GATES.find((g) => g.id === id)!;
      expect(evaluate(gate.predicate).falsePositives, id).toEqual(vetoBreakers);
    }
    for (const id of [
      'clipprogress-is-cinematic',
      'clipstab-poll-cinematic',
      'pipelineprogress-cinematic-generating',
      'inlineplayer-legacy-happyhorse-warn',
      'generateall-needs-lipsync',
    ]) {
      const gate = INTENT_GATES.find((g) => g.id === id)!;
      expect(evaluate(gate.predicate).falsePositives, id).toEqual([]);
    }
  });

  it('classifyParity unterscheidet broader, narrower und mixed', () => {
    expect(classifyParity([], [])).toBe('exact');
    expect(classifyParity(['a'], [])).toBe('broader');
    expect(classifyParity([], ['a'])).toBe('narrower');
    expect(classifyParity(['a'], ['b'])).toBe('mixed');
  });
});
