import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * DebugLipsync — Root-cause isolation view for N≥2 ghost-mouthing.
 *
 * Read-only. Renders the 4 diagnostic layers side-by-side from
 * `composer_scenes.dialog_shots` (JSONB — already populated by the
 * current pipeline; no edge-function changes required):
 *
 *   1. master_plate         — raw Hailuo/Kling output (dialog_shots.source_clip_url)
 *   2. preclip[speaker]     — per-speaker isolated pre-clip (passes[i].preclip_url)
 *   3. pass_output[speaker] — Sync.so output per pass (passes[i].output_url)
 *   4. final_muxed          — final composite (dialog_shots.final_url || scene.clip_url)
 *
 * See mem://architecture/lipsync/v208-rootcause-isolation for the
 * diagnostic matrix.
 */

type PassState = {
  idx?: number;
  speaker_idx?: number | null;
  character_id?: string | null;
  input_url?: string | null;
  preclip_url?: string | null;
  output_url?: string | null;
  status?: string | null;
  job_id?: string | null;
};

type DialogShots = {
  version?: number;
  status?: string;
  source_clip_url?: string | null;
  final_url?: string | null;
  passes?: PassState[];
  total_passes?: number;
  multi_pass?: boolean;
};

type SceneRow = {
  id: string;
  project_id: string;
  order_index: number;
  clip_url: string | null;
  lip_sync_source_clip_url: string | null;
  lip_sync_status: string | null;
  dialog_shots: DialogShots | null;
  dialog_turns: unknown;
};

const cellCls =
  "bg-neutral-900 border border-neutral-800 rounded-md overflow-hidden flex flex-col";

function VideoCell({
  title,
  subtitle,
  url,
}: {
  title: string;
  subtitle?: string;
  url: string | null | undefined;
}) {
  return (
    <div className={cellCls}>
      <div className="px-3 py-2 border-b border-neutral-800">
        <div className="text-xs uppercase tracking-wider text-amber-300/80">
          {title}
        </div>
        {subtitle ? (
          <div className="text-[11px] text-neutral-400 truncate">{subtitle}</div>
        ) : null}
      </div>
      <div className="flex-1 bg-black flex items-center justify-center min-h-[220px]">
        {url ? (
          <video
            src={url}
            controls
            playsInline
            muted
            className="w-full h-full max-h-[360px] object-contain"
          />
        ) : (
          <span className="text-neutral-500 text-sm">— no url —</span>
        )}
      </div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 text-[11px] text-neutral-400 hover:text-amber-300 truncate border-t border-neutral-800"
        >
          {url.slice(-72)}
        </a>
      ) : null}
    </div>
  );
}

export default function DebugLipsync() {
  const { sceneId } = useParams<{ sceneId: string }>();
  const [scene, setScene] = useState<SceneRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sceneId) return;
      const { data, error } = await supabase
        .from("composer_scenes")
        .select(
          "id, project_id, order_index, clip_url, lip_sync_source_clip_url, lip_sync_status, dialog_shots, dialog_turns"
        )
        .eq("id", sceneId)
        .maybeSingle();
      if (cancelled) return;
      if (error) setError(error.message);
      else setScene(data as unknown as SceneRow);
    })();
    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  if (!sceneId) {
    return (
      <div className="p-8 text-neutral-200">
        Provide a scene id: <code>/debug/lipsync/&lt;sceneId&gt;</code>
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-red-400">Error: {error}</div>;
  }

  if (!scene) {
    return <div className="p-8 text-neutral-400">Loading scene…</div>;
  }

  const ds = scene.dialog_shots ?? null;
  const passes = ds?.passes ?? [];
  const plateUrl = ds?.source_clip_url ?? scene.lip_sync_source_clip_url ?? null;
  const finalUrl = ds?.final_url ?? scene.clip_url ?? null;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-amber-300">
              Lip-Sync Root-Cause Isolation
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Scene <code className="text-neutral-200">{scene.id.slice(0, 8)}</code>
              {" · "}status{" "}
              <span className="text-neutral-200">{ds?.status ?? scene.lip_sync_status ?? "—"}</span>
              {" · "}passes{" "}
              <span className="text-neutral-200">{passes.length}</span>
            </p>
          </div>
          <Link to="/composer" className="text-xs text-neutral-400 hover:text-amber-300">
            ← back
          </Link>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <VideoCell
            title="1 · Master Plate (raw Hailuo/Kling)"
            subtitle="Pre-Sync.so. If non-speaker mouths move here → model issue."
            url={plateUrl}
          />
          <VideoCell
            title="4 · Final Muxed"
            subtitle="Post-composite. If clean at 1–3 but breaks here → mux issue."
            url={finalUrl}
          />
        </section>

        <section>
          <h2 className="text-sm uppercase tracking-wider text-neutral-400 mb-3">
            Per-Pass Layers (one column per speaker)
          </h2>
          {passes.length === 0 ? (
            <div className="text-neutral-500 text-sm">No passes recorded.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {passes.map((p, i) => (
                <div key={i} className="space-y-3">
                  <div className="text-xs text-neutral-400">
                    Pass {p.idx ?? i} · speaker {p.speaker_idx ?? "?"} ·{" "}
                    <span className="text-neutral-200">{p.status ?? "—"}</span>
                  </div>
                  <VideoCell
                    title={`2 · Preclip · speaker ${p.speaker_idx ?? i}`}
                    subtitle="Isolated pre-clip. If mouth moves outside this speaker's turn → clipping issue."
                    url={p.preclip_url ?? null}
                  />
                  <VideoCell
                    title={`3 · Pass Output · speaker ${p.speaker_idx ?? i}`}
                    subtitle="Sync.so return. If bleed appears here but not in preclip → Sync.so issue."
                    url={p.output_url ?? null}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-neutral-900 border border-neutral-800 rounded-md p-4 text-xs text-neutral-300">
          <div className="font-semibold text-amber-300 mb-2">Diagnostic Matrix</div>
          <ul className="space-y-1 list-disc list-inside">
            <li>
              Non-speaker mouth in <b>1 · Master Plate</b> → Hailuo/Kling
              adherence → phase 2A (provider A/B, then prompt).
            </li>
            <li>
              Mouth movement in <b>2 · Preclip</b> outside that speaker's turn
              → pre-clip segmentation → phase 2B.
            </li>
            <li>
              Clean preclip, bleed only in <b>3 · Pass Output</b> → Sync.so
              → phase 2C (provider ticket).
            </li>
            <li>
              Clean 1–3, artifact appears in <b>4 · Final Muxed</b> →
              render-sync-segments-audio-mux → phase 2D.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
