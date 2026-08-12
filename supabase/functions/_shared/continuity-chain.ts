/**
 * continuity-chain (v426) — server-owned sequential rendering for seamless
 * scene transitions.
 *
 * Problem this solves: `compose-video-clips` dispatched every requested scene
 * in one pass. Scene N+1 therefore looked for the predecessor's clip while
 * that clip did not exist yet, found nothing and silently degraded to a hard
 * `match-cut` — although the UI promised a seamless transition.
 *
 * The fix is a queue, not a longer wait:
 *   1. On dispatch, a scene whose predecessor is rendering in the SAME batch
 *      is parked in `composer_continuity_queue` and marked `queued`.
 *   2. When the predecessor's clip lands (`compose-clip-webhook`), the parked
 *      scene is resumed with real continuity data:
 *        • `transitionFrameUrl` — last frame (image-to-video providers)
 *        • `previousClipUrl`    — the finished clip (video-reference models,
 *                                  e.g. Seedance 2.5 / Kling Omni)
 *   3. If the predecessor fails or the park expires, the scene is resumed
 *      anyway — with continuity downgraded to `match-cut`, never stuck.
 *
 * The chain NEVER writes `reference_image_url`: that column is the v400
 * identity anchor for lip-sync and stays structurally out of reach.
 */

import { ensureTransitionFrame } from "./transition-frame.ts";

const PARK_TTL_MINUTES = 15;

export interface QueuedScenePayload {
  projectId: string;
  visualStyle?: string;
  characters?: unknown;
  previewOnly?: boolean;
  run_context?: Record<string, unknown>;
  scene: Record<string, unknown>;
}

/** Continuity preferences that actually need the predecessor's output. */
function wantsContinuity(scene: Record<string, unknown>): boolean {
  const pref = String((scene as any).visualContinuity ?? "auto");
  if (pref === "match-cut") return false;
  // Already carries client-extracted continuity data → nothing to wait for.
  if ((scene as any).transitionFrameUrl || (scene as any).previousClipUrl) return false;
  return true;
}

export interface PlanChainArgs {
  supabaseAdmin: any;
  projectId: string;
  userId: string;
  scenes: Array<Record<string, unknown>>;
  /** Request-level fields replayed verbatim when the scene resumes. */
  requestContext: Omit<QueuedScenePayload, "scene">;
}

export interface PlanChainResult {
  /** Scene ids parked for later — the caller must NOT dispatch them now. */
  deferred: Set<string>;
}

/**
 * Parks every scene of the batch whose predecessor is rendered in the same
 * batch (directly or transitively). Never throws — on any error the batch
 * simply runs as before.
 */
