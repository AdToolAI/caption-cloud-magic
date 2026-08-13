import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  legacyClipReadyEquivalent,
  legacyClipReadyEquivalentRow,
  legacyClipFailedEquivalentRow,
  sceneState,
} from '@/lib/composer/sceneState';

/**
 * v430 Schritt 5D — Paritätstests für die Backend-Reader-Migration.
 *
 * Wahrheit: `clip_status === 'ready'` (alt) ⇔ legacyClipReadyEquivalent (neu).
 * Die Vorwärts-Bridge erzeugt `clip_status = 'ready'` für plate_ready,
 * audio_prep, audio_ready, lipsync_* und complete — sowie für `failed`,
 * solange ein Output vorhanden ist.
 */

const READY_STATES = [
  'plate_ready',
  'audio_prep',
  'audio_ready',
  'lipsync_dispatched',
  'lipsync_running',
  'lipsync_muxing',
  'complete',
] as const;

const NOT_READY_STATES = ['idle', 'plate_queued', 'plate_rendering', 'canceled'] as const;

describe('v430 5D — legacyClipReadyEquivalent', () => {
  it.each(READY_STATES)('%s zählt als legacy-ready', (state) => {
    expect(legacyClipReadyEquivalent({ state, hasEffectiveOutput: true })).toBe(true);
    expect(legacyClipReadyEquivalent({ state, hasEffectiveOutput: false })).toBe(true);
  });

  it.each(NOT_READY_STATES)('%s zählt nie als legacy-ready', (state) => {
    expect(legacyClipReadyEquivalent({ state, hasEffectiveOutput: true })).toBe(false);
  });

  it('failed + Output = ready (Legacy-Parität), failed ohne Output = nicht ready', () => {
    expect(legacyClipReadyEquivalent({ state: 'failed', hasEffectiveOutput: true })).toBe(true);
    expect(legacyClipReadyEquivalent({ state: 'failed', hasEffectiveOutput: false })).toBe(false);
  });
});

describe('v430 5D — exklusive Klassifikation Ready/Failed', () => {
  it('failed mit Output ist ready und NICHT failed', () => {
    const row = { pipeline_state: 'failed', clip_url: 'https://cdn/x.mp4' };
    expect(legacyClipReadyEquivalentRow(row)).toBe(true);
    expect(legacyClipFailedEquivalentRow(row)).toBe(false);
  });

  it('failed ohne Output ist failed und NICHT ready', () => {
    const row = { pipeline_state: 'failed', clip_url: null };
    expect(legacyClipReadyEquivalentRow(row)).toBe(false);
    expect(legacyClipFailedEquivalentRow(row)).toBe(true);
  });

  it('Legacy-Zeilen ohne pipeline_state werden abgeleitet', () => {
    const row = { clip_status: 'ready', clip_url: 'https://cdn/x.mp4' };
    expect(sceneState(row)).toBe('plate_ready');
    expect(legacyClipReadyEquivalentRow(row)).toBe(true);
    expect(legacyClipFailedEquivalentRow(row)).toBe(false);
  });

  it('processed_video_url zählt als Output', () => {
    const row = { pipeline_state: 'failed', processed_video_url: 'https://cdn/p.mp4' };
    expect(legacyClipReadyEquivalentRow(row)).toBe(true);
  });
});

describe('v430 5D — Client/Server-Parität der Helper', () => {
  const backend = fs.readFileSync(
    path.join(process.cwd(), 'supabase/functions/_shared/scene-state.ts'),
    'utf8',
  );
  const client = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/composer/sceneState.ts'),
    'utf8',
  );

  it('beide Seiten exportieren dieselben Helper', () => {
    for (const name of [
      'legacyClipReadyEquivalent',
      'legacyClipReadyEquivalentRow',
      'legacyClipFailedEquivalentRow',
    ]) {
      expect(backend).toContain(`export function ${name}`);
      expect(client).toContain(`export function ${name}`);
    }
  });
});

describe('v430 5D — migrierte Reader lesen keine clip_status-Zweige mehr', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

  it('modelark-poll fragt pipeline_state ab (kein Legacy-OR)', () => {
    const src = read('supabase/functions/modelark-poll/index.ts');
    expect(src).toContain('.eq("pipeline_state", "plate_rendering")');
    expect(src).not.toContain('.eq("clip_status", "generating")');
  });

  it('composer-cancel-scene nutzt sceneState()', () => {
    const src = read('supabase/functions/composer-cancel-scene/index.ts');
    expect(src).toContain('LIVE_CLIP_STATES.has(sceneState(s))');
    expect(src).not.toContain('LIVE_CLIP.has(s.clip_status)');
  });

  it('composer-cancel-project nutzt sceneState()', () => {
    const src = read('supabase/functions/composer-cancel-project/index.ts');
    expect(src).toContain('LIVE_CLIP_STATES.has(sceneState(s))');
    expect(src).not.toContain("cs === \"pending\" || cs === \"generating\"");
  });

  it('beide Cancel-Pfade nutzen dieselbe Live-Zustandsmenge inkl. plate_queued', () => {
    const setLine = (p: string) =>
      read(p)
        .split('\n')
        .find((l) => l.includes('const LIVE_CLIP_STATES'))
        ?.trim();
    const scene = setLine('supabase/functions/composer-cancel-scene/index.ts');
    const project = setLine('supabase/functions/composer-cancel-project/index.ts');
    expect(scene).toBeDefined();
    expect(project).toBe(scene);
    expect(scene).toContain('plate_queued');
  });
});

describe('v430 5D — Bridge-Parität der abbrechbaren Zustände', () => {
  const LIVE = new Set(['idle', 'plate_queued', 'plate_rendering']);

  it('pending + active_run_id ist plate_queued und bleibt abbrechbar', () => {
    const row = { clip_status: 'pending', active_run_id: 'run-1' };
    expect(sceneState(row)).toBe('plate_queued');
    expect(LIVE.has(sceneState(row))).toBe(true);
  });

  it('pending ohne run_id ist idle und bleibt abbrechbar', () => {
    expect(sceneState({ clip_status: 'pending' })).toBe('idle');
    expect(LIVE.has(sceneState({ clip_status: 'pending' }))).toBe(true);
  });

  it('generating ist plate_rendering und bleibt abbrechbar', () => {
    expect(sceneState({ clip_status: 'generating' })).toBe('plate_rendering');
  });

  it('ready/complete sind nicht abbrechbar', () => {
    expect(LIVE.has(sceneState({ clip_status: 'ready', clip_url: 'u' }))).toBe(false);
    expect(LIVE.has(sceneState({ pipeline_state: 'complete' }))).toBe(false);
  });
});

