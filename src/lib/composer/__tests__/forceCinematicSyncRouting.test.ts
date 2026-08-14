/**
 * v430.1 Gate 9 — Routing-No-Op-Nachweis für `forceCinematicSync`.
 *
 * Gate 9 in `SceneDialogStudio.tsx` entscheidet, ob ein Dialog in die
 * PROFESSIONAL Cinematic-Sync-Kette geht oder in den Inline-VO-Pfad
 * (`handleGenerateInline()`).
 *
 * Bei der Umstellung des INTENT-FRAGMENTS auf die SSoT `isLipSyncIntentional()`
 * darf sich das tatsächlich erreichbare Routing NICHT verändern. Grund:
 * `buttonIntendsLipSync` ist für jeden Single-Speaker-Fall mit Portrait bereits
 * true und dominiert damit den gesamten OR-Ausdruck.
 *
 * Dieser Test bildet BEIDE Fassungen als reine Prädikate nach und beweist die
 * Gleichheit über das volle 45-Zeilen-Fixture-Kreuzprodukt — statt die
 * No-Op-Eigenschaft nur zu behaupten.
 *
 * WICHTIG: Das vollständige `forceCinematicSync` ist bewusst BREITER als die
 * SSoT. Das ist kein Paritätsverstoss, sondern der v232-Vertrag
 * (Single-Speaker-Symmetrie): der Button-Klick selbst zählt als Opt-in.
 */
import { describe, it, expect } from 'vitest';
import { isLipSyncIntentional } from '@/lib/video-composer/lipSyncIntent';
import {
  LIPSYNC_INTENT_FIXTURES,
  type IntentFixtureScene,
} from '@/lib/video-composer/__tests__/fixtures/lipSyncIntentMatrix';

interface RoutingInput {
  scene: IntentFixtureScene;
  blockCount: number;
  allHavePortraits: boolean;
  renderAsSeparateScenes: boolean;
}

/** Spiegel von `buttonIntendsLipSync` — in beiden Fassungen identisch. */
function buttonIntendsLipSync(i: RoutingInput): boolean {
  return (
    (i.blockCount === 1 && i.allHavePortraits) ||
    (i.blockCount >= 2 && i.allHavePortraits && !i.renderAsSeparateScenes)
  );
}

/** ALT: Intent-Fragment als direkter Feld-Read (Stand vor v430.1 Gate 9). */
function forceCinematicSyncAlt(i: RoutingInput): boolean {
  return (
    i.blockCount === 1 &&
    i.allHavePortraits &&
    (i.scene.engineOverride === 'cinematic-sync' ||
      i.scene.lipSyncWithVoiceover === true ||
      buttonIntendsLipSync(i))
  );
}

/** NEU: Intent-Fragment aus der SSoT (Stand nach v430.1 Gate 9). */
function forceCinematicSyncNeu(i: RoutingInput): boolean {
  return (
    i.blockCount === 1 &&
    i.allHavePortraits &&
    (isLipSyncIntentional(i.scene) || buttonIntendsLipSync(i))
  );
}

/**
 * Der frühe Guard in `SceneDialogStudio.tsx:1452`: 1 Sprecher ohne Portrait
 * führt zu Toast + `return`, bevor Gate 9 überhaupt ausgewertet wird.
 */
function gateIsReached(i: RoutingInput): boolean {
  return !(i.blockCount === 1 && !i.allHavePortraits);
}

const BLOCK_COUNTS = [1, 2, 4];
const PORTRAITS = [true, false];
const SEPARATE = [true, false];

function allRoutingInputs(): RoutingInput[] {
  const rows: RoutingInput[] = [];
  for (const scene of LIPSYNC_INTENT_FIXTURES) {
    for (const blockCount of BLOCK_COUNTS) {
      for (const allHavePortraits of PORTRAITS) {
        for (const renderAsSeparateScenes of SEPARATE) {
          rows.push({ scene, blockCount, allHavePortraits, renderAsSeparateScenes });
        }
      }
    }
  }
  return rows;
}

const scene = (
  overrides: Partial<IntentFixtureScene> = {},
): IntentFixtureScene => ({ id: 'probe', ...overrides });

