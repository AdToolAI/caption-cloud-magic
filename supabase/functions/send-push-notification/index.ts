import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  action?: "get_vapid_key";
  user_id?: string;
  title?: string;
  body?: string;
  url?: string;
}

// Web Push implementation using VAPID
async function sendWebPush(
  subscription: any,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  subject: string
) {
  const endpoint = subscription.endpoint;
  const p256dh = subscription.keys.p256dh;
  const auth = subscription.keys.auth;

  // For web push we need to use the web-push protocol
  // Using a simplified approach with fetch to the push endpoint
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      TTL: "86400",
    },
    body: payload,
  });

  if (!response.ok && response.status !== 201) {
    const text = await response.text();
    throw new Error(`Push failed: ${response.status} ${text}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: PushPayload = await req.json();

    // Return VAPID public key for client subscription
    if (payload.action === "get_vapid_key") {
      const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
      return new Response(
        JSON.stringify({ vapid_public_key: vapidPublicKey }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { user_id, title, body, url } = payload;

    if (!user_id || !title) {
      return new Response(
        JSON.stringify({ error: "user_id and title are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's push subscription
    const { data: prefs, error: prefsError } = await supabase
      .from("notification_preferences")
      .select("push_enabled, push_subscription")
      .eq("user_id", user_id)
      .single();

    if (prefsError || !prefs?.push_enabled || !prefs?.push_subscription) {
      return new Response(
        JSON.stringify({ message: "Push not enabled for user" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const notificationPayload = JSON.stringify({
      title: title || "Caption Cloud",
      body: body || "",
      url: url || "/kalender",
    });

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";

    try {
      await sendWebPush(
        prefs.push_subscription,
        notificationPayload,
        vapidPublicKey,
        vapidPrivateKey,
        "mailto:noreply@caption-cloud.app"
      );
      console.log("Push notification sent to user:", user_id);
    } catch (pushErr: any) {
      console.error("Push send error:", pushErr.message);
      // If subscription is invalid (410 Gone), clean it up
      if (pushErr.message?.includes("410")) {
        await supabase
          .from("notification_preferences")
          .update({ push_enabled: false, push_subscription: null })
          .eq("user_id", user_id);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
