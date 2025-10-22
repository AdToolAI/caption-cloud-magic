import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { workspace_id, brand_kit_id, month, year } = await req.json();

    if (!workspace_id || !month || !year) {
      return new Response(
        JSON.stringify({ error: "MISSING_REQUIRED_FIELDS", code: "MISSING_REQUIRED_FIELDS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate month range
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Fetch events for the month
    let query = supabase
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

    // Fetch brand kit for logo and colors
    let brandKit = null;
    if (brand_kit_id) {
      const { data } = await supabase
        .from("brand_kits")
        .select("*")
        .eq("id", brand_kit_id)
        .single();
      brandKit = data;
    }

    // Generate HTML for PDF (simple table layout)
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long' });
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 40px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 40px;
      border-bottom: 2px solid ${brandKit?.primary_color || '#000'};
      padding-bottom: 20px;
    }
    .logo {
      max-width: 150px;
      max-height: 60px;
    }
    h1 {
      color: ${brandKit?.primary_color || '#000'};
      margin: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      background-color: ${brandKit?.primary_color || '#000'};
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: bold;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #ddd;
    }
    tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    .status {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }
    .status-briefing { background: #e5e7eb; color: #374151; }
    .status-in_progress { background: #dbeafe; color: #1e40af; }
    .status-review { background: #fef3c7; color: #92400e; }
    .status-approved { background: #d1fae5; color: #065f46; }
    .status-scheduled { background: #e0e7ff; color: #3730a3; }
    .status-published { background: #e9d5ff; color: #6b21a8; }
    .channels {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .channel-badge {
      background: ${brandKit?.secondary_color || '#f3f4f6'};
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${brandKit?.logo_url ? `<img src="${brandKit.logo_url}" class="logo" alt="Brand Logo">` : ''}
    </div>
    <h1>${monthName} ${year} Content Calendar</h1>
  </div>
  
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Title</th>
        <th>Channels</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${events?.map(event => `
        <tr>
          <td>${new Date(event.start_at).toLocaleDateString()}</td>
          <td>${event.title}</td>
          <td>
            <div class="channels">
              ${event.channels?.map((ch: string) => `<span class="channel-badge">${ch}</span>`).join('') || '-'}
            </div>
          </td>
          <td>
            <span class="status status-${event.status}">${event.status}</span>
          </td>
        </tr>
      `).join('') || '<tr><td colspan="4" style="text-align: center;">No events this month</td></tr>'}
    </tbody>
  </table>
  
  <div style="margin-top: 40px; text-align: center; color: #6b7280; font-size: 12px;">
    Generated on ${new Date().toLocaleDateString()}
  </div>
</body>
</html>
    `;

    // For now, return HTML directly
    // In production, you'd use a service like Puppeteer or a PDF generation API
    return new Response(
      JSON.stringify({
        html,
        events_count: events?.length || 0,
        message: "PDF generation would require a PDF service integration"
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  } catch (error: any) {
    console.error("PDF export error:", error);
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", code: "INTERNAL_ERROR" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
