import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Allow only hex colors / safe CSS color keywords for brand-supplied values.
function safeColor(input: unknown, fallback: string): string {
  if (typeof input !== "string") return fallback;
  return /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{3,20}$/.test(input.trim()) ? input.trim() : fallback;
}

function safeUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  try {
    const u = new URL(input);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
  } catch { /* ignore */ }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "calendar-export-pdf" });


  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    // User-scoped client — calendar_events RLS enforces workspace membership.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { workspace_id, brand_kit_id, month, year } = await req.json();

    if (!workspace_id || !month || !year) {
      return new Response(
        JSON.stringify({ error: "MISSING_REQUIRED_FIELDS", code: "MISSING_REQUIRED_FIELDS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the caller is a member of the requested workspace.
    const { data: membership, error: memberErr } = await userClient
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberErr || !membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate month range
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Fetch events for the month using user-scoped client → RLS enforced.
    let query = userClient
      .from("calendar_events")
      .select("*")
      .eq("workspace_id", workspace_id)
      .gte("start_at", startDate.toISOString())
      .lte("start_at", endDate.toISOString())
      .order("start_at", { ascending: true });

    if (brand_kit_id) {
      query = query.eq("brand_kit_id", brand_kit_id);
    }

    const { data: events, error: eventsError } = await query;

    if (eventsError) throw eventsError;

    // Fetch brand kit for logo and colors (user-scoped → RLS).
    let brandKit: any = null;
    if (brand_kit_id) {
      const { data } = await userClient
        .from("brand_kits")
        .select("*")
        .eq("id", brand_kit_id)
        .maybeSingle();
      brandKit = data;
    }

    // Generate HTML for PDF (simple table layout) — all values escaped.
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long' });
    const primary = safeColor(brandKit?.primary_color, "#000");
    const secondary = safeColor(brandKit?.secondary_color, "#f3f4f6");
    const logoUrl = safeUrl(brandKit?.logo_url);

    const rowsHtml = (events ?? []).map((event: any) => {
      const dateStr = escapeHtml(new Date(event.start_at).toLocaleDateString());
      const title = escapeHtml(event.title);
      const status = escapeHtml(event.status);
      const statusClass = escapeHtml(String(event.status ?? "").replace(/[^a-z0-9_-]/gi, ""));
      const channels = Array.isArray(event.channels) && event.channels.length > 0
        ? event.channels.map((ch: unknown) => `<span class="channel-badge">${escapeHtml(ch)}</span>`).join('')
        : '-';
      return `
        <tr>
          <td>${dateStr}</td>
          <td>${title}</td>
          <td><div class="channels">${channels}</div></td>
          <td><span class="status status-${statusClass}">${status}</span></td>
        </tr>`;
    }).join('') || '<tr><td colspan="4" style="text-align: center;">No events this month</td></tr>';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; border-bottom: 2px solid ${primary}; padding-bottom: 20px; }
    .logo { max-width: 150px; max-height: 60px; }
    h1 { color: ${primary}; margin: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background-color: ${primary}; color: white; padding: 12px; text-align: left; font-weight: bold; }
    td { padding: 10px 12px; border-bottom: 1px solid #ddd; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .status-briefing { background: #e5e7eb; color: #374151; }
    .status-in_progress { background: #dbeafe; color: #1e40af; }
    .status-review { background: #fef3c7; color: #92400e; }
    .status-approved { background: #d1fae5; color: #065f46; }
    .status-scheduled { background: #e0e7ff; color: #3730a3; }
    .status-published { background: #e9d5ff; color: #6b21a8; }
    .channels { display: flex; gap: 4px; flex-wrap: wrap; }
    .channel-badge { background: ${secondary}; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
  </style>
</head>
<body>
  <div class="header">
    <div>${logoUrl ? `<img src="${escapeHtml(logoUrl)}" class="logo" alt="Brand Logo">` : ''}</div>
    <h1>${escapeHtml(monthName)} ${escapeHtml(year)} Content Calendar</h1>
  </div>
  <table>
    <thead>
      <tr><th>Date</th><th>Title</th><th>Channels</th><th>Status</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div style="margin-top: 40px; text-align: center; color: #6b7280; font-size: 12px;">
    Generated on ${escapeHtml(new Date().toLocaleDateString())}
  </div>
</body>
</html>`;

    return new Response(
      JSON.stringify({
        html,
        events_count: events?.length || 0,
        message: "PDF generation would require a PDF service integration"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("PDF export error:", error);
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
