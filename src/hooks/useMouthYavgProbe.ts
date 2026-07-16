/**
 * v248 — useMouthYavgProbe
 * ------------------------------------------------------------------
 * When a Cinematic-Sync scene's lipsync pipeline finishes (each pass
 * has status='done' and an output_url), we sample the muxed pass
 * output on the CLIENT (canvas) to detect motion-noop lipsyncs.
 *
 * Each pass is probed AT MOST ONCE per session; results are stored
 * server-side by `report-lipsync-motion-probe`, and the pass is
 * flagged with `motion_noop=true` when yavg < threshold.
 *
 * We probe the per-pass output (not the final muxed clip) because:
 *   - each pass is a mouth-centered pre-clip (v247), so mouth is at
 *     roughly (0.5, 0.60) in the frame → no landmark tracking needed
 *   - it isolates the actual Sync.so output before compositor mux
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ComposerScene } from '@/types/video-composer';
import { computeMouthYavg } from '@/lib/composer/lipsync/computeMouthYavg';

interface PassEntry {
  idx: number;
  status?: string;
  output_url?: string | null;
  job_id?: string | null;
  motion_noop?: boolean;
  yavg_probed_at?: string | null;
  preclip_crop?: { faceShareInCrop?: number; anchor?: string } | null;
}

/** Sessions-scoped set of "scene_id::pass_idx" strings we've already probed. */
const probedThisSession = new Set<string>();

export function useMouthYavgProbe(scene: ComposerScene | null | undefined) {
  const inflightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!scene) return;
    const isCinematic = scene.engineOverride === 'cinematic-sync';
    if (!isCinematic) return;

    const dialogShotsState =
      (scene as unknown as { dialogShots?: { passes?: PassEntry[]; status?: string } })
        .dialogShots ??
      (scene as unknown as { dialog_shots?: { passes?: PassEntry[]; status?: string } })
        .dialog_shots ??
      null;
    if (!dialogShotsState) return;
    const passes = Array.isArray(dialogShotsState.passes) ? dialogShotsState.passes : [];
    if (passes.length === 0) return;

    for (const pass of passes) {
      if (!pass || pass.status !== 'done') continue;
      if (!pass.output_url) continue;
      if (pass.motion_noop === true) continue;      // already flagged server-side
      if (pass.yavg_probed_at) continue;             // already probed server-side
      const key = `${scene.id}::${pass.idx}`;
      if (probedThisSession.has(key)) continue;
      if (inflightRef.current.has(key)) continue;
      inflightRef.current.add(key);

      // Mouth roughly centered in v247 mouth-anchored preclip.
      const mouthCx = 0.5;
      const mouthCy = 0.6;

      (async () => {
        try {
          const result = await computeMouthYavg({
            videoUrl: pass.output_url as string,
            mouthCx,
            mouthCy,
            samples: 12,
          });
          probedThisSession.add(key);

          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          if (!token) return;

          await supabase.functions.invoke('report-lipsync-motion-probe', {
            body: {
              scene_id: scene.id,
              job_id: pass.job_id ?? null,
              pass_idx: pass.idx,
              yavg: result.yavg,
              yavg_normalized: result.yavgNormalized,
              frames: result.frames,
              method: result.method,
            },
          });
        } catch (err) {
          // Best-effort probe. Do not surface to user.
          console.warn(
            `[useMouthYavgProbe] scene=${scene.id} pass=${pass.idx} failed: ${(err as Error).message}`,
          );
        } finally {
          inflightRef.current.delete(key);
        }
      })();
    }
  }, [scene]);
}
