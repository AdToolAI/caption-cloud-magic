import { describe, it, expect } from 'vitest';
import {
  VIDEO_MODEL_SPECS,
  VIDEO_MODEL_ALIASES,
  ALIAS_SOURCE_FAMILY,
  getVideoModelSpec,
  getModeSpec,
  isResolutionTierAvailable,
  resolveVideoModelId,
} from '@/config/videoModelSpecs';

/**
 * Freshness audit invariants (Phase G of the 2026-09-07 route-by-route audit).
 * These lock in the drift fixes so a future edit cannot silently re-open them.
 */
describe('video model freshness audit — invariants', () => {
  const startableTiers = (id: string) => {
    const spec = getVideoModelSpec(id);
    if (!spec || !spec.available) return [];
    return spec.modes.flatMap((m) => m.resolutions.filter(isResolutionTierAvailable));
  };

  it('dead Runway route gen4_aleph is no longer startable but stays resolvable', () => {
    const spec = getVideoModelSpec('runway-gen4-aleph');
    expect(spec).toBeDefined();
    expect(spec!.releaseStatus).toBe('removed');
    expect(spec!.deprecated).toBe(true);
    expect(spec!.available).toBe(false);
    expect(spec!.supersededBy).toBe('runway-aleph-2');
    expect(startableTiers('runway-gen4-aleph')).toHaveLength(0);
  });

  it('no cross-family alias maps historical Aleph runs onto Aleph 2', () => {
    expect(VIDEO_MODEL_ALIASES['runway-gen4-aleph']).toBeUndefined();
    expect(resolveVideoModelId('runway-gen4-aleph')).toBe('runway-gen4-aleph');
  });

  it('every alias stays inside its own model family', () => {
    for (const [from, to] of Object.entries(VIDEO_MODEL_ALIASES)) {
      const target = getVideoModelSpec(to);
      expect(target, `alias target ${to} missing`).toBeDefined();
      const sourceFamily = ALIAS_SOURCE_FAMILY[from] ?? target!.family;
      expect(target!.family, `alias ${from} -> ${to} crosses families`).toBe(sourceFamily);
    }
  });

  it('newly prepared specs are locked: unavailable and without startable tiers', () => {
    for (const id of ['runway-aleph-2', 'hailuo-h3', 'seedance-2-0-mini', 'ltx-2-5-fast', 'happyhorse-1-1']) {
      const spec = getVideoModelSpec(id);
      expect(spec, `${id} missing`).toBeDefined();
      expect(spec!.available, `${id} must stay locked`).toBe(false);
      expect(startableTiers(id), `${id} must have no startable tier`).toHaveLength(0);
      expect(spec!.verificationSourceUrl).toMatch(/^https:\/\//);
      expect(spec!.verificationNotes.length).toBeGreaterThan(20);
    }
  });

  it('a model-level unavailable spec never exposes a startable tier', () => {
    for (const spec of VIDEO_MODEL_SPECS) {
      if (spec.available) continue;
      expect(startableTiers(spec.id), `${spec.id} unavailable but startable`).toHaveLength(0);
    }
  });

  it('newly added locked tiers on shipping models are not startable', () => {
    const cases: Array<[string, string]> = [
      ['kling-3', '4K'],
      ['seedance-pro', '1080p'],
      ['seedance-pro', '4K'],
    ];
    for (const [id, label] of cases) {
      const spec = getVideoModelSpec(id)!;
      const tiers = spec.modes.flatMap((m) => m.resolutions).filter((r) => r.label === label);
      expect(tiers.length, `${id}/${label} missing`).toBeGreaterThan(0);
      for (const tier of tiers) {
        expect(isResolutionTierAvailable(tier), `${id}/${label} must stay locked`).toBe(false);
      }
    }
  });

  it('shipping tiers of those models stay usable', () => {
    expect(startableTiers('kling-3').some((t) => t.label === '1080p')).toBe(true);
    expect(startableTiers('seedance-pro').some((t) => t.label === '720p')).toBe(true);
  });

  it('Hailuo 2.3 routes point at the slug the edge function really calls', () => {
    for (const id of ['hailuo-standard', 'hailuo-pro']) {
      const spec = getVideoModelSpec(id)!;
      expect(spec.providerModelSlug).toBe('minimax/hailuo-2.3');
    }
  });

  it('Hailuo 2.3 offers no end-frame mode (route has no last_frame_image)', () => {
    for (const id of ['hailuo-standard', 'hailuo-pro']) {
      const spec = getVideoModelSpec(id)!;
      const modes = spec.modes.map((m) => m.mode);
      expect(modes).not.toContain('firstLast');
      expect(modes).not.toContain('lastFrame');
      for (const m of spec.modes) {
        expect(m.inputs.lastFrame).toBeFalsy();
      }
    }
  });

  it('Kling Omni video-to-video reports no audio (mutually exclusive on that route)', () => {
    const v2v = getModeSpec(getVideoModelSpec('kling-omni')!, 'v2v')!;
    expect(v2v.audio).toBe(false);
    expect(v2v.constraints?.length ?? 0).toBeGreaterThan(0);
  });

  it('no spec claims a provider slug that the audit proved non-existent', () => {
    const dead = ['minimax/hailuo-02-pro', 'wan-video/wan-2.7-pro', 'alibaba/happyhorse-1.0-pro'];
    for (const spec of VIDEO_MODEL_SPECS) {
      for (const slug of dead) {
        expect(spec.providerModelSlug.split('|'), `${spec.id} uses dead slug ${slug}`).not.toContain(slug);
      }
    }
  });

  it('every spec carries an audit trail', () => {
    for (const spec of VIDEO_MODEL_SPECS) {
      expect(spec.verificationSourceUrl, `${spec.id} without source`).toMatch(/^https:\/\//);
      expect(spec.providerDocsVersion, `${spec.id} without docs version`).toBeTruthy();
    }
  });
});
