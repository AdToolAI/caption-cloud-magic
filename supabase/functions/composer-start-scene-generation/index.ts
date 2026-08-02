/**
 * composer-start-scene-generation — v377 "Single-Run-Vertrag".
 *
 * THE only supported entry point for starting a paid clip render.
 *
 * Before this version, "hard reset, then render" was a frontend convention:
 * `useSceneGenerate` awaited `composer-hard-reset-scene` — but swallowed its
 * failure and rendered anyway — while `AnchorPreviewGate` dispatched straight
 * into `compose-video-clips` with no reset at all. The observable result was a
 * scene with THREE simultaneously open plate attempts under generation 1 and
 * derived audio state from the previous day still feeding the lip-sync chain.
 *
 * Here reset and dispatch are one operation:
 *   1. `composer_start_scene_run` (DB, row lock) bumps the generation and mints
 *      a fresh `active_run_id`. The bump tombstones every open attempt.
 *   2. Physical teardown runs afterwards (provider cancels, locks, artifacts) —
 *      it can no longer let a stale result through, because the logical
 *      invalidation already happened.
 *   3. ONLY if every scene reached a clean state do we dispatch
 *      `compose-video-clips`. A failed invalidation aborts without spending.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { hardResetScene } from "../_shared/scene-hard-reset.ts";
import { startSceneRun, type SceneRun } from "../_shared/scene-run.ts";
import { getSyncApiKey } from "../_shared/syncso-preflight.ts";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { fn: "composer-start-scene-generation" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const rawIds = Array.isArray((body as any)?.scene_ids)
      ? (body as any).scene_ids
      : [(body as any)?.scene_id];
    const sceneIds: string[] = Array.from(
      new Set(
        (rawIds as unknown[])
          .map((v) => String(v ?? "").trim())
          .filter((v) => UUID_RE.test(v)),
      ),
    );
    if (sceneIds.length === 0) return json({ error: "scene_ids_required" }, 400);

    /**
     * Two supported shapes:
     *
     *  a) `{ compose }`               — reset + dispatch in one request. Use
     *                                   this whenever the caller can build the
     *                                   compose payload up front.
     *  b) `{ prepare_only: true }` … then `{ compose, use_existing_run: true }`
     *                                 — for "alle Clips": the client must
     *                                   render fresh scene anchors AFTER the
     *                                   purge (the purge would otherwise delete
     *                                   the anchors it just made) and only then
     *                                   knows the compose payload. The second
     *                                   call performs NO reset; it dispatches
     *                                   against the run acquired in step one,
     *                                   and the DB rejects any attempt whose
     *                                   run id is not the scene's active one.
     */
    const prepareOnly = (body as any)?.prepare_only === true;
    const useExistingRun = (body as any)?.use_existing_run === true;
    const compose = (body as any)?.compose;
    if (!prepareOnly && (!compose || typeof compose !== "object")) {
      return json({ error: "compose_body_required" }, 400);
    }
    const reason = String((body as any)?.reason ?? "user_regenerate");


    const admin = createClient(supabaseUrl, serviceKey);

    // ── Ownership ──────────────────────────────────────────────────────────
    const { data: sceneRows } = await admin
      .from("composer_scenes")
      .select("id, project_id")
      .in("id", sceneIds);
    const scenes = (sceneRows ?? []) as Array<{ id: string; project_id: string }>;
    if (scenes.length !== sceneIds.length) return json({ error: "scene_not_found" }, 404);

    const projectIds = Array.from(new Set(scenes.map((s) => s.project_id)));
    const { data: projRows } = await admin
      .from("composer_projects")
      .select("id, user_id")
      .in("id", projectIds);
    const owned = (projRows ?? []) as Array<{ id: string; user_id: string }>;
    if (
      owned.length !== projectIds.length ||
      owned.some((p) => p.user_id !== userId)
    ) {
      return json({ error: "forbidden" }, 403);
    }

    // ── 1 + 2. Acquire the run, then tear the old one down ─────────────────
    // A failure here is terminal: we must never dispatch on a scene whose
    // previous run could not be invalidated.
    const runs: Record<string, SceneRun> = {};
    const syncApiKey = getSyncApiKey() || null;

    for (const scene of scenes) {
      let run: SceneRun;
      try {
        run = await startSceneRun(admin as any, scene.id);
      } catch (e) {
        console.error(`[v377_start] acquire_failed scene=${scene.id}`, e);
        return json(
          {
            ok: false,
            error: "run_acquire_failed",
            scene_id: scene.id,
            message: (e as Error).message,
          },
          409,
        );
      }

      const reset = await hardResetScene({
        supabase: admin as any,
        sceneId: scene.id,
        userId,
        projectId: scene.project_id,
        syncApiKey,
        reason,
        generationOverride: run.generation,
      });

      // The generation + run id are already committed, so the scene is
      // logically safe even if a best-effort storage delete warned. We only
      // abort when the state write itself failed.
      const fatal = reset.errors.filter((e) => e.startsWith("update:"));
      if (fatal.length > 0) {
        console.error(`[v377_start] reset_failed scene=${scene.id}`, fatal);
        return json(
          {
            ok: false,
            error: "reset_failed",
            scene_id: scene.id,
            details: fatal,
          },
          409,
        );
      }

      runs[scene.id] = run;
      console.log(
        `[v377_start] scene=${scene.id} gen=${run.generation} run=${run.runId} ` +
          `refund=${reset.refundDecision} purged=${reset.deletedObjects} warnings=${reset.errors.length}`,
      );
    }

    // ── 3. Dispatch ────────────────────────────────────────────────────────
    // Forward the caller's JWT: `compose-video-clips` authenticates the user
    // itself and charges that user's wallet.
    const dispatchBody = {
      ...compose,
      run_context: Object.fromEntries(
        Object.entries(runs).map(([sceneId, r]) => [
          sceneId,
          { generation: r.generation, run_id: r.runId },
        ]),
      ),
    };

    const resp = await fetch(`${supabaseUrl}/functions/v1/compose-video-clips`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dispatchBody),
    });

    const text = await resp.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 500) };
    }

    if (!resp.ok) {
      console.error(`[v377_start] dispatch_failed status=${resp.status}`);
      return json(
        { ok: false, error: "dispatch_failed", status: resp.status, payload },
        502,
      );
    }

    return json({
      ok: true,
      runs: Object.fromEntries(
        Object.entries(runs).map(([sceneId, r]) => [
          sceneId,
          { generation: r.generation, run_id: r.runId },
        ]),
      ),
      compose: payload,
    });
  } catch (e) {
    console.error("[composer-start-scene-generation] crash", e);
    return json({ ok: false, error: (e as Error).message ?? "internal_error" }, 500);
  }
});