describe('v430.1 Gate 9 — forceCinematicSync Routing-No-Op', () => {
  it('Alt- und Neu-Fassung liefern über das volle Kreuzprodukt identisches Routing', () => {
    const inputs = allRoutingInputs();
    // 45 Intent-Fixtures × 3 Blockzahlen × 2 Portrait-Zustände × 2 SRS-Toggles
    expect(inputs.length).toBe(45 * 3 * 2 * 2);

    const divergences = inputs.filter(
      (i) => forceCinematicSyncAlt(i) !== forceCinematicSyncNeu(i),
    );
    expect(divergences.map((d) => `${d.scene.id}/b${d.blockCount}`)).toEqual([]);
  });

  it('auch auf die tatsächlich erreichbaren Fälle beschränkt bleibt das Routing identisch', () => {
    const reachable = allRoutingInputs().filter(gateIsReached);
    expect(reachable.length).toBeGreaterThan(0);
    for (const i of reachable) {
      expect(forceCinematicSyncNeu(i), `${i.scene.id}/b${i.blockCount}`).toBe(
        forceCinematicSyncAlt(i),
      );
    }
  });

  // ── Explizite Routing-Matrix aus dem Abnahmevertrag ──────────────────────

  it('1 Sprecher + Portrait + Toggle AUS → Cinematic-Sync (via buttonIntendsLipSync)', () => {
    const i: RoutingInput = {
      scene: scene({ lipSyncWithVoiceover: false, engineOverride: 'cinematic-sync' }),
      blockCount: 1,
      allHavePortraits: true,
      renderAsSeparateScenes: false,
    };
    // Toggle-Veto: die SSoT sagt "kein Intent" …
    expect(isLipSyncIntentional(i.scene)).toBe(false);
    // … das Routing bleibt trotzdem Cinematic-Sync, in BEIDEN Fassungen.
    expect(forceCinematicSyncAlt(i)).toBe(true);
    expect(forceCinematicSyncNeu(i)).toBe(true);
  });

  it('1 Sprecher + Portrait + sync-segments → Routing unverändert Cinematic-Sync', () => {
    const i: RoutingInput = {
      scene: scene({ engineOverride: 'sync-segments' }),
      blockCount: 1,
      allHavePortraits: true,
      renderAsSeparateScenes: false,
    };
    expect(forceCinematicSyncAlt(i)).toBe(true);
    expect(forceCinematicSyncNeu(i)).toBe(true);
  });

  it('1 Sprecher + Portrait + dialogMode → Routing unverändert Cinematic-Sync', () => {
    const i: RoutingInput = {
      scene: scene({ dialogMode: true }),
      blockCount: 1,
      allHavePortraits: true,
      renderAsSeparateScenes: false,
    };
    expect(forceCinematicSyncAlt(i)).toBe(true);
    expect(forceCinematicSyncNeu(i)).toBe(true);
  });

  it('1 Sprecher + Portrait + cinematic-sync → Routing unverändert Cinematic-Sync', () => {
    const i: RoutingInput = {
      scene: scene({ engineOverride: 'cinematic-sync' }),
      blockCount: 1,
      allHavePortraits: true,
      renderAsSeparateScenes: false,
    };
    expect(forceCinematicSyncAlt(i)).toBe(true);
    expect(forceCinematicSyncNeu(i)).toBe(true);
  });

  it('1 Sprecher ohne Portrait → früher Guard, Gate wird nie erreicht', () => {
    for (const f of LIPSYNC_INTENT_FIXTURES) {
      const i: RoutingInput = {
        scene: f,
        blockCount: 1,
        allHavePortraits: false,
        renderAsSeparateScenes: false,
      };
      expect(gateIsReached(i), f.id).toBe(false);
      // Selbst wenn das Gate ausgewertet würde, bliebe es in beiden Fassungen false.
      expect(forceCinematicSyncAlt(i)).toBe(false);
      expect(forceCinematicSyncNeu(i)).toBe(false);
    }
  });

  it('Multi-Speaker → Gate 9 ohne Einfluss, Routing läuft über useProfessionalSrs', () => {
    for (const f of LIPSYNC_INTENT_FIXTURES) {
      for (const blockCount of [2, 4]) {
        for (const allHavePortraits of PORTRAITS) {
          for (const renderAsSeparateScenes of SEPARATE) {
            const i: RoutingInput = {
              scene: f,
              blockCount,
              allHavePortraits,
              renderAsSeparateScenes,
            };
            expect(forceCinematicSyncAlt(i), `${f.id}/b${blockCount}`).toBe(false);
            expect(forceCinematicSyncNeu(i), `${f.id}/b${blockCount}`).toBe(false);
          }
        }
      }
    }
  });

  // ── Vertragsdokumentation: das GESAMTE Gate ist bewusst breiter ───────────

  it('das vollständige Gate ist bewusst breiter als die SSoT (v232-Vertrag)', () => {
    const broaderThanSsot = LIPSYNC_INTENT_FIXTURES.filter((f) => {
      const i: RoutingInput = {
        scene: f,
        blockCount: 1,
        allHavePortraits: true,
        renderAsSeparateScenes: false,
      };
      return forceCinematicSyncNeu(i) && !isLipSyncIntentional(f);
    });
    // Genau die Toggle-Veto-Fälle: buttonIntendsLipSync routet sie trotzdem.
    expect(broaderThanSsot.length).toBeGreaterThan(0);
    expect(broaderThanSsot.every((f) => f.lipSyncWithVoiceover === false)).toBe(true);
  });
});
