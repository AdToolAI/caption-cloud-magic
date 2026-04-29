// Polls Replicate for pending autopilot video renders.
// Triggered by pg_cron every minute.
// On success → uploads video, runs QA gate, sets final slot status.
// On failure → refunds credits, marks slot failed, notifies user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hard timeout: predictions older than 15min are considered failed
const TIMEOUT_MIN = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const replicateKey = Deno.env.get("REPLICATE_API_KEY");
  if (!replicateKey) return json({ ok: false, error: "REPLICATE_API_KEY missing" }, 500);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Pending slots (max 30 per tick)
  const { data: pending } = await admin
    .from("autopilot_queue")
    .select("*")
    .eq("status", "generating_video")
    .not("video_prediction_id", "is", null)
    .order("video_started_at", { ascending: true })
    .limit(30);

  const list = pending ?? [];
  let completed = 0, failed = 0, stillProcessing = 0;

  for (const slot of list) {
    try {
      // Timeout check
      const startedAt = slot.video_started_at ? new Date(slot.video_started_at).getTime() : Date.now();
      const ageMin = (Date.now() - startedAt) / 60_000;

      const predResp = await fetch(`https://api.replicate.com/v1/predictions/${slot.video_prediction_id}`, {
        headers: { Authorization: `Bearer ${replicateKey}` },
      });
      if (!predResp.ok) {
        console.warn("[poll] replicate fetch failed", slot.video_prediction_id, predResp.status);
        if (ageMin > TIMEOUT_MIN) await markFailed(admin, slot, "replicate_unreachable");
        continue;
      }
      const pred = await predResp.json();
      const status = pred?.status as string;

      if (status === "starting" || status === "processing") {
        if (ageMin > TIMEOUT_MIN) {
          await markFailed(admin, slot, "timeout");
          failed++;
        } else {
          stillProcessing++;
        }
        continue;
      }

      if (status === "failed" || status === "canceled") {
        await markFailed(admin, slot, pred?.error ? String(pred.error).slice(0, 240) : "render_failed");
        failed++;
        continue;
      }

      if (status === "succeeded") {
        const output = pred.output;
        const url = Array.isArray(output) ? output[0] : output;
        if (typeof url !== "string") {
          await markFailed(admin, slot, "invalid_output");
          failed++;
          continue;
        }

        // Download and store under autopilot-assets/<user_id>/autopilot/<slot_id>.mp4
        const videoResp = await fetch(url);
        if (!videoResp.ok) {
          await markFailed(admin, slot, `download_${videoResp.status}`);
          failed++;
          continue;
        }
        const buf = new Uint8Array(await videoResp.arrayBuffer());
        const path = `${slot.user_id}/autopilot/${slot.id}.mp4`;
        const { error: upErr } = await admin.storage.from("autopilot-assets").upload(path, buf, {
          contentType: "video/mp4",
          upsert: true,
        });
        if (upErr) {
          console.error("[poll] upload failed", upErr);
          await markFailed(admin, slot, `storage_${upErr.message}`);
          failed++;
          continue;
        }
        const { data: pub } = admin.storage.from("autopilot-assets").getPublicUrl(path);
        const assetUrl = pub.publicUrl;

        // QA gate (visual + caption)
        const qaResp = await admin.functions.invoke("autopilot-qa-gate", {
          body: { slot_id: slot.id, asset_url: assetUrl, caption: slot.caption ?? "" },
        });
        const qa = qaResp.data ?? { score: 70, allowed: true, findings: {} };

        const { data: brief } = await admin.from("autopilot_briefs").select("auto_publish_enabled").eq("id", slot.brief_id).maybeSingle();

        const finalStatus = !qa.allowed
          ? "blocked"
          : brief?.auto_publish_enabled && qa.score >= 80
            ? "scheduled"
            : "qa_review";

        await admin.from("autopilot_queue").update({
          status: finalStatus,
          asset_url: assetUrl,
          video_status: "completed",
          video_completed_at: new Date().toISOString(),
          qa_score: qa.score,
          qa_findings: qa.findings,
          block_reason: qa.allowed ? null : `qa:${qa.reason ?? "blocked"}`,
        }).eq("id", slot.id);

        await admin.from("autopilot_video_jobs")
          .update({ status: "completed", output_url: assetUrl, completed_at: new Date().toISOString() })
          .eq("prediction_id", slot.video_prediction_id);

        await admin.from("autopilot_activity_log").insert({
          user_id: slot.user_id,
          event_type: "video_completed",
          actor: "ai",
          slot_id: slot.id,
          payload: { qa_score: qa.score, status: finalStatus, asset_url: assetUrl },
        });

        // Notify (qa_review or blocked)
        if (finalStatus === "qa_review" || finalStatus === "blocked") {
          await admin.functions.invoke("autopilot-emit-notification", {
            body: {
              user_id: slot.user_id,
              type: finalStatus === "blocked" ? "autopilot_blocked" : "autopilot_qa_review",
              title: finalStatus === "blocked" ? "Video durch QA blockiert" : "Neues Video wartet auf Freigabe",
              message: `${slot.platform.toUpperCase()} · QA ${qa.score}/100`,
              metadata: { slot_id: slot.id },
              push_url: "/autopilot",
            },
          }).catch((e) => console.warn("notif fail", e));
        }
        completed++;
      }
    } catch (e) {
      console.error("[poll] slot error", slot.id, e);
    }
  }

  return json({ ok: true, polled: list.length, completed, failed, still_processing: stillProcessing });
});

async function markFailed(
  admin: ReturnType<typeof createClient>,
  slot: { id: string; user_id: string; brief_id: string; video_prediction_id: string | null; generation_cost_credits: number | null },
  reason: string,
) {
  // Refund credits to brief
  const { data: jobRow } = await admin
    .from("autopilot_video_jobs")
    .select("cost_credits")
    .eq("prediction_id", slot.video_prediction_id ?? "")
    .maybeSingle();
  const refund = jobRow?.cost_credits ?? 0;

  if (refund > 0) {
    const { data: brief } = await admin.from("autopilot_briefs")
      .select("weekly_credits_spent").eq("id", slot.brief_id).maybeSingle();
    if (brief) {
      await admin.from("autopilot_briefs").update({
        weekly_credits_spent: Math.max(0, (brief.weekly_credits_spent ?? 0) - refund),
      }).eq("id", slot.brief_id);
    }
  }

  await admin.from("autopilot_queue").update({
    status: "failed",
    video_status: "failed",
    video_error: reason,
    video_completed_at: new Date().toISOString(),
    generation_cost_credits: Math.max(0, (slot.generation_cost_credits ?? 0) - refund),
  }).eq("id", slot.id);

  await admin.from("autopilot_video_jobs")
    .update({ status: "failed", error_message: reason, completed_at: new Date().toISOString() })
    .eq("prediction_id", slot.video_prediction_id ?? "");

  await admin.from("autopilot_activity_log").insert({
    user_id: slot.user_id,
    event_type: "video_failed",
    actor: "ai",
    slot_id: slot.id,
    payload: { reason, refund_credits: refund },
  });

  // Notify user about failure + refund
  await admin.functions.invoke("autopilot-emit-notification", {
    body: {
      user_id: slot.user_id,
      type: "autopilot_blocked",
      title: "Video-Render fehlgeschlagen",
      message: `Slot konnte nicht gerendert werden (${reason}). ${refund} Credits zurückerstattet.`,
      metadata: { slot_id: slot.id, reason, refund },
      push_url: "/autopilot",
    },
  }).catch(() => {});
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
