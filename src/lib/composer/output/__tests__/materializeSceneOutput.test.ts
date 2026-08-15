import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Deno edge-function module, imported here as plain TS.
import { materializeCompatibilityOutput } from '../../../../../supabase/functions/_shared/materialize-scene-output.ts';
import { resolveSceneOutput } from '../resolveSceneOutput';

const FN_DIR = resolve(process.cwd(), 'supabase/functions');

/**
 * v430 Step 1 — `materializeCompatibilityOutput` is the ONLY new writer of
 * `composer_scenes.clip_url`. These tests pin both the behaviour and the writer inventory.
 */
describe('materializeCompatibilityOutput', () => {
  it('base mode mirrors the plate into clip_url and drops a stale processed result', () => {
    expect(materializeCompatibilityOutput('base', { baseUrl: 'plate.mp4' })).toEqual({
      base_video_url: 'plate.mp4',
      processed_video_url: null,
      clip_url: 'plate.mp4',
    });
  });

  it('processed mode keeps the plate and mirrors the muxed result', () => {
    expect(
      materializeCompatibilityOutput('processed', { baseUrl: 'plate.mp4', processedUrl: 'muxed.mp4' }),
    ).toEqual({
      base_video_url: 'plate.mp4',
      processed_video_url: 'muxed.mp4',
      clip_url: 'muxed.mp4',
    });
  });

  it('processed mode without a mux result falls back to the plate', () => {
    expect(materializeCompatibilityOutput('processed', { baseUrl: 'plate.mp4' }).clip_url).toBe('plate.mp4');
  });

  it('clear mode nulls the whole triple', () => {
    expect(materializeCompatibilityOutput('clear')).toEqual({
      base_video_url: null,
      processed_video_url: null,
      clip_url: null,
    });
  });

  it('blank strings are treated as absent', () => {
    expect(materializeCompatibilityOutput('base', { baseUrl: '   ' }).clip_url).toBeNull();
  });

  it('round-trips through the resolver (writer/reader agreement)', () => {
    const written = materializeCompatibilityOutput('processed', {
      baseUrl: 'plate.mp4',
      processedUrl: 'muxed.mp4',
    });
    const read = resolveSceneOutput({ ...written, lip_sync_status: 'applied' });
    expect(read.effectiveUrl).toBe('muxed.mp4');
    expect(read.baseUrl).toBe('plate.mp4');
    expect(read.isLipsynced).toBe(true);
  });
});

describe('clip_url writer inventory (v430 Step 1)', () => {
  const FINALIZATION_POINTS = [
    // Lip-Sync finalization (migrated in first half of Schritt 1)
    'remotion-webhook/index.ts',
    '_shared/scene-run-begin.ts',
    '_shared/scene-hard-reset.ts',
    // Additional productive writers closed by the Schritt 1 audit
    'compose-video-clips/index.ts',
    'generate-composer-image-scene/index.ts',
    '_shared/autopilotComposerBridge.ts',
  ];

  // v431 G2.2 — diese Writer materialisieren Output nicht mehr im Client-Code,
  // sondern atomar in der DB (Row Lock + Run-/Generations-Guard). Sie duerfen
  // deshalb weder `materializeCompatibilityOutput()` noch direkte
  // Output-Spalten-Zuweisungen enthalten.
  const ATOMIC_DB_WRITERS = [
    { rel: 'generate-talking-head/index.ts', rpc: 'composer_finalize_talking_head' },
    // v431 G3.2.1 — Plate-Apply laeuft atomar ueber composer_finalize_plate_scene.
    { rel: 'compose-clip-webhook/index.ts', rpc: 'composer_finalize_plate_scene' },
    // v431 G3.2.2 — Sync-Segment-Apply laeuft atomar ueber
    // composer_apply_sync_segment_result (Contract §6: kein Client-Materialize).
    { rel: 'sync-so-webhook/index.ts', rpc: 'composer_apply_sync_segment_result' },
    // v431 RS3 — der Lip-Sync-Reset setzt Output-Spalten atomar in der DB
    // (Ledger-Cancel + Reset + Marker in einem Commit), nicht mehr im Client.
    {
      rel: 'reset-lipsync-scene/index.ts',
      rpc: 'composer_reset_lipsync_with_attempt_cancellation',
    },
  ];

  it('every migrated finalization point writes through the single writer', () => {
    for (const rel of FINALIZATION_POINTS) {
      const src = readFileSync(resolve(FN_DIR, rel), 'utf8');
      expect(src, rel).toMatch(/materializeCompatibilityOutput\(/);
    }
  });

  it('atomic DB writers materialize output through their guarded RPC only', () => {
    for (const { rel, rpc } of ATOMIC_DB_WRITERS) {
      const src = readFileSync(resolve(FN_DIR, rel), 'utf8');
      expect(src, rel).toContain(rpc);
      expect(src, rel).not.toMatch(/materializeCompatibilityOutput\(/);
      for (const field of ['clip_url', 'base_video_url', 'processed_video_url']) {
        expect(src, `${rel} must not assign ${field} directly`).not.toMatch(
          new RegExp(`${field}\\s*:`),
        );
      }
    }
  });


  it('no output-field mutation happens outside the materializer in the migrated files', () => {
    // These are the output columns that must always be written as a triple.
    const OUTPUT_FIELDS = ['clip_url', 'base_video_url', 'processed_video_url'];

    for (const rel of FINALIZATION_POINTS) {
      const src = readFileSync(resolve(FN_DIR, rel), 'utf8');

      // Any line that assigns one of the output columns must be inside a
      // materializeCompatibilityOutput(...) spread. We detect the most common
      // literal assignment shapes; dynamic builders are caught by the second
      // assertion below.
      const directAssignments = src
        .split('\n')
        .map((l, idx) => ({ line: idx + 1, text: l }))
        .filter(({ text }) => {
          const trimmed = text.trim();
          // Match literal output-column assignments: `clip_url:`, `"clip_url":`, `clip_url =`, etc.
          const isOutputFieldLine = OUTPUT_FIELDS.some(
            (field) =>
              new RegExp(`^["']?${field}["']?\\s*:`).test(trimmed) ||
              new RegExp(`^["']?${field}["']?\\s*=`).test(trimmed),
          );
          if (!isOutputFieldLine) return false;
          // Allow the spread line that carries the materializer result.
          if (/\.\.\.materializeCompatibilityOutput\(/.test(text)) return false;
          // Allow comment-only lines.
          if (/^\s*\/\//.test(text)) return false;
          return true;
        });

      expect(directAssignments, `${rel}: ${JSON.stringify(directAssignments)}`).toEqual([]);
    }
  });

  it('the materializer is the single source of output materialization', () => {
    const root = process.cwd();
    // Any file exporting something with the same responsibility would be a second truth.
    const hits: string[] = [];
    for (const rel of [
      'supabase/functions/_shared/materialize-scene-output.ts',
    ]) {
      const src = readFileSync(resolve(root, rel), 'utf8');
      if (/export function materializeCompatibilityOutput/.test(src)) hits.push(rel);
    }
    expect(hits).toEqual(['supabase/functions/_shared/materialize-scene-output.ts']);
  });

  it('plate_attempts.clip_url is explicitly out of scope (different table)', () => {
    const src = readFileSync(resolve(FN_DIR, '_shared/plate-attempt.ts'), 'utf8');
    // The plate_attempts table is a log for the watchdog, not composer_scenes.
    expect(src).toMatch(/plate_attempts/);
    expect(src).not.toMatch(/from\s*["']composer_scenes["']/);
  });
});
