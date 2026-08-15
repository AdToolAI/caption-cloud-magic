import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * v431 G3.1f — Transport-Pointer-Guard.
 *
 * Der Vertrag ist statisch prüfbar: die drei Recovery-/Poll-Forwarder dürfen
 * ohne `pipeline_job_id` keinen Callback re-injizieren, und die Dispatcher
 * dürfen die Provider-Job-ID nur noch gemeinsam mit dem Pointer binden.
 */
const fn = (p: string) => readFileSync(resolve(process.cwd(), 'supabase/functions', p), 'utf8');

describe('v431 G3.1f — Re-Injection trägt immer den Transport-Pointer', () => {
  it('lipsync-watchdog: forwardet nur mit pipeline_job_id', () => {
    const src = fn('lipsync-watchdog/index.ts');
    expect(src).toContain('pipelineJobId: string | null');
    expect(src).toContain('&pipeline_job_id=${encodeURIComponent(pipelineJobId)}');
    expect(src).toContain('function: "lipsync-watchdog"');
    // Beide Aufrufstellen reichen den Slot-Pointer durch.
    const calls = src.match(/pipelineJobId: \(p\?\.pipeline_job_id as string \| null\) \?\? null/g) ?? [];
    expect(calls.length).toBe(2);
  });

  it('recover-stuck-composer-clip: Replay nur mit Pointer', () => {
    const src = fn('recover-stuck-composer-clip/index.ts');
    expect(src).toContain('plate_pipeline_job_id');
    expect(src).toContain('function: "recover-stuck-composer-clip"');
    expect(src).toContain('&pipeline_job_id=${encodeURIComponent(pipelineJobId)}');
  });

  it('modelark-poll: Notify nur mit Pointer', () => {
    const src = fn('modelark-poll/index.ts');
    expect(src).toContain('plate_pipeline_job_id');
    expect(src).toContain('function: "modelark-poll"');
    expect(src).toContain('&pipeline_job_id=${encodeURIComponent(pointer)}');
  });
});

describe('v431 G3.1f — Dispatcher binden Paar atomar', () => {
  it('compose-video-clips: kein Einzelschreiber von replicate_prediction_id', () => {
    const src = fn('compose-video-clips/index.ts');
    expect(src).toContain('bindPlateAttempt');
    // Kein direkter Legacy-Bind mehr in diesem Dispatcher.
    expect(src).not.toContain('bindLedgerExternalJob(');
    // Provider-IDs werden nur noch über den Paar-Helper geschrieben.
    const rawWrites = src.match(/replicate_prediction_id:\s*(prediction|fallbackPred|`\$\{MODELARK_JOB_PREFIX\})/g) ?? [];
    expect(rawWrites.length).toBe(0);
  });

  it('compose-dialog-segments: Pass-Bindung über das atomare RPC', () => {
    const src = fn('compose-dialog-segments/index.ts');
    expect(src).toContain('bindSyncPassAttempt');
    expect(src).not.toContain('bindLedgerExternalJob(');
  });

  it('Reset-Pfade setzen job_id und pipeline_job_id gemeinsam auf null', () => {
    for (const p of ['sync-so-webhook/index.ts', 'report-lipsync-motion-probe/index.ts']) {
      const src = fn(p);
      const jobNulls = (src.match(/job_id: null,/g) ?? []).length;
      const ptrNulls = (src.match(/pipeline_job_id: null,/g) ?? []).length;
      // `job_id: null,` matcht auch `pipeline_job_id: null,` — deshalb 2x.
      expect(jobNulls).toBe(ptrNulls * 2);
    }
  });
});
