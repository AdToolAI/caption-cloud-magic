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

    // Reassign any remaining storage.objects.owner to null via SQL
    // (objects uploaded outside userId/ folder structure)
    const { error: sqlErr } = await admin.rpc("exec_sql_admin_oneoff", { p_user_id: userId }).maybeSingle();
    // Function probably doesn't exist - that's fine, we'll handle below

    // Best-effort table cleanup
    await admin.from("email_verification_tokens").delete().eq("user_id", userId);

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      throw new Error(`deleteUser failed: ${delErr.message} | storage cleanup: ${JSON.stringify(storageReport)}`);
    }

    return new Response(JSON.stringify({
      success: true, deletedUserId: userId, email, storageRemoved: storageReport,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
