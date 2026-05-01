// Returns Sentry Cron Monitor status for the admin Watchdog tab.
// Lists the latest 5 check-ins for each known monitor.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SENTRY_AUTH_TOKEN = Deno.env.get("SENTRY_AUTH_TOKEN");
const SENTRY_ORG_SLUG = Deno.env.get("SENTRY_ORG_SLUG");
const SENTRY_PROJECT_SLUG = Deno.env.get("SENTRY_PROJECT_SLUG");

const MONITORS = [
  "qa-watchdog",
  "qa-live-sweep",
  "qa-bug-harvester",
  "autopilot-video-poll",
  "autopilot-publish-due",
  "sync-metrics-cron",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG_SLUG || !SENTRY_PROJECT_SLUG) {
    return new Response(
      JSON.stringify({ enabled: false, monitors: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const results = await Promise.all(
    MONITORS.map(async (slug) => {
      try {
        const url = `https://sentry.io/api/0/organizations/${SENTRY_ORG_SLUG}/monitors/${slug}/`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` },
        });
        if (!res.ok) {
          return { slug, exists: false, status: res.status };
        }
        const m = await res.json();
        return {
          slug,
          exists: true,
          status: m.status ?? "unknown",
          last_check_in: m.lastCheckIn ?? null,
          link: `https://sentry.io/organizations/${SENTRY_ORG_SLUG}/crons/${slug}/`,
        };
      } catch (e) {
        return { slug, exists: false, error: (e as Error).message };
      }
    }),
  );

  return new Response(
    JSON.stringify({
      enabled: true,
      org: SENTRY_ORG_SLUG,
      monitors: results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