export async function planContinuityChain(args: PlanChainArgs): Promise<PlanChainResult> {
  const { supabaseAdmin, projectId, userId, scenes, requestContext } = args;
  const deferred = new Set<string>();
  try {
    if (scenes.length < 2) return { deferred };

    const ids = scenes.map((s) => String((s as any).id)).filter(Boolean);
    const { data: rows } = await supabaseAdmin
      .from("composer_scenes")
      .select("id, order_index, clip_url, clip_status")
      .eq("project_id", projectId);
    if (!rows?.length) return { deferred };

    const byId = new Map<string, any>(rows.map((r: any) => [String(r.id), r]));
    const byOrder = new Map<number, any>(rows.map((r: any) => [Number(r.order_index ?? -1), r]));
    const requested = new Set(ids);

    // Ascending order — a predecessor decision is always made first.
    const ordered = [...scenes].sort(
      (a, b) =>
        Number(byId.get(String((a as any).id))?.order_index ?? 0) -
        Number(byId.get(String((b as any).id))?.order_index ?? 0),
    );

    for (const scene of ordered) {
      const sceneId = String((scene as any).id);
      const row = byId.get(sceneId);
      if (!row) continue;
      if (!wantsContinuity(scene)) continue;

      const predecessor = byOrder.get(Number(row.order_index ?? 0) - 1);
      if (!predecessor) continue;
      const predId = String(predecessor.id);

      // The predecessor only blocks us while it is (re-)rendering in this
      // batch. An already finished clip is used immediately by the resolver.
      const predecessorRenders = requested.has(predId) || deferred.has(predId);
      if (!predecessorRenders) continue;

      const payload: QueuedScenePayload = { ...requestContext, projectId, scene };
      const { error: qErr } = await supabaseAdmin
        .from("composer_continuity_queue")
        .upsert(
          {
            project_id: projectId,
            user_id: userId,
            scene_id: sceneId,
            predecessor_scene_id: predId,
            payload,
            status: "pending",
            attempts: 0,
            expires_at: new Date(Date.now() + PARK_TTL_MINUTES * 60_000).toISOString(),
          },
          { onConflict: "scene_id" },
        );
      if (qErr) {
        console.warn(`[continuity-chain] park failed scene=${sceneId}: ${qErr.message}`);
        continue;
      }

      await supabaseAdmin
        .from("composer_scenes")
        .update({
          clip_status: "queued",
          clip_error: null,
          pipeline_state: "queued",
          pipeline_detail: `waiting_for_scene_${predId.slice(0, 8)}`,
          pipeline_state_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);

      deferred.add(sceneId);
      console.log(`[continuity-chain] parked scene=${sceneId} behind=${predId}`);
    }
  } catch (e) {
    console.warn("[continuity-chain] planning failed:", (e as Error).message);
  }
  return { deferred };
}

async function dispatchQueued(
  supabaseAdmin: any,
  row: any,
  patch: Record<string, unknown>,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const payload = { ...(row.payload ?? {}) } as QueuedScenePayload;
  payload.scene = { ...(payload.scene ?? {}), ...patch };

  // Claim the row first — a duplicate webhook must never double-dispatch.
  const { data: claimed } = await supabaseAdmin
    .from("composer_continuity_queue")
    .update({
      status: "dispatched",
      dispatched_at: new Date().toISOString(),
      attempts: Number(row.attempts ?? 0) + 1,
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  const res = await fetch(`${supabaseUrl}/functions/v1/compose-video-clips`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      "x-internal-actor-user-id": String(row.user_id),
    },
    body: JSON.stringify({
      projectId: payload.projectId,
      visualStyle: payload.visualStyle,
      characters: payload.characters,
      previewOnly: payload.previewOnly,
      run_context: payload.run_context,
      scenes: [payload.scene],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await supabaseAdmin
      .from("composer_continuity_queue")
      .update({ status: "failed", last_error: `${res.status}:${text.slice(0, 300)}` })
      .eq("id", row.id);
    await supabaseAdmin
      .from("composer_scenes")
      .update({
        clip_status: "failed",
        clip_error: `continuity_chain_dispatch_failed:${res.status}`,
        pipeline_state: "failed",
        pipeline_state_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.scene_id)
      .eq("clip_status", "queued");
    console.error(`[continuity-chain] dispatch failed scene=${row.scene_id} ${res.status}`);
    return;
  }

  await supabaseAdmin
    .from("composer_continuity_queue")
    .update({ status: "done" })
    .eq("id", row.id);
  console.log(`[continuity-chain] resumed scene=${row.scene_id}`);
}

export interface ResumeArgs {
  supabaseAdmin: any;
  projectId: string;
  /** The scene that just finished (or failed). */
  predecessorSceneId: string;
  predecessorClipUrl?: string | null;
  predecessorDurationSeconds?: number | null;
  /** true → continuity is downgraded to `match-cut`. */
  predecessorFailed?: boolean;
}

/**
 * Resumes the scene parked behind `predecessorSceneId`. Never throws.
 */
export async function resumeContinuityChain(args: ResumeArgs): Promise<void> {
  const {
    supabaseAdmin,
    projectId,
    predecessorSceneId,
    predecessorClipUrl,
    predecessorDurationSeconds,
    predecessorFailed,
  } = args;
  try {
    const { data: rows } = await supabaseAdmin
      .from("composer_continuity_queue")
      .select("*")
      .eq("predecessor_scene_id", predecessorSceneId)
      .eq("status", "pending");
    if (!rows?.length) return;

    for (const row of rows) {
      let patch: Record<string, unknown> = {};
      if (predecessorFailed || !predecessorClipUrl) {
        patch = { visualContinuity: "match-cut" };
      } else {
        const frame = await ensureTransitionFrame({
          supabaseAdmin,
          userId: String(row.user_id),
          projectId,
          previousSceneId: predecessorSceneId,
          previousClipUrl: predecessorClipUrl,
          previousDurationSeconds: predecessorDurationSeconds ?? undefined,
        });
        patch = {
          previousClipUrl: predecessorClipUrl,
          ...(frame.url ? { transitionFrameUrl: frame.url } : {}),
        };
        if (!frame.url) {
          console.warn(
            `[continuity-chain] no transition frame for scene=${predecessorSceneId}: ${frame.reason}`,
          );
        }
      }
      await dispatchQueued(supabaseAdmin, row, patch);
    }
  } catch (e) {
    console.warn("[continuity-chain] resume failed:", (e as Error).message);
  }
}

/**
 * Releases parked scenes whose predecessor will never report back (expired
 * park, predecessor already terminal). Runs cheaply on every dispatch and
 * webhook so no scene can stay `queued` forever.
 */
export async function sweepContinuityQueue(
  supabaseAdmin: any,
  projectId: string,
): Promise<void> {
  try {
    const { data: rows } = await supabaseAdmin
      .from("composer_continuity_queue")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "pending");
    if (!rows?.length) return;

    const predIds = [...new Set(rows.map((r: any) => String(r.predecessor_scene_id)))];
    const { data: preds } = await supabaseAdmin
      .from("composer_scenes")
      .select("id, clip_url, clip_status, duration_seconds")
      .in("id", predIds);
    const predById = new Map<string, any>((preds ?? []).map((p: any) => [String(p.id), p]));
    const now = Date.now();

    for (const row of rows) {
      const pred = predById.get(String(row.predecessor_scene_id));
      const expired = new Date(row.expires_at).getTime() < now;
      const predTerminal =
        pred?.clip_status === "failed" || pred?.clip_status === "canceled" || !pred;
      const predReady = pred?.clip_status === "ready" && !!pred?.clip_url;

      if (!expired && !predTerminal && !predReady) continue;

      await resumeContinuityChain({
        supabaseAdmin,
        projectId,
        predecessorSceneId: String(row.predecessor_scene_id),
        predecessorClipUrl: predReady ? pred.clip_url : null,
        predecessorDurationSeconds: pred?.duration_seconds ?? null,
        predecessorFailed: !predReady,
      });
    }
  } catch (e) {
    console.warn("[continuity-chain] sweep failed:", (e as Error).message);
  }
}
