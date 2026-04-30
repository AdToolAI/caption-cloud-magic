import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-qa-mock",
};

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  thumbnail?: { url: string };
  image?: { url: string };
  footer?: { text: string };
  timestamp?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const body = await req.json();
    const { type, webhook_url, stream_title, game_name, viewer_count, clip_url, clip_title, thumbnail_url, embed_color, custom_message, include_viewer_count, include_category, include_thumbnail } = body;

    if (!type || !webhook_url) {
      return new Response(JSON.stringify({ error: "type and webhook_url are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!webhook_url.includes("discord.com/api/webhooks/") && !webhook_url.includes("discordapp.com/api/webhooks/")) {
      return new Response(JSON.stringify({ error: "Invalid Discord webhook URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const color = embed_color || 9520895; // default purple
    let embed: DiscordEmbed;
    let content = "";

    switch (type) {
      case "test":
        embed = {
          title: "🎮 CaptionGenie — Verbindung erfolgreich!",
          description: "Dein Discord-Webhook ist korrekt eingerichtet. Du erhältst ab jetzt automatische Benachrichtigungen.",
          color: 5793266, // green
          footer: { text: "CaptionGenie Gaming Hub" },
          timestamp: new Date().toISOString(),
        };
        break;

      case "go_live":
        content = custom_message || "🔴 Stream ist jetzt LIVE!";
        embed = {
          title: `🔴 ${stream_title || "Stream ist live!"}`,
          description: custom_message || "Der Stream hat gerade begonnen — schau jetzt rein!",
          color,
          fields: [],
          footer: { text: "CaptionGenie Gaming Hub" },
          timestamp: new Date().toISOString(),
        };
        if (include_category !== false && game_name) {
          embed.fields!.push({ name: "🎮 Kategorie", value: game_name, inline: true });
        }
        if (include_viewer_count !== false && viewer_count !== undefined) {
          embed.fields!.push({ name: "👁 Zuschauer", value: String(viewer_count), inline: true });
        }
        if (include_thumbnail !== false && thumbnail_url) {
          embed.image = { url: thumbnail_url };
        }
        break;

      case "stream_end":
        embed = {
          title: "⬛ Stream beendet",
          description: custom_message || "Der Stream ist jetzt offline. Danke fürs Zuschauen!",
          color: 0x95a5a6,
          fields: [],
          footer: { text: "CaptionGenie Gaming Hub" },
          timestamp: new Date().toISOString(),
        };
        if (viewer_count !== undefined) {
          embed.fields!.push({ name: "👁 Peak Zuschauer", value: String(viewer_count), inline: true });
        }
        break;

      case "new_clip":
        embed = {
          title: `✂️ Neuer Clip: ${clip_title || "Highlight"}`,
          description: clip_url ? `[Clip ansehen](${clip_url})` : "Ein neuer Clip wurde erstellt!",
          color,
          footer: { text: "CaptionGenie Gaming Hub" },
          timestamp: new Date().toISOString(),
        };
        if (thumbnail_url) {
          embed.image = { url: thumbnail_url };
        }
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Send to Discord
    const discordRes = await fetch(webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: content || undefined,
        embeds: [embed],
      }),
    });

    if (!discordRes.ok) {
      const errText = await discordRes.text();
      console.error("Discord webhook error:", errText);
      return new Response(JSON.stringify({ error: "Discord webhook failed", details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Consume body
    await discordRes.text();

    // Update notification stats
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await serviceClient.from("gaming_discord_settings").update({
      last_notification_at: new Date().toISOString(),
      notification_count: undefined, // handled below
    }).eq("user_id", userId);

    // Increment count via raw rpc
    await serviceClient.rpc("increment_daily_metric", { p_user_id: userId, p_date: new Date().toISOString().split("T")[0], p_metric: "posts_published" }).catch(() => {});

    // Simple increment
    const { data: settings } = await serviceClient.from("gaming_discord_settings").select("notification_count").eq("user_id", userId).single();
    if (settings) {
      await serviceClient.from("gaming_discord_settings").update({
        notification_count: (settings.notification_count || 0) + 1,
        last_notification_at: new Date().toISOString(),
      }).eq("user_id", userId);
    }

    return new Response(JSON.stringify({ success: true, type }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Discord webhook error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
