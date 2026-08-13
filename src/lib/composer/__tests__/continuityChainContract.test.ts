/**
 * v430 Step 4 — structural contract tests for the continuity chain.
 *
 * These pin the invariants that live in SQL and in the edge functions, so a
 * later refactor cannot silently reintroduce raw `clip_url` chaining, a
 * run-start staleness propagation, or a finalization that reads the scene's
 * CURRENT continuity binding instead of the immutable run snapshot.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const migrationSql = readdirSync(resolve(root, 'supabase/migrations'))
  .map((f) => read(`supabase/migrations/${f}`))
  .join('\n');

describe('SQL contract', () => {
  it('the staleness trigger ignores clears (run start) and non-final outputs', () => {
    const m = migrationSql.match(/CREATE TRIGGER trg_continuity_staleness[\s\S]*?EXECUTE FUNCTION/i);
    expect(m).toBeTruthy();
    const def = m![0];
    expect(def).toMatch(/NEW\.clip_url IS NOT NULL/i);
    expect(def).toMatch(/IS DISTINCT FROM OLD\.clip_url/i);
    expect(def).toMatch(/scene_output_is_final/i);
  });

  it('finality mirrors the pure helper: lip-sync needs the processed output', () => {
    expect(migrationSql).toMatch(/FUNCTION[\s\S]{0,80}scene_output_is_final/i);
    expect(migrationSql).toMatch(/scene_lipsync_intentional/i);
    expect(migrationSql).toMatch(/cinematic-sync/);
    expect(migrationSql).toMatch(/sync-segments/);
    expect(migrationSql).toMatch(/native-dialogue/);
  });

  it('staleness is set, not latched (IS DISTINCT FROM, no OR continuity_stale)', () => {
    const fn = migrationSql.match(/FUNCTION public\.propagate_continuity_staleness[\s\S]*?\$\$/i);
    expect(fn).toBeTruthy();
    expect(fn![0]).toMatch(/IS DISTINCT FROM/i);
    expect(fn![0]).not.toMatch(/continuity_stale\s+OR/i);
    // Propagation follows the real dependency, never the position.
    expect(fn![0]).toMatch(/continuity_source_scene_id/i);
  });

  it('first_rendered_at is stamped once and never cleared', () => {
    expect(migrationSql).toMatch(/COALESCE\(\s*OLD\.first_rendered_at/i);
  });
});

describe('continuity-chain.ts', () => {
  const src = read('supabase/functions/_shared/continuity-chain.ts');

  it('reads the resolved output instead of raw clip_url', () => {
    expect(src).toMatch(/resolveSceneOutput/);
    expect(src).toMatch(/effectiveUrl/);
    expect(src).not.toMatch(/predecessorClipUrl: predReady \? pred\.clip_url/);
  });

  it('requires the predecessor output to be FINAL before chaining', () => {
    expect(src).toMatch(/isSceneOutputFinal/);
  });

  it('never writes reference_image_url', () => {
    expect(src).not.toMatch(/reference_image_url/);
  });
});

describe('finalization + reset paths', () => {
  it('the plate webhook stamps the rendered source from the run snapshot', () => {
    const src = read('supabase/functions/compose-clip-webhook/index.ts');
    expect(src).toMatch(/continuityRenderedPatch\(/);
    expect(src).not.toMatch(/continuity_rendered_source_clip_url:\s*[a-zA-Z]/);
  });

  it('the snapshot reader never falls back to the scene\'s current binding', () => {
    const src = read('supabase/functions/_shared/continuity-run-snapshot.ts');
    expect(src).toMatch(/plate_attempts/);
    expect(src).toMatch(/composer_scene_runs/);
    expect(src).not.toMatch(/from\("composer_scenes"\)/);
  });

  it('hard reset propagates staleness, beginSceneRun does not', () => {
    expect(read('supabase/functions/_shared/scene-hard-reset.ts')).toMatch(
      /propagate_continuity_staleness/,
    );
    expect(read('supabase/functions/_shared/scene-run-begin.ts')).not.toMatch(
      /propagate_continuity_staleness|continuity_stale/,
    );
  });

  it('reset-lipsync-scene does NOT propagate staleness (plate is not final)', () => {
    const dir = 'supabase/functions/reset-lipsync-scene/index.ts';
    expect(read(dir)).not.toMatch(/propagate_continuity_staleness/);
  });

  it('the materializer stays a pure patch builder — no cross-scene write', () => {
    const src = read('supabase/functions/_shared/materialize-scene-output.ts');
    expect(src).not.toMatch(/continuity_stale/);
    expect(src).not.toMatch(/\.from\(/);
  });
});

describe('dispatch binding', () => {
  const src = read('supabase/functions/compose-video-clips/index.ts');

  it('records the continuity binding before the provider job is registered', () => {
    expect(src).toMatch(/continuity_source_clip_url: usedContinuity \? continuityClipUrl : null/);
    expect(src).toMatch(/continuity_source_scene_id: usedContinuity \? continuitySourceSceneId : null/);
  });

  it('lip-sync scenes never bind a continuity source', () => {
    expect(src).toMatch(/const usedContinuity =\s*\n?\s*!sceneWantsLipSync/);
  });
});
