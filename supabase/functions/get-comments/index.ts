import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const q = url.searchParams.get("q");
    const platform = url.searchParams.get("platform");
    const language = url.searchParams.get("language");
    const sentiment = url.searchParams.get("sentiment");
    const intent = url.searchParams.get("intent");
    const status = url.searchParams.get("status");
    const toxicity = url.searchParams.get("toxicity");
    const urgency = url.searchParams.get("urgency");
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "50");
    const sort = url.searchParams.get("sort") || "created_at_platform";

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "projectId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify project ownership
    const { data: project, error: projectError } = await supabaseClient
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: "Project not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build query
    let query = supabaseClient
      .from("comments")
      .select(`
        *,
        comment_analysis (*),
        comment_sources (platform, account_handle)
      `, { count: "exact" })
      .eq("project_id", projectId);

    // Apply filters
    if (q) {
      query = query.or(`text.ilike.%${q}%,username.ilike.%${q}%`);
    }
    if (platform) {
      query = query.eq("comment_sources.platform", platform);
    }
    if (language) {
      query = query.eq("language", language);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (dateFrom) {
      query = query.gte("created_at_platform", dateFrom);
    }
    if (dateTo) {
      query = query.lte("created_at_platform", dateTo);
    }

    // Apply analysis filters if provided
    if (sentiment || intent || toxicity || urgency) {
      // We need to filter via the analysis table
      let analysisQuery = supabaseClient
        .from("comment_analysis")
        .select("comment_id");

      if (sentiment) analysisQuery = analysisQuery.eq("sentiment", sentiment);
      if (intent) analysisQuery = analysisQuery.eq("intent", intent);
      if (toxicity) analysisQuery = analysisQuery.eq("toxicity", toxicity);
      if (urgency) analysisQuery = analysisQuery.eq("urgency", urgency);

      const { data: analysisIds } = await analysisQuery;
      if (analysisIds) {
        const commentIds = analysisIds.map(a => a.comment_id);
        query = query.in("id", commentIds);
      }
    }

    // Apply sorting
    if (sort === "priority_score") {
      // Sort by analysis priority_score, need special handling
      query = query.order("created_at_platform", { ascending: false });
    } else {
      query = query.order(sort, { ascending: false });
    }

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: comments, error, count } = await query;

    if (error) {
      console.error("Error fetching comments:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch comments" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        items: comments || [],
        total: count || 0,
        page,
        pageSize,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in get-comments:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});