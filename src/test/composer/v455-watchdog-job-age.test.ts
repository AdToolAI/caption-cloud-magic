/**
 * V455 — Statischer Vertrag: Watchdog-Alter kommt aus dem Pipeline-Job,
 * nicht aus `composer_scenes.updated_at`; Recovery verwirft veraltete Tupel;
 * Green-Net löst keinen identischen Auto-Retry mehr aus.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fn = (p: string) => readFileSync(resolve(process.cwd(), 'supabase/functions', p), 'utf8');

describe('V455 — Watchdog-Zeitautorität', () => {
  const src = fn('qa-watchdog/index.ts');

  it('wählt Base-Video-Kandidaten über composer_pipeline_jobs.updated_at', () => {
    const block = src.slice(src.indexOf('4b. Stale composer master-clip'), src.indexOf('4c.'));
    expect(block).toContain('.from("composer_pipeline_jobs")');
    expect(block).toContain('.eq("stage", "base_video")');
    expect(block).toContain('.eq("status", "dispatched")');
    expect(block).toContain('.lt("updated_at", tenMinAgo)');
    // Szenen-Zeitstempel darf die Frist nicht mehr steuern.
    expect(block).not.toContain('.eq("clip_status", "generating")\n      .is("clip_url", null)\n      .lt("updated_at", tenMinAgo)');
  });

  it('reicht das vollständige Tupel als candidates durch', () => {
    expect(src).toContain('candidates');
    expect(src).toContain('pipeline_job_id: job?.id ?? null');
    expect(src).toContain('external_job_id: job?.external_job_id ?? null');
    expect(src).toContain('run_id: job?.run_id ?? null');
  });

  it('behält die 10-Minuten-Policy', () => {
    expect(src).toContain('tenMinAgo');
  });
});

describe('V455 — Recovery-Race-Guard', () => {
  const src = fn('recover-stuck-composer-clip/index.ts');

  it('prüft Run, Plate-Generation, Prediction und Job-Status vor jeder Mutation', () => {
    expect(src).toContain('candidateStillCurrent');
    expect(src).toContain('active_run_id');
    expect(src).toContain('plate_generation');
    expect(src).toContain('replicate_prediction_id');
    expect(src).toContain('v455_stale_candidate_discarded');
  });

  it('führt den Guard vor Refund/Fail aus', () => {
    const guardIdx = src.indexOf('candidateStillCurrent(sb, scene, candidate)');
    const refundIdx = src.indexOf('await refundScene(sb, scene)');
    expect(guardIdx).toBeGreaterThan(0);
    expect(guardIdx).toBeLessThan(refundIdx);
  });

  it('erzeugt keinen neuen Provider-Dispatch', () => {
    expect(src).not.toContain('predictions.create');
  });
});

describe('V455 — Green-Net ist terminal', () => {
  const src = fn('compose-clip-webhook/index.ts');

  it('schließt Provider-Eingabefilter vom Auto-Retry aus', () => {
    expect(src).toContain("if (classifyProviderRejection(predError) !== 'none') return false;");
  });

  it('persistiert Klasse und echten Providergrund', () => {
    expect(src).toContain('PROVIDER_INPUT_FILTER_CLASS');
    expect(src).toContain('const rejectionClass = classifyProviderRejection(enrichedError);');
    expect(src).toContain("String(enrichedError ?? '').slice(0, 480)");
  });

  it('lässt den idempotenten Refund-Pfad unverändert', () => {
    expect(src).toContain("supabase.rpc('refund_ai_video_credits'");
    expect(src).toContain("_write_id: 'ccw:failed'");
  });
});
