import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { draftId } = await req.json();
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: req.headers.get("Authorization")! } },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Nicht authentifiziert");

    console.log("[export-post-bundle] Fetching draft:", draftId);

    // Fetch draft
    const { data: draft, error: draftError } = await supabaseClient
      .from("post_drafts")
      .select("*")
      .eq("id", draftId)
      .eq("user_id", user.id)
      .single();

    if (draftError || !draft) {
      throw new Error("Draft nicht gefunden");
    }

    // Create ZIP
    const zip = new JSZip();

    // 1. Caption
    zip.file("caption.txt", draft.caption);

    // 2. Hook Variants
    const hookText = Object.entries(draft.hooks || {})
      .map(([key, value]) => `Hook ${key}:\n${value}\n`)
      .join("\n");
    zip.file("hook_variants.txt", hookText);

    // 3. Hashtag Sets
    if (draft.hashtags) {
      zip.file("hashtags_reach.txt", (draft.hashtags.reach || []).join(" "));
      zip.file("hashtags_niche.txt", (draft.hashtags.niche || []).join(" "));
      zip.file("hashtags_brand.txt", (draft.hashtags.brand || []).join(" "));
    }

    // 4. Alt-Text
    if (draft.alt_text) {
      zip.file("alt.txt", draft.alt_text);
    }

    // 5. Caption B (A/B Variant)
    if (draft.caption_b) {
      zip.file("caption_b.txt", draft.caption_b);
    }

    // 6. UTM Link
    if (draft.utm_link) {
      zip.file("utm_link.txt", draft.utm_link);
    }

    // 7. Images
    const imagesFolder = zip.folder("images");
    if (draft.image_url && imagesFolder) {
      try {
        const imageResponse = await fetch(draft.image_url);
        if (imageResponse.ok) {
          const imageBlob = await imageResponse.blob();
          const imageBuffer = await imageBlob.arrayBuffer();
          imagesFolder.file("original.jpg", imageBuffer);
        }
      } catch (error) {
        console.error("[export-post-bundle] Image download failed:", error);
      }
    }

    // 8. Meta.json
    const meta = {
      id: draft.id,
      brandId: draft.brand_kit_id,
      platforms: draft.platforms,
      languages: draft.languages,
      stylePreset: draft.style_preset,
      tone: draft.tone_override,
      scores: draft.scores,
      createdAt: draft.created_at,
      brief: draft.brief,
    };
    zip.file("meta.json", JSON.stringify(meta, null, 2));

    // Generate ZIP
    const zipBlob = await zip.generateAsync({ type: "uint8array" });

    // Upload to Supabase Storage
    const fileName = `export_${draftId}_${Date.now()}.zip`;
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from("ai-generated-posts")
      .upload(`exports/${user.id}/${fileName}`, zipBlob, {
        contentType: "application/zip",
        upsert: true,
      });

    if (uploadError) {
      console.error("[export-post-bundle] Upload error:", uploadError);
      throw uploadError;
    }

    // Get public URL (expires in 1 hour)
    const { data: urlData } = await supabaseClient.storage
      .from("ai-generated-posts")
      .createSignedUrl(`exports/${user.id}/${fileName}`, 3600);

    console.log("[export-post-bundle] ZIP created:", fileName);

    return new Response(
      JSON.stringify({
        success: true,
        url: urlData?.signedUrl,
        fileName,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[export-post-bundle] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
