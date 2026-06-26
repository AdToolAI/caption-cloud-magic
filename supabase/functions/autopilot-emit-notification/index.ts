// Centralized helper for emitting Autopilot notifications.
// Inserts into notification_queue and (optionally) triggers a Web Push.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

type AutopilotNotificationType =
  | "autopilot_qa_review"
  | "autopilot_blocked"
  | "autopilot_failed"
  | "autopilot_posted"
  | "autopilot_daily_digest"
  | "autopilot_strike"
  | "autopilot_locked";

interface Body {
  user_id: string;
  type: AutopilotNotificationType;
  title: string;
  message?: string;
  metadata?: Record<string, unknown>;
  push?: boolean; // default true for high-priority types
  push_url?: string;
}

const HIGH_PRIORITY: AutopilotNotificationType[] = [
  "autopilot_qa_review",
  "autopilot_blocked",
  "autopilot_strike",
  "autopilot_locked",
  "autopilot_failed",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { fn: "autopilot-emit-notification" });
  }
  try {
    // SECURITY: server-to-server only. The Authorization header must carry the
    // SUPABASE_SERVICE_ROLE_KEY, otherwise any internet caller could inject
    // arbitrary system notifications (including push) into any user's queue.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!serviceKey || token !== serviceKey) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const body = (await req.json()) as Body;
    if (!body.user_id || !body.type || !body.title) {
      return json({ ok: false, error: "user_id, type, title required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey,
    );

    // Dedup: skip if same type+title was created in last 30 minutes for this user
    const halfHourAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: dup } = await admin
      .from("notification_queue")
      .select("id")
      .eq("user_id", body.user_id)
      .eq("type", body.type)
      .eq("title", body.title)
      .gte("created_at", halfHourAgo)
      .limit(1)
      .maybeSingle();

    if (dup) {
      return json({ ok: true, deduped: true });
    }

    const { data: inserted, error } = await admin
      .from("notification_queue")
      .insert({
        user_id: body.user_id,
        type: body.type,
        title: body.title,
        message: body.message ?? null,
        metadata: body.metadata ?? {},
      })
      .select("id")
      .single();

    if (error) throw error;

    // Push (best-effort, non-blocking)
    const wantsPush = body.push ?? HIGH_PRIORITY.includes(body.type);
    if (wantsPush) {
      EdgeRuntime.waitUntil(
        admin.functions
          .invoke("send-push-notification", {
            body: {
              user_id: body.user_id,
              title: body.title,
              body: body.message ?? "",
              url: body.push_url ?? "/autopilot",
            },
          })
          .then(() => {})
          .catch((e) => console.error("push fail", e)),
      );
    }

    return json({ ok: true, id: inserted.id });
  } catch (e) {
    console.error("emit-notification error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
