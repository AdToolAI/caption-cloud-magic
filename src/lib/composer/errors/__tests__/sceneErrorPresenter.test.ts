/**
 * v430 Schritt 6.3 — Vertrag des Fehler-Presenters.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  presentSceneError,
  extractProviderCode,
  NEUTRAL_SCENE_ERROR,
} from '../sceneErrorPresenter';

describe('presentSceneError', () => {
  it('returns kind=none for empty input', () => {
    for (const v of [null, undefined, '', '   ']) {
      const p = presentSceneError(v as any);
      expect(p.kind).toBe('none');
      expect(p.raw).toBe('');
      expect(p.autoRetryHint).toBe(false);
    }
  });

  it('maps official provider codes from [code]', () => {
    const p = presentSceneError('syncso_segments_FAILED: [generation_pipeline_failed] boom');
    expect(p.kind).toBe('known');
    expect(p.code).toBe('generation_pipeline_failed');
    expect(p.headline.de).toContain('Lip-Sync-Dienst');
    expect(p.raw).toBe('syncso_segments_FAILED: [generation_pipeline_failed] boom');
  });

  it('falls back to the syncso_ prefix when the provider code is unknown', () => {
    const p = presentSceneError('syncso_segments_FAILED: [totally_new_code] boom');
    expect(p.kind).toBe('known');
    expect(p.code).toBe('syncso');
    expect(p.headline.de).toContain('Lip-Sync-Dienst');
  });

  it('maps exact codes, prefixes and regex codes', () => {
    expect(presentSceneError('lipsync_canceled_by_user').kind).toBe('known');
    expect(presentSceneError('anchor_extra_person_detected: 2 faces').code).toBe('anchor_extra_person_detected');
    expect(presentSceneError('lipsync_pass_3_failed: timeout').code).toBe('lipsync_pass_3_failed');
    expect(presentSceneError('dialog_too_long_for_plate: 21s > 13s').kind).toBe('known');
  });

  it('matches delimited provider tokens anywhere in the raw text', () => {
    const p = presentSceneError('ModelArk create failed (400): InputImageSensitiveContentDetected — request rejected');
    expect(p.kind).toBe('known');
    expect(p.code).toBe('InputImageSensitiveContentDetected');
  });

  it('never guesses: unknown text gets the neutral fallback plus raw', () => {
    const raw = 'some_completely_unmapped_backend_error: 17';
    const p = presentSceneError(raw);
    expect(p.kind).toBe('unknown');
    expect(p.headline).toEqual(NEUTRAL_SCENE_ERROR);
    expect(p.raw).toBe(raw);
  });

  it('does not reinterpret substrings that are not delimited codes', () => {
    // "failed" is an exact code, but not as part of a longer word/phrase.
    expect(presentSceneError('failed').kind).toBe('known');
    expect(presentSceneError('handshake failed unexpectedly').kind).toBe('unknown');
  });

  it('keeps raw untouched (no truncation, no normalisation)', () => {
    const raw = '  Weird MiXeD Case Error: [Generation_Timeout] ' + 'x'.repeat(400) + '  ';
    const p = presentSceneError(raw);
    expect(p.raw).toBe(raw.trim());
    expect(p.raw.length).toBeGreaterThan(400);
  });

  it('exposes autoRetryHint as display-only information', () => {
    expect(presentSceneError('auto-retry: pass 2').autoRetryHint).toBe(true);
    expect(presentSceneError('lipsync_pass_2_failed').autoRetryHint).toBe(true);
    expect(presentSceneError('watchdog_stuck_lipsync_refunded').autoRetryHint).toBe(true);
    expect(presentSceneError('anchor_extra_person_detected').autoRetryHint).toBe(false);
  });

  it('localises every entry in de/en (es optional)', () => {
    const samples = [
      'syncso_x: [generation_timeout]',
      'anchor_missing_speakers',
      'twoshot_audio_prep_failed: x',
      'unmapped',
    ];
    for (const s of samples) {
      const p = presentSceneError(s);
      expect(p.headline.de.length).toBeGreaterThan(3);
      expect(p.headline.en.length).toBeGreaterThan(3);
    }
  });
});

describe('extractProviderCode', () => {
  it('extracts only bracketed codes', () => {
    expect(extractProviderCode('a [generation_timeout] b')).toBe('generation_timeout');
    expect(extractProviderCode('no brackets here')).toBeNull();
    expect(extractProviderCode('[123]')).toBeNull();
  });
});

describe('Presenter bleibt pure', () => {
  it('imports nothing from UI, DB or i18n runtime', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/composer/errors/sceneErrorPresenter.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"]@\/components/);
    expect(src).not.toMatch(/from ['"]@\/integrations/);
    expect(src).not.toMatch(/from ['"]@\/hooks/);
    expect(src.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\btx\(/);
  });
});
