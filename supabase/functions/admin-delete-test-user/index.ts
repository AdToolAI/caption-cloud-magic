import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Find user
    let userId: string | null = null;
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) { userId = found.id; break; }
      if (data.users.length < 200) break;
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "user not found", email }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean storage objects owned by this user across all buckets
    const buckets = ["background-projects", "brand-logos", "image-captions", "ai-generated-posts",
      "media-assets", "video-assets", "voiceover-audio", "background-assets", "universal-videos",
      "optimized-videos", "thumbnails", "video-variants", "ai-videos", "audio-assets",
      "background-music", "ai-video-reference", "sora-frames", "avatars", "audio-temp",
      "audio-studio", "composer-uploads"];

    const storageReport: Record<string, number> = {};
    for (const bucket of buckets) {
      // List all objects in user's folder (path prefix = userId)
      const { data: list } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
      if (list && list.length > 0) {
        const paths = list.map((o) => `${userId}/${o.name}`);
        await admin.storage.from(bucket).remove(paths);
        storageReport[bucket] = paths.length;
      }
    }

    // Clear NO-ACTION FKs on auth.users that block CASCADE delete
    // ORDER MATTERS: child tables before parent tables
    const cleanupTables: Array<[string, string]> = [
      ["user_credit_transactions", "user_id"],
      ["credit_reservations", "user_id"],
      ["content_reviews", "submitted_by"],
      ["content_reviews", "reviewed_by"],
      ["content_templates", "created_by"],
      ["performance_analyses", "user_id"],
      ["replies", "created_by"],
      ["studio_images", "user_id"],
      ["studio_albums", "user_id"],
      ["video_template_versions", "created_by"],
      ["weekplans", "created_by"],
      ["user_roles", "granted_by"],
      ["email_verification_tokens", "user_id"],
    ];
    const cleanupReport: Record<string, string> = {};
    for (const [table, col] of cleanupTables) {
      const { error, count } = await admin.from(table).delete({ count: "exact" }).eq(col, userId);
      cleanupReport[`${table}.${col}`] = error ? `ERR: ${error.message}` : `deleted ${count ?? 0}`;
    }

    const { data: rpcResult, error: rpcErr } = await admin.rpc("admin_force_delete_user", { p_user_id: userId });
    if (rpcErr) {
      throw new Error(`RPC error: ${rpcErr.message} | cleanup: ${JSON.stringify(cleanupReport)}`);
    }
    const result = rpcResult as { success: boolean; sqlerrm?: string; sqlstate?: string; context?: string };
    if (!result?.success) {
      throw new Error(`SQL delete failed: ${result?.sqlerrm} (${result?.sqlstate}) | context: ${result?.context}`);
    }

    return new Response(JSON.stringify({
      success: true, deletedUserId: userId, email,
      storageRemoved: storageReport, cleanup: cleanupReport,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
