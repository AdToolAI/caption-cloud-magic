// QA Agent Setup Test User
// Idempotent: creates qa-bot@useadtool.ai (Enterprise plan), flags is_test_user,
// allocates the 300€ QA budget, returns the user id so secrets can be saved.
// Admin-only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Auth: require admin caller
    const auth = req.headers.get("Authorization");
    if (!auth) throw new Error("auth required");
    const { data: caller } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!caller?.user) throw new Error("unauthenticated");
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: caller.user.id,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("admin only");

    const body = await req.json().catch(() => ({}));
    const email: string = body?.email ?? "qa-bot@useadtool.ai";
    const password: string = body?.password ?? crypto.randomUUID().replace(/-/g, "") + "Q!9";

    // Check if user exists
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    let userId: string;
    let created = false;

    if (existingProfile) {
      userId = existingProfile.id;
    } else {
      // Create auth user
      const { data: authUser, error: authErr } =
        await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: "Bond QA Agent", qa_test_user: true },
        });
      if (authErr || !authUser?.user) throw authErr ?? new Error("create user failed");
      userId = authUser.user.id;
      created = true;
    }

    // Flag as test user + grant Enterprise plan + huge platform credits
    await supabase
      .from("profiles")
      .update({
        is_test_user: true,
        plan_code: "enterprise",
        full_name: "Bond QA Agent",
      })
      .eq("id", userId);

    // Initialize / top-up internal credits (separate from real-money budget)
    await supabase
      .from("user_credits")
      .upsert(
        { user_id: userId, balance: 999_000_000 },
        { onConflict: "user_id" }
      );

    return new Response(
      JSON.stringify({
        ok: true,
        user_id: userId,
        email,
        password: created ? password : "(unchanged - user already existed)",
        created,
        instructions: created
          ? "Save QA_TEST_USER_EMAIL + QA_TEST_USER_PASSWORD as secrets so the orchestrator can log in."
          : "User already existed; secrets unchanged.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (e: any) {
    console.error("[qa-agent-setup-test-user] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
