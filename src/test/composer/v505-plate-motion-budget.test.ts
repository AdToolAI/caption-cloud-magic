/**
 * V505 — Aktionen und Bewegung im Lip-Sync-Plate.
 *
 * The plate prompt builder lives inside the edge function, so this guard is a
 * source-contract test: character motion must be requested, the camera must
 * stay locked, plate mouths must stay closed, and the camera-motion stripper
 * must not eat character motion.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(process.cwd(), 'supabase/functions/compose-video-clips/index.ts'),
  'utf8',
);

describe('V505 plate motion budget', () => {
  it('keeps the camera locked (frozen invariant I.4)', () => {
    expect(SRC).toContain('LOCKED static camera mounted on a tripod for the entire shot');
    expect(SRC).toContain('LOCKED static camera on a fixed tripod for the entire clip');
    for (const kw of [
      'camera cut',
      'shot change',
      'zoom in',
      'zoom out',
      'push in',
      'pull out',
      'dolly',
      'pan',
      'tilt',
      'whip pan',
      'reframe',
      'second camera',
      'picture-in-picture',
    ]) {
      expect(SRC).toContain(kw);
    }
  });

  it('no longer freezes bodies, heads or positions', () => {
    expect(SRC).not.toContain('heads stay steady');
    expect(SRC).not.toContain("every person's position in the frame stay identical");
    expect(SRC).not.toContain("the subject's position and size in the frame stay identical");
    expect(SRC).not.toContain('head nodding, nodding head');
    expect(SRC).not.toContain('rhythmic head bobbing');
  });

  it('requests the assigned character action and binds it to the tracking budget', () => {
    expect(SRC).toContain('MANDATORY per-character action');
    expect(SRC).toContain('walking from one position to another inside the frame');
    expect(SRC).toContain('stays fully inside the frame');
    expect(SRC).toContain('person walking out of frame');
    expect(SRC).toContain('mouth covered by hand');
  });

  it('keeps plate mouths closed so the lipsync model owns the mouth', () => {
    expect(SRC).toContain('idle mouth motion, idle jaw motion');
    expect(SRC).toContain('mouths softly closed in a natural listening pose');
  });

  it('strips only camera motion, never character motion', () => {
    const stripper = SRC.slice(
      SRC.indexOf('const stripCameraMotionForPlate'),
      SRC.indexOf('const buildCinematicSyncMasterPrompt'),
    );
    expect(stripper.length).toBeGreaterThan(200);
    // camera-scoped patterns only
    expect(stripper).not.toContain('/\\b(?:camera\\s+)?move(?:s|ment)?');
    expect(stripper).not.toContain('/\\btilt(?:s|ing)?\\s+(?:up|down)\\b/gi');
    expect(stripper).toContain('camera\\s+move(?:s|ment)?');
    expect(stripper).toContain('camera\\s+tilt(?:s|ing)?');

    // Behavioural check: rebuild the pattern list and prove character motion survives.
    const patterns = [
      /\bslow(?:\s+|-)(?:push[- ]?in|zoom[- ]?in|dolly[- ]?in|pull[- ]?in|creep[- ]?in)\b/gi,
      /\bpush[- ]?in(?:ning)?\b/gi,
      /\bzoom[- ]?in(?:ning)?\b/gi,
      /\bdolly(?:\s+(?:in|out|forward|back(?:wards?)?))?\b/gi,
      /\bcamera\s+move(?:s|ment)?\s+(?:closer|in|forward|toward(?:s)?)\b/gi,
      /\bcamera\s+tilt(?:s|ing)?\s+(?:up|down)\b/gi,
      /\bpan(?:s|ning)?\s+(?:left|right|across)\b/gi,
    ];
    const strip = (t: string) => patterns.reduce((acc, re) => acc.replace(re, ''), t);

    const kept =
      'Samuel starts slightly left of center and naturally walks right during the scene as he speaks. Kay turns back to the group. Sarah tilts her head down briefly and moves closer to Samuel.';
    const out = strip(kept);
    expect(out).toContain('walks right');
    expect(out).toContain('turns back to the group');
    expect(out).toContain('tilts her head down');
    expect(out).toContain('moves closer to Samuel');

    const cameraText = 'slow push-in, camera moves closer, dolly in, camera tilts up, pans left';
    const camOut = strip(cameraText);
    expect(camOut).not.toMatch(/push-in|dolly in|pans left|camera moves closer|camera tilts up/);
  });
});
