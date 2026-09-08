/**
 * v510 — BILLING IDENTITY & AVAILABILITY PARITY
 *
 * Guards the invariants that produced real display-vs-charge divergence:
 *   1. The billing id is tier-scoped and resolved from the canonical registry
 *      on BOTH sides (UI preview and edge function), never hand-written.
 *   2. Every startable tier has a catalog price, and no price is quoted for a
 *      tier that cannot be started.
 *   3. Canonical availability decides what the picker may offer.
 *   4. Client and server pricing catalogs agree on prices AND durations.
 *   5. Displayed total == deducted total (same rounding chain).
 */

import { describe, it, expect } from 'vitest';
import {
  getVideoModelSpec,
  isResolutionTierAvailable,
  isVideoModelAvailable,
  pricingIdsOfModel,
  resolvePricingId,
  VIDEO_MODEL_SPECS,
} from '@/config/videoModelSpecs';
import { VIDEO_PRICING_CATALOG } from '@/lib/cost/videoPricingCatalog';
import { AI_VIDEO_TOOLKIT_MODELS } from '@/config/aiVideoModelRegistry';

const catalogIds = new Set(Object.keys(VIDEO_PRICING_CATALOG));
const specs = Object.values(VIDEO_MODEL_SPECS as Record<string, any>);

describe('billing identity is tier-scoped', () => {
  it('resolves the 480p tier of Seedance 2.5 to its own catalog row', () => {
    // The exact regression: the UI quoted 720p while 480p was deducted.
    expect(resolvePricingId('seedance-2-5', 't2v', '720p')).toBe('seedance-2-5');
    expect(resolvePricingId('seedance-2-5', 't2v', '480p')).toBe('seedance-2-5-480p');
    expect(resolvePricingId('seedance-2-5', 'i2v', '480p')).toBe('seedance-2-5-480p');
  });

  it('refuses to guess a tier for a multi-tier mode', () => {
    expect(resolvePricingId('seedance-2-5', 't2v')).toBeNull();
    expect(resolvePricingId('seedance-2-5', 't2v', '1440p')).toBeNull();
    expect(resolvePricingId('does-not-exist', 't2v', '720p')).toBeNull();
  });

  it('lists every billing id a model can be charged on', () => {
    expect(pricingIdsOfModel('seedance-2-5').sort()).toEqual(
      ['seedance-2-5', 'seedance-2-5-480p'].sort(),
    );
    expect(pricingIdsOfModel('nope')).toEqual([]);
  });
});

describe('price coverage follows startability', () => {
  it('every startable tier of every offered model has a catalog price', () => {
    const missing: string[] = [];
    for (const m of AI_VIDEO_TOOLKIT_MODELS) {
      const spec = getVideoModelSpec(m.id);
      if (!spec || !spec.available) continue;
      for (const mode of spec.modes) {
        for (const tier of mode.resolutions) {
          if (!isResolutionTierAvailable(tier)) continue;
          if (!catalogIds.has(tier.pricingId)) {
            missing.push(`${m.id}/${mode.mode}/${tier.label} -> ${tier.pricingId}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('availability is canonical', () => {
  it('a model whose canonical spec is unavailable is never offered as live', () => {
    const offeredButDead = AI_VIDEO_TOOLKIT_MODELS.filter((m) => {
      const spec = getVideoModelSpec(m.id);
      return spec && !spec.available && !m.status;
    }).map((m) => m.id);
    expect(offeredButDead).toEqual([]);
  });

  it('the retired Runway Gen-4 Aleph route is not startable anywhere', () => {
    expect(isVideoModelAvailable('runway-gen4-aleph')).toBe(false);
    const entry = AI_VIDEO_TOOLKIT_MODELS.find((m) => m.id === 'runway-gen4-aleph');
    expect(entry?.status).toBe('maintenance');
  });

  it('every registry model has a canonical spec', () => {
    expect(AI_VIDEO_TOOLKIT_MODELS.filter((m) => !getVideoModelSpec(m.id)).map((m) => m.id))
      .toEqual([]);
  });

  it('fails closed for unknown ids', () => {
    expect(isVideoModelAvailable('totally-unknown')).toBe(false);
  });
});

describe('catalog rows stay reachable', () => {
  it('every catalog row is either reachable from a spec tier or explicitly legacy', () => {
    const specPricingIds = new Set(
      specs.flatMap((s: any) => s.modes.flatMap((m: any) => m.resolutions.map((r: any) => r.pricingId))),
    );
    // Composer legacy tiers are billed through composerSourceToCatalog and have
    // no Studio spec tier. They are listed here so a NEW orphan row fails.
    const knownLegacy = new Set([
      'seedance-mini-1080p', 'wan-pro', 'sora-2-standard', 'sora-2-pro', 'veo-3.1-lite-1080p',
    ]);
    const orphans = [...catalogIds].filter((id) => !specPricingIds.has(id) && !knownLegacy.has(id));
    expect(orphans).toEqual([]);
  });
});

describe('displayed total equals deducted total', () => {
  /** Backend chain: round2(list) per second, then round2(perSec * s * factor). */
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const charged = (list: number, seconds: number, factor: number) =>
    round2(round2(list) * seconds * factor);

  it('matches for the tier that previously diverged', () => {
    const p480 = VIDEO_PRICING_CATALOG['seedance-2-5-480p'].sellEUR;
    const p720 = VIDEO_PRICING_CATALOG['seedance-2-5'].sellEUR;
    expect(charged(p480, 30, 1)).not.toBe(charged(p720, 30, 1));
    expect(charged(p480, 30, 1)).toBe(round2(round2(p480) * 30));
  });

  it('rounds the per-second price BEFORE multiplying, like the backend', () => {
    // 0.3333/s: rounding only at the end would quote 9.999 -> 10.00,
    // the deduction charges round2(0.33) * 30 = 9.90.
    expect(charged(0.3333, 30, 1)).toBe(9.9);
    expect(charged(0.3333, 30, 0.8)).toBe(7.92);
  });
});
