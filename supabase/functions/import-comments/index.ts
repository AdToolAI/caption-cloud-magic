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

    const { projectId, source, items } = await req.json();
    const requestId = crypto.randomUUID();

    // Validate input
    if (!projectId || !source || !items || !Array.isArray(items)) {
      return new Response(
        JSON.stringify({ error: "Invalid input: projectId, source, and items are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (items.length > 5000) {
      return new Response(
        JSON.stringify({ error: "Maximum 5000 items per import" }),
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

    // Create or get source
    let sourceId = source.id;
    if (!sourceId) {
      const { data: newSource, error: sourceError } = await supabaseClient
        .from("comment_sources")
        .insert({
          project_id: projectId,
          platform: source.platform,
          account_handle: source.accountHandle,
          external_account_id: source.externalAccountId,
        })
        .select("id")
        .single();

      if (sourceError) {
        console.error("Error creating source:", sourceError);
        return new Response(
          JSON.stringify({ error: "Failed to create source" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      sourceId = newSource.id;
    }

    // Prepare comments for insertion
    const commentsToInsert = items.map((item) => {
      const normalizedText = item.text.trim().toLowerCase();
      const fingerprint = `${source.platform}|${item.externalId || ""}|${normalizedText}`;
      
      // Create simple hash of fingerprint (using fingerprint as-is for now)
      const hashHex = Array.from(new TextEncoder().encode(fingerprint))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('').substring(0, 64);

      // Ensure we have a valid date - use current time if not provided
      const createdAtPlatform = item.createdAtPlatform 
        ? item.createdAtPlatform 
        : new Date().toISOString();

      return {
        project_id: projectId,
        source_id: sourceId,
        external_comment_id: item.externalId || null,
        username: item.username || "Unknown",
        user_id_external: item.userIdExternal || null,
        text: item.text,
        language: item.language || null,
        created_at_platform: createdAtPlatform,
        fingerprint: hashHex,
        status: "open",
      };
    });

    // Insert comments (ON CONFLICT fingerprint DO NOTHING handles deduplication)
    const { data: insertedComments, error: insertError } = await supabaseClient
      .from("comments")
      .insert(commentsToInsert)
      .select("id");

    const inserted = insertedComments?.length || 0;
    const skipped = items.length - inserted;

    // Trim to 50 comments (keep newest by ingested_at)
    const { error: trimError } = await supabaseClient.rpc('exec_sql', {
      sql: `
        DELETE FROM comments
        WHERE project_id = $1
          AND id IN (
            SELECT id FROM comments
            WHERE project_id = $1
            ORDER BY ingested_at ASC
            OFFSET 50
          )
      `,
      params: [projectId]
    });

    // Alternative: Use direct query with subquery
    const { data: allComments } = await supabaseClient
      .from("comments")
      .select("id")
      .eq("project_id", projectId)
      .order("ingested_at", { ascending: false });
    
    if (allComments && allComments.length > 50) {
      const idsToDelete = allComments.slice(50).map(c => c.id);
      await supabaseClient
        .from("comments")
        .delete()
        .in("id", idsToDelete);
    }

    // Get total stored
    const { count: totalStored } = await supabaseClient
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId);

    // Log import
    await supabaseClient.from("imports").insert({
      project_id: projectId,
      source_id: sourceId,
      count_total: items.length,
      count_inserted: inserted,
      count_skipped: skipped,
    });

    return new Response(
      JSON.stringify({
        requestId,
        inserted,
        skipped,
        totalStored: totalStored || 0,
        message: `Import abgeschlossen: ${inserted} neu, ${skipped} Duplikate. Gesamt gespeichert: ${totalStored || 0}/50.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error importing comments:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});