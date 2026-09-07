import { describe, it, expect } from 'vitest';
import {
  VIDEO_MODEL_SPECS,
  VIDEO_MODEL_ALIASES,
  ALIAS_SOURCE_FAMILY,
  VIDEO_MODEL_CANDIDATES,
  getVideoModelCandidate,
  resolveRouteIdentity,
  isSingleProviderSlug,
  parityKeyOf,
  getVideoModelSpec,
  getModeSpec,
  isResolutionTierAvailable,
  resolveVideoModelId,
  resolveGenerationMode,
  validateCapability,
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
    expect(spec!.supersededBy).toBeUndefined();
    expect(spec!.supersededByCandidate).toBe('runway-aleph-2');
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

  it('unverified successors live in the candidate registry, not in the canonical specs', () => {
    for (const id of ['runway-aleph-2', 'seedance-2-0-mini', 'ltx-2-5-fast', 'happyhorse-1-1', 'wan-3-0']) {
      expect(getVideoModelSpec(id), `${id} must not be a canonical spec`).toBeUndefined();
      const candidate = getVideoModelCandidate(id);
      expect(candidate, `${id} missing from candidate registry`).toBeDefined();
      expect(candidate!.unknowns.length).toBeGreaterThan(0);
      expect(candidate!.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it('candidates are never startable through the canonical lookup', () => {
    for (const candidate of VIDEO_MODEL_CANDIDATES) {
      expect(getVideoModelSpec(candidate.id)).toBeUndefined();
      expect(VIDEO_MODEL_ALIASES[candidate.id]).toBeUndefined();
    }
  });

  it('candidate slugs, when present, are single concrete slugs', () => {
    for (const candidate of VIDEO_MODEL_CANDIDATES) {
      if (!candidate.providerModelSlug) continue;
      expect(isSingleProviderSlug(candidate.providerModelSlug), candidate.id).toBe(true);
    }
  });

  it('route-verified locked specs stay locked and carry an audit trail', () => {
    for (const id of ['hailuo-h3']) {
      const spec = getVideoModelSpec(id);
      expect(spec, `${id} missing`).toBeDefined();
      expect(spec!.available, `${id} must stay locked`).toBe(false);
      expect(startableTiers(id), `${id} must have no startable tier`).toHaveLength(0);
      expect(spec!.verificationSourceUrl).toMatch(/^https:\/\//);
      expect(spec!.verificationNotes.length).toBeGreaterThan(20);
    }
  });

  it('no canonical spec documents a value as UNKNOWN and asserts it structurally', () => {
    for (const spec of VIDEO_MODEL_SPECS) {
      const notes = spec.verificationNotes.toUpperCase();
      expect(notes.includes('UNBEKANNT') || notes.includes('UNKNOWN'), `${spec.id} keeps UNKNOWN values in a canonical spec`).toBe(false);
    }
  });

  it('providerModelSlug is always exactly one concrete slug', () => {
    for (const spec of VIDEO_MODEL_SPECS) {
      expect(isSingleProviderSlug(spec.providerModelSlug), `${spec.id}: composite slug`).toBe(true);
      for (const m of spec.modes) {
        if (m.providerModelSlug) {
          expect(isSingleProviderSlug(m.providerModelSlug), `${spec.id}/${m.mode}: composite slug`).toBe(true);
        }
        const identity = resolveRouteIdentity(spec, m.mode);
        expect(identity.providerModelSlug).toBeTruthy();
        expect(identity.apiRoute).toBeTruthy();
        expect(identity.region).toBeTruthy();
      }
    }
  });

  it('parity identity carries the executed slug', () => {
    const spec = getVideoModelSpec('wan-2-7-standard')!;
    expect(parityKeyOf(spec, 't2v', '720p').providerModelSlug).toBe('wan-video/wan-2.7-t2v');
    expect(parityKeyOf(spec, 'i2v', '720p').providerModelSlug).toBe('wan-video/wan-2.7-i2v');
  });

  it('Wan 2.7 t2v and i2v keep distinct route identities', () => {
    for (const id of ['wan-2-7-standard', 'wan-2-7-pro']) {
      const spec = getVideoModelSpec(id)!;
      const t2v = resolveRouteIdentity(spec, 't2v');
      const i2v = resolveRouteIdentity(spec, 'i2v');
      expect(t2v.providerModelSlug).toBe('wan-video/wan-2.7-t2v');
      expect(i2v.providerModelSlug).toBe('wan-video/wan-2.7-i2v');
      expect(t2v.providerModelSlug).not.toBe(i2v.providerModelSlug);
    }
  });

  it('every new (non-grandfathered) tier without smoke test is unavailable', () => {
    for (const spec of VIDEO_MODEL_SPECS) {
      for (const m of spec.modes) {
        for (const tier of m.resolutions) {
          if (tier.grandfathered || tier.smokeTest) continue;
          expect(tier.available, `${spec.id}/${m.mode}/${tier.label} new tier must be locked`).toBe(false);
        }
      }
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

  it('Hailuo 2.3 declares no end-frame input anywhere (route has no last_frame_image)', () => {
    for (const id of ['hailuo-standard', 'hailuo-pro']) {
      const spec = getVideoModelSpec(id)!;
      expect(spec.modes.some((m) => m.mode === 'firstLast')).toBe(false);
      for (const m of spec.modes) {
        expect(m.inputs.lastFrame, `${id}/${m.mode}`).toBeFalsy();
      }
    }
  });

  it('an end image on Hailuo 2.3 resolves to a mode the spec does not have, so the gate rejects it', () => {
    for (const id of ['hailuo-standard', 'hailuo-pro']) {
      const spec = getVideoModelSpec(id)!;
      const endOnly = resolveGenerationMode(id, { hasLastFrame: true });
      expect(getModeSpec(spec, endOnly)).toBeUndefined();
      expect(validateCapability({ modelId: id, mode: endOnly })?.field).toBe('mode');

      const paired = resolveGenerationMode(id, { hasFirstFrame: true, hasLastFrame: true });
      expect(getModeSpec(spec, paired)).toBeUndefined();
      expect(validateCapability({ modelId: id, mode: paired })?.field).toBe('mode');
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
