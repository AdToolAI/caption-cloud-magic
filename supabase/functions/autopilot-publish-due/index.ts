// Cron-driven publisher — picks scheduled slots whose time has come and publishes via the unified `publish` function.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { recordHeartbeat } from "../_shared/heartbeat.ts";
import { withSentryCron } from "../_shared/sentryCron.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

Deno.serve(withSentryCron("autopilot-publish-due", { schedule: "* * * * *", maxRuntime: 5 }, async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const hbStart = Date.now();
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1) Generate due drafts (slots whose scheduled_at < now+1h and still draft)
    const genHorizon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { data: drafts } = await admin
      .from("autopilot_queue")
      .select("id, user_id")
      .eq("status", "draft")
      .lte("scheduled_at", genHorizon)
      .limit(10);

    let generated = 0;
    for (const d of drafts ?? []) {
      EdgeRuntime.waitUntil(
        admin.functions.invoke("autopilot-generate-slot", { body: { slot_id: d.id } })
          .then(() => {}).catch((e) => console.error("gen-slot bg", e)),
      );
      generated++;
    }

    // 2) Publish slots that are scheduled AND due
    const now = new Date().toISOString();
    const { data: due } = await admin
      .from("autopilot_queue")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .limit(20);

    let published = 0;
    let failed = 0;
    for (const slot of due ?? []) {
      try {
        // Re-check brief gating
        const { data: brief } = await admin.from("autopilot_briefs").select("is_active, paused_until, locked_until, auto_publish_enabled").eq("id", slot.brief_id).maybeSingle();
        if (!brief?.is_active) {
          await admin.from("autopilot_queue").update({ status: "skipped", block_reason: "inactive_at_publish" }).eq("id", slot.id);
          continue;
        }
        if (brief.paused_until && new Date(brief.paused_until) > new Date()) {
          continue;
        }
        if (brief.locked_until && new Date(brief.locked_until) > new Date()) {
          await admin.from("autopilot_queue").update({ status: "skipped", block_reason: "locked_at_publish" }).eq("id", slot.id);
          continue;
        }
        if (!brief.auto_publish_enabled && !slot.approved_by_user) {
          // require manual approval — push back to qa_review
          await admin.from("autopilot_queue").update({ status: "qa_review" }).eq("id", slot.id);
          continue;
        }

        const pubResp = await admin.functions.invoke("publish", {
          body: {
            platform: slot.platform,
            caption: slot.caption,
            hashtags: slot.hashtags,
            asset_url: slot.asset_url,
            user_id: slot.user_id,
            source: "autopilot",
            autopilot_slot_id: slot.id,
          },
        });
        if (pubResp.error) throw pubResp.error;
        const result = pubResp.data ?? {};

        await admin.from("autopilot_queue").update({
          status: "posted",
          posted_at: new Date().toISOString(),
          social_post_id: result.post_id ?? result.id ?? null,
        }).eq("id", slot.id);

        await admin.from("autopilot_activity_log").insert({
          user_id: slot.user_id,
          event_type: "slot_published",
          actor: "ai",
          slot_id: slot.id,
          payload: { platform: slot.platform, social_post_id: result.post_id ?? null },
        });

        EdgeRuntime.waitUntil(
          admin.functions.invoke("autopilot-emit-notification", {
            body: {
              user_id: slot.user_id,
              type: "autopilot_posted",
              title: "Autopilot hat gepostet",
              message: `${slot.platform.toUpperCase()} · live seit ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`,
              metadata: { slot_id: slot.id, platform: slot.platform, social_post_id: result.post_id ?? null },
              push: false, // posted is good news, no need to push every time
              push_url: "/autopilot",
            },
          }).then(() => {}).catch((e) => console.error("notif fail", e)),
        );
        published++;
      } catch (e) {
        console.error("publish failed", slot.id, e);
        await admin.from("autopilot_queue").update({
          status: "failed",
          block_reason: `publish_error:${e instanceof Error ? e.message.slice(0, 200) : String(e)}`,
        }).eq("id", slot.id);

        EdgeRuntime.waitUntil(
          admin.functions.invoke("autopilot-emit-notification", {
            body: {
              user_id: slot.user_id,
              type: "autopilot_failed",
              title: "Veröffentlichung fehlgeschlagen",
              message: `${slot.platform.toUpperCase()} · ${(e instanceof Error ? e.message : String(e)).slice(0, 140)}`,
              metadata: { slot_id: slot.id, platform: slot.platform },
              push_url: "/autopilot",
            },
          }).then(() => {}).catch((er) => console.error("notif fail", er)),
        );
        failed++;
      }
    }

    await recordHeartbeat({
      jobName: "autopilot-publish-due",
      status: "ok",
      durationMs: Date.now() - hbStart,
      expectedIntervalSeconds: 300,
    });
    return json({ ok: true, generated, published, failed });
  } catch (e) {
    console.error("publish-due error", e);
    await recordHeartbeat({
      jobName: "autopilot-publish-due",
      status: "error",
      durationMs: Date.now() - hbStart,
      error: e instanceof Error ? e.message : String(e),
      expectedIntervalSeconds: 300,
    });
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}));

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
