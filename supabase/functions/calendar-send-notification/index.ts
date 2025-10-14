import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationPayload {
  event_id: string;
  notification_type: "24h_reminder" | "1h_reminder" | "published" | "approval_requested" | "status_changed";
  custom_message?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { event_id, notification_type, custom_message }: NotificationPayload = await req.json();

    console.log("Sending notification:", { event_id, notification_type });

    // Fetch event details
    const { data: event, error: eventError } = await supabase
      .from("calendar_events")
      .select("*, workspaces(name)")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      throw new Error("Event not found");
    }

    // Fetch integration settings
    const { data: integration, error: integrationError } = await supabase
      .from("calendar_integrations")
      .select("*")
      .eq("workspace_id", event.workspace_id)
      .single();

    if (integrationError || !integration) {
      console.log("No integration configured for workspace");
      return new Response(
        JSON.stringify({ message: "No integration configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build notification message
    const message = buildNotificationMessage(event, notification_type, custom_message);

    // Send to Slack if configured
    if (integration.slack_webhook_url) {
      await sendSlackNotification(integration.slack_webhook_url, message, event);
    }

    // Send to Discord if configured (using Discord webhook format)
    const settings = integration.settings_json || {};
    if (settings.discord_webhook_url) {
      await sendDiscordNotification(settings.discord_webhook_url, message, event);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Notifications sent" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error sending notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildNotificationMessage(
  event: any,
  type: string,
  customMessage?: string
): string {
  if (customMessage) return customMessage;

  const title = event.title;
  const channels = event.channels?.join(", ") || "N/A";
  const scheduledTime = event.start_at
    ? new Date(event.start_at).toLocaleString()
    : "Not scheduled";

  switch (type) {
    case "24h_reminder":
      return `📅 *24h Reminder:* "${title}" is scheduled to be published in 24 hours\n*Channels:* ${channels}\n*Time:* ${scheduledTime}`;
    case "1h_reminder":
      return `⏰ *1h Reminder:* "${title}" will be published in 1 hour\n*Channels:* ${channels}\n*Time:* ${scheduledTime}`;
    case "published":
      return `✅ *Published:* "${title}" has been successfully published\n*Channels:* ${channels}`;
    case "approval_requested":
      return `👀 *Approval Requested:* "${title}" needs your review\n*Channels:* ${channels}\n*Scheduled:* ${scheduledTime}`;
    case "status_changed":
      return `🔄 *Status Changed:* "${title}" status updated to *${event.status}*\n*Channels:* ${channels}`;
    default:
      return `📢 *Update:* "${title}"\n*Channels:* ${channels}`;
  }
}

async function sendSlackNotification(webhookUrl: string, message: string, event: any) {
  const payload = {
    text: message,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: message,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Status:*\n${event.status}`,
          },
          {
            type: "mrkdwn",
            text: `*Workspace:*\n${event.workspaces?.name || "N/A"}`,
          },
        ],
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack notification failed: ${response.statusText}`);
  }

  console.log("Slack notification sent successfully");
}

async function sendDiscordNotification(webhookUrl: string, message: string, event: any) {
  const embed = {
    title: event.title,
    description: message,
    color: getColorForStatus(event.status),
    fields: [
      {
        name: "Status",
        value: event.status,
        inline: true,
      },
      {
        name: "Channels",
        value: event.channels?.join(", ") || "N/A",
        inline: true,
      },
      {
        name: "Scheduled Time",
        value: event.start_at
          ? new Date(event.start_at).toLocaleString()
          : "Not scheduled",
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  const payload = {
    content: message,
    embeds: [embed],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Discord notification failed: ${response.statusText}`);
  }

  console.log("Discord notification sent successfully");
}

function getColorForStatus(status: string): number {
  const colors: Record<string, number> = {
    briefing: 0x808080,       // Gray
    in_progress: 0x3b82f6,    // Blue
    review: 0xfbbf24,         // Yellow
    pending_approval: 0xf97316, // Orange
    approved: 0x22c55e,       // Green
    scheduled: 0x6366f1,      // Indigo
    published: 0x8b5cf6,      // Purple
  };
  return colors[status] || 0x808080;
}