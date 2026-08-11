/**
 * Guards the canonical sample briefing against parser drift: if the detectors
 * in the briefing pipeline change, this test fails before customers copy a
 * template that no longer parses.
 */

import { describe, expect, it } from 'vitest';
import { BRIEFING_TEMPLATES } from '@/lib/video-composer/briefingTemplate';

const LANGS = ['de', 'en', 'es'] as const;

describe('briefing template', () => {
  it.each(LANGS)('%s: declares an explicit total length of 30 seconds', (lang) => {
    const t = BRIEFING_TEMPLATES[lang];
    expect(t).toMatch(/^(?:Länge|Length|Duración):\s*30\s*(?:Sekunden|seconds|segundos)$/m);
  });

  it.each(LANGS)('%s: declares an explicit scene count of 3', (lang) => {
    const t = BRIEFING_TEMPLATES[lang];
    expect(t).toMatch(/^(?:Szenen|Scenes|Escenas):\s*3$/m);
  });

  it.each(LANGS)('%s: per-scene durations add up to the total', (lang) => {
    const t = BRIEFING_TEMPLATES[lang];
    const durations = [...t.matchAll(/^(?:Dauer|Duration|Duración):\s*(\d+)\s*(?:Sekunden|seconds|segundos)$/gm)]
      .map((m) => Number(m[1]));
    expect(durations).toHaveLength(3);
    expect(durations.reduce((a, b) => a + b, 0)).toBe(30);
  });

  it.each(LANGS)('%s: every cast and location reference uses an @-mention', (lang) => {
    const t = BRIEFING_TEMPLATES[lang];
    const mentions = new Set([...t.matchAll(/@[a-z][a-z0-9-]*/g)].map((m) => m[0]));
    // 2 speakers + 1 location, each used in the roster and in the scenes.
    expect(mentions.size).toBe(3);
    expect([...mentions].every((m) => t.split(m).length - 1 >= 2)).toBe(true);
  });

  it.each(LANGS)('%s: dialogue lines are speaker-prefixed', (lang) => {
    const t = BRIEFING_TEMPLATES[lang];
    const turns = [...t.matchAll(/^@[a-z][a-z0-9-]*:\s*".+"$/gm)];
    expect(turns.length).toBe(3);
  });

  it.each(LANGS)('%s: camera lines only use manifest shot vocabulary', (lang) => {
    const t = BRIEFING_TEMPLATES[lang];
    const framings = ['extreme-wide', 'wide', 'medium-wide', 'medium', 'medium-close-up', 'close-up', 'extreme-close-up'];
    const angles = ['eye-level', 'low-angle', 'high-angle', 'dutch-angle', 'over-the-shoulder', 'three-quarter', 'profile', 'frontal'];
    const movements = ['static', 'slow-push-in', 'push-in', 'pull-out', 'pan-left', 'pan-right', 'tilt-up', 'tilt-down', 'tracking', 'handheld', 'orbital', 'crane-up', 'crane-down', 'lean-in'];
    const lightings = ['natural', 'soft-window', 'hard-window', 'golden-hour', 'blue-hour', 'low-key', 'high-key', 'rim', 'backlit', 'practical', 'studio-softbox', 'neon', 'overcast'];
    const allowed = new Set([...framings, ...angles, ...movements, ...lightings]);

    const cameraLines = [...t.matchAll(/^(?:Kamera|Camera|Cámara):\s*(.+)$/gm)].map((m) => m[1]);
    expect(cameraLines).toHaveLength(3);
    for (const line of cameraLines) {
      for (const token of line.split(',').map((x) => x.trim())) {
        expect(allowed.has(token), `unknown shot token: ${token}`).toBe(true);
      }
    }
  });
});
