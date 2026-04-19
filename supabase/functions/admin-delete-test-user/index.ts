import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Find user by email (paginate if needed)
    let userId: string | null = null;
    let page = 1;
    while (page <= 20) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) {
        userId = found.id;
        break;
      }
      if (data.users.length < 200) break;
      page++;
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "user not found", email }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reassign storage object ownership so deletion is not blocked
    const { error: storageErr } = await admin.rpc("admin_reassign_storage_owner", { p_user_id: userId }).maybeSingle();
    // RPC may not exist - fallback to direct UPDATE via raw query is not possible, so we ignore
    if (storageErr && !storageErr.message.includes("does not exist")) {
      console.warn("storage reassign failed:", storageErr.message);
    }

    // Best-effort cleanup
    await admin.from("email_verification_tokens").delete().eq("user_id", userId);

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      // Detailed error for debugging
      console.error("deleteUser error:", JSON.stringify(delErr));
      throw new Error(`deleteUser: ${delErr.message} | status: ${(delErr as any).status} | code: ${(delErr as any).code}`);
    }

    return new Response(JSON.stringify({ success: true, deletedUserId: userId, email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
