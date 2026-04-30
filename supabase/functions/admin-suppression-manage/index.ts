// Admin-only Edge Function: Add or remove entries from email_suppression_list.
// Requires the caller to have the 'admin' role (checked via has_role RPC).

import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  action: "add" | "remove" | "bulk_remove_test";
  email?: string;
  reason?: "bounce" | "complaint" | "unsubscribe" | "manual";
  note?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller identity
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claims.claims.sub as string;

    // Admin check via has_role RPC (uses service role to bypass RLS)
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: isAdmin, error: roleErr } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return json({ error: "Forbidden — admin role required" }, 403);
    }

    // Parse body
    const body = (await req.json()) as RequestBody;
    if (!body?.action) {
      return json({ error: "Missing 'action'" }, 400);
    }

    // Bulk-remove all Resend test addresses (*@resend.dev)
    if (body.action === "bulk_remove_test") {
      const { data, error } = await adminClient
        .from("email_suppression_list")
        .delete()
        .ilike("email", "%@resend.dev")
        .select("email");
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, action: "bulk_remove_test", removed: data?.length ?? 0 });
    }

    if (!body.email) {
      return json({ error: "Missing 'email'" }, 400);
    }
    const email = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Invalid email format" }, 400);
    }

    if (body.action === "add") {
      const reason = body.reason ?? "manual";
      const { error } = await adminClient
        .from("email_suppression_list")
        .upsert(
          {
            email,
            reason,
            details: body.note ? { note: body.note, added_by: userId } : { added_by: userId },
            suppressed_at: new Date().toISOString(),
          },
          { onConflict: "email" },
        );
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, action: "added", email });
    }

    if (body.action === "remove") {
      const { error } = await adminClient
        .from("email_suppression_list")
        .delete()
        .eq("email", email);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, action: "removed", email });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
