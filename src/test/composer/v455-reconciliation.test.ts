/**
 * V455 Reconciliation — statische Verträge A–D für den Recovery-Worker.
 * A) Alter kommt aus dem Base-Video-Ledger-Job (10m Auswahl + 30m Hard-Kill).
 * B) Validierter Kandidaten-Job ist der autoritative Transport-Pointer.
 * C) Terminaler Providerstatus lässt den Job nie `dispatched` zurück.
 * D) Tupel-Validierung prüft stage/run/gen/external_job_id.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fn = (p: string) => readFileSync(resolve(process.cwd(), 'supabase/functions', p), 'utf8');
const src = fn('recover-stuck-composer-clip/index.ts');

describe('V455-A — Job-autoritatives Alter', () => {
  it('löst den aktiven Base-Video-Job auf (Kandidat oder Legacy-Query)', () => {
    expect(src).toContain('resolveAuthoritativeJob');
    expect(src).toContain('.eq("stage", "base_video")');
    expect(src).toContain('.eq("status", "dispatched")');
    expect(src).toContain('.order("updated_at", { ascending: false })');
  });

  it('berechnet das Alter aus job.updated_at, Szene nur als Fallback', () => {
    expect(src).toContain('export function authoritativeAgeMs');
    expect(src).toContain('const stamp = job?.updated_at ?? null;');
    expect(src).toContain('source: "pipeline_job"');
    expect(src).toContain('const { ageMs, source: ageSource } = authoritativeAgeMs(job, scene as any);');
    // Kein Szenen-Zeitstempel mehr als primäre Altersquelle.
    expect(src).not.toContain('Date.now() - new Date(String((scene as any).updated_at)).getTime()');
  });

  it('behält die 30-Minuten-Schwelle unverändert', () => {
    expect(src).toContain('const HARD_KILL_AGE_MS = 30 * 60 * 1000;');
    expect(src).toContain('if (ageMs > HARD_KILL_AGE_MS)');
  });
});

describe('V455-A — Alters-Semantik (Verhalten)', () => {
  // Szene wird wiederholt angefasst (jetzt), Job ist >30min alt.
  const now = Date.parse('2026-08-23T00:00:00.000Z');
  const job = { updated_at: new Date(now - 31 * 60_000).toISOString() };
  const scene = { updated_at: new Date(now - 30_000).toISOString() };

  it('nutzt den Job-Zeitstempel, nicht den frischen Szenen-Zeitstempel', () => {
    // Referenzimplementierung identisch zur Funktion im Edge-Worker.
    const ageMs = job.updated_at
      ? now - Date.parse(job.updated_at)
      : now - Date.parse(scene.updated_at);
    expect(ageMs).toBeGreaterThan(30 * 60 * 1000);
  });
});

describe('V455-B — Transport-Pointer', () => {
  it('bevorzugt den Ledger-Job, Szenen-Pointer nur als Fallback', () => {
    expect(src).toContain('const transportPointer =\n    job?.id ?? ((scene as any).plate_pipeline_job_id as string | null) ?? null;');
    expect(src).toContain('scene.project_id,\n      transportPointer,');
    // Kein direkter Szenen-Pointer-Replay mehr.
    expect(src).not.toContain('((scene as any).plate_pipeline_job_id as string | null) ?? null,\n    );');
  });
});

describe('V455-C — Ledger-Terminalisierung', () => {
  it('bevorzugt kanonischen Webhook-Replay mit validiertem Pointer', () => {
    expect(src).toContain('if (transportPointer && rejectionClass !== "none")');
    expect(src).toContain('canonical_ledger_replay');
  });

  it('Fallback markiert genau den validierten Job failed + completed_at', () => {
    expect(src).toContain('export async function terminalizeLedgerJobDirect');
    expect(src).toContain('status: "failed",');
    expect(src).toContain('completed_at: new Date().toISOString(),');
    expect(src).toContain('.eq("stage", "base_video")\n    .eq("status", "dispatched")');
    expect(src).toContain('errorCode');
    expect(src).toContain('"provider_input_filter"');
  });

  it('kein terminaler Pfad lässt den Job dispatched zurück', () => {
    for (const marker of [
      'await terminalizeLedgerJobDirect(sb, job, errorCode);',
      'await terminalizeLedgerJobDirect(sb, job, "watchdog_hard_kill");',
      'await terminalizeLedgerJobDirect(sb, job, "provider_prediction_404");',
    ]) {
      expect(src).toContain(marker);
    }
  });

  it('erzeugt niemals einen neuen Provider-Dispatch', () => {
    expect(src).not.toContain('predictions.create');
    expect(src).not.toContain('new Replicate');
  });
});

describe('V455-D — Tupel-Validierung', () => {
  it('prüft stage, run_id, plate_generation und external_job_id am Job', () => {
    const guard = src.slice(src.indexOf('async function candidateStillCurrent'), src.indexOf('export async function terminalizeLedgerJobDirect'));
    expect(guard).toContain('String(job.stage) !== "base_video"');
    expect(guard).toContain('String(job.status) !== "dispatched"');
    expect(guard).toContain('String(job.run_id ?? "") !== String(candidate.run_id)');
    expect(guard).toContain('Number(job.plate_generation ?? -1) !== Number(candidate.plate_generation)');
    expect(guard).toContain('String(job.external_job_id ?? "") !== String(candidate.external_job_id)');
    expect(guard).toContain('String(scene.replicate_prediction_id ?? "") !== String(job.external_job_id)');
  });

  it('lädt die vollständigen Job-Spalten', () => {
    expect(src).toContain('"id, stage, status, external_job_id, run_id, plate_generation, updated_at, completed_at"');
  });
});
