// Generates content for a single autopilot slot.
// Pipeline: brief → prompt-shield → caption + visual prompt via AI → image generation → qa-gate → ready
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface Body { slot_id: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { slot_id } = (await req.json()) as Body;
    if (!slot_id) return json({ ok: false, error: "missing slot_id" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const { data: slot } = await admin.from("autopilot_queue").select("*").eq("id", slot_id).maybeSingle();
    if (!slot) return json({ ok: false, error: "slot not found" }, 404);
    if (slot.status === "posted") return json({ ok: true, skipped: "already posted" });

    const { data: brief } = await admin.from("autopilot_briefs").select("*").eq("id", slot.brief_id).maybeSingle();
    if (!brief) throw new Error("brief missing");

    // Stop conditions
    if (!brief.is_active) return updateAndReturn(admin, slot.id, { status: "skipped", block_reason: "autopilot_inactive" });
    if (brief.paused_until && new Date(brief.paused_until) > new Date()) {
      return updateAndReturn(admin, slot.id, { status: "skipped", block_reason: "paused" });
    }
    if (brief.locked_until && new Date(brief.locked_until) > new Date()) {
      return updateAndReturn(admin, slot.id, { status: "blocked", block_reason: "locked" });
    }

    await admin.from("autopilot_queue").update({ status: "generating" }).eq("id", slot.id);

    // 1) Prompt Shield (topic-level)
    const shieldResp = await admin.functions.invoke("autopilot-prompt-shield", {
      body: {
        prompt: slot.topic_hint ?? "",
        topic_hint: slot.topic_hint,
        user_id: slot.user_id,
        slot_id: slot.id,
      },
    });
    const shield = shieldResp.data ?? { allowed: true, severity: "none", category: "safe", reason: "" };
    if (!shield.allowed) {
      return updateAndReturn(admin, slot.id, {
        status: "blocked",
        block_reason: `shield:${shield.category}:${shield.reason}`,
      });
    }

    // 2) Generate caption + visual prompt via AI tool-calling
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Generiere Social-Media-Content STRENG nach Brief. Sprache: ${slot.language}. Plattform: ${slot.platform}. Tonalität: ${brief.tonality}.
HARDE REGELN: Keine politischen/medizinischen/juristischen Aussagen. Keine Markennamen Dritter. Keine Personen-Likenesses. "Made with AI" Hinweis am Ende der Caption.
Visual Prompt MUSS auf Englisch sein für beste Bildqualität.`,
          },
          {
            role: "user",
            content: `Topic: ${slot.topic_hint}\nFormat: ${(slot.content_payload as { format_hint?: string })?.format_hint ?? "single_image"}\nPillars: ${(brief.topic_pillars ?? []).join(", ")}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_post",
            description: "Erzeuge Caption, Hashtags und visuellen Prompt.",
            parameters: {
              type: "object",
              properties: {
                caption: { type: "string", description: "Plattform-passende Caption inkl. CTA und 'Made with AI' Hinweis." },
                hashtags: { type: "array", items: { type: "string" }, maxItems: 12 },
                visual_prompt_en: { type: "string", description: "Englischer Visual-Prompt für Image-Gen." },
              },
              required: ["caption", "hashtags", "visual_prompt_en"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "create_post" } },
      }),
    });

    if (aiResp.status === 429 || aiResp.status === 402) {
      await admin.from("autopilot_queue").update({ status: "failed", block_reason: aiResp.status === 429 ? "rate_limited" : "credits_exhausted" }).eq("id", slot.id);
      return json({ ok: false, error: "ai_unavailable" }, aiResp.status);
    }
    if (!aiResp.ok) throw new Error(`AI ${aiResp.status}`);
    const aiData = await aiResp.json();
    const args = aiData?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const post = args ? JSON.parse(args) : { caption: slot.topic_hint, hashtags: [], visual_prompt_en: slot.topic_hint };

    // 3) Asset generation — VIDEO if brief.video_enabled AND format hint suggests video, else IMAGE
    let assetUrl: string | null = null;
    const formatHint = ((slot.content_payload as { format_hint?: string })?.format_hint ?? "single_image").toLowerCase();
    const isVideoFormat = brief.video_enabled && /video|reel|short|tiktok|story/.test(formatHint);

    if (isVideoFormat) {
      // Caption + visual prompt are persisted up-front so the poller has everything it needs.
      await admin.from("autopilot_queue").update({
        caption: post.caption,
        hashtags: post.hashtags,
        content_payload: { ...slot.content_payload, visual_prompt_en: post.visual_prompt_en },
      }).eq("id", slot.id);

      const videoResp = await admin.functions.invoke("autopilot-generate-video", {
        body: { slot_id: slot.id, visual_prompt_en: post.visual_prompt_en },
      });

      if (videoResp.error || videoResp.data?.ok === false) {
        const errMsg = videoResp.error?.message ?? videoResp.data?.error ?? "video_init_failed";
        await admin.from("autopilot_queue").update({
          status: "failed",
          block_reason: `video_init:${errMsg}`,
        }).eq("id", slot.id);
        return json({ ok: false, error: errMsg }, 500);
      }

      // Slot is now in 'generating_video'. Poller will run QA + finalize.
      return json({ ok: true, status: "generating_video", prediction_id: videoResp.data?.prediction_id });
    }

    // IMAGE branch (default)
    try {
      const imgResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: `${post.visual_prompt_en}, professional social media visual, no text overlays, no logos, no real persons.` }],
          modalities: ["image", "text"],
        }),
      });
      if (imgResp.ok) {
        const imgJson = await imgResp.json();
        const b64 = imgJson?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (b64) {
          const bytes = base64ToBytes(b64.split(",").pop() ?? "");
          const path = `${slot.user_id}/autopilot/${slot.id}.png`;
          const { error: upErr } = await admin.storage.from("autopilot-assets").upload(path, bytes, {
            contentType: "image/png",
            upsert: true,
          });
          if (!upErr) {
            const { data: pub } = admin.storage.from("autopilot-assets").getPublicUrl(path);
            assetUrl = pub.publicUrl;
          } else {
            console.warn("storage upload failed, using inline data url", upErr);
            assetUrl = b64;
          }
        }
      }
    } catch (e) {
      console.error("image gen failed", e);
    }

    // 4) QA Gate
    const qaResp = await admin.functions.invoke("autopilot-qa-gate", {
      body: { slot_id: slot.id, asset_url: assetUrl, caption: post.caption },
    });
    const qa = qaResp.data ?? { score: 70, allowed: true, findings: {} };

    const finalStatus = !qa.allowed
      ? "blocked"
      : brief.auto_publish_enabled && qa.score >= 80
        ? "scheduled"
        : "qa_review";

    await admin.from("autopilot_queue").update({
      status: finalStatus,
      caption: post.caption,
      hashtags: post.hashtags,
      asset_url: assetUrl,
      qa_score: qa.score,
      qa_findings: qa.findings,
      block_reason: qa.allowed ? null : `qa:${qa.reason ?? "blocked"}`,
      content_payload: { ...slot.content_payload, visual_prompt_en: post.visual_prompt_en },
      generation_cost_credits: 5,
    }).eq("id", slot.id);

    await admin.from("autopilot_activity_log").insert({
      user_id: slot.user_id,
      event_type: "slot_generated",
      actor: "ai",
      slot_id: slot.id,
      payload: { qa_score: qa.score, status: finalStatus },
    });

    // Notification: only on states that need user attention
    if (finalStatus === "qa_review") {
      EdgeRuntime.waitUntil(
        admin.functions.invoke("autopilot-emit-notification", {
          body: {
            user_id: slot.user_id,
            type: "autopilot_qa_review",
            title: "Neuer Slot wartet auf Freigabe",
            message: `${slot.platform.toUpperCase()} · ${new Date(slot.scheduled_at).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" })} · QA ${qa.score}/100`,
            metadata: { slot_id: slot.id, platform: slot.platform, qa_score: qa.score },
            push_url: "/autopilot",
          },
        }).then(() => {}).catch((e) => console.error("notif fail", e)),
      );
    } else if (finalStatus === "blocked") {
      EdgeRuntime.waitUntil(
        admin.functions.invoke("autopilot-emit-notification", {
          body: {
            user_id: slot.user_id,
            type: "autopilot_blocked",
            title: "Slot durch QA blockiert",
            message: `${slot.platform.toUpperCase()} · Grund: ${(qa.reason ?? "Compliance-Risiko").slice(0, 120)}`,
            metadata: { slot_id: slot.id, qa_findings: qa.findings },
            push_url: "/autopilot",
          },
        }).then(() => {}).catch((e) => console.error("notif fail", e)),
      );
    }

    return json({ ok: true, status: finalStatus, qa_score: qa.score });
  } catch (e) {
    console.error("generate-slot error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function updateAndReturn(admin: ReturnType<typeof createClient>, id: string, patch: Record<string, unknown>) {
  await admin.from("autopilot_queue").update(patch).eq("id", id);
  return json({ ok: true, ...patch });
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
