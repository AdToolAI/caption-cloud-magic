import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface ScenarioStat {
  scenario: string;
  totalRuns: number;
  failures: number;
  warnings: number;
  avgLatency: number;
  recentLatency: number;
  errorMessages: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Last 24h runs
    const { data: recentRuns, error: e1 } = await supabase
      .from("ai_superuser_runs")
      .select("scenario_name, status, latency_ms, error_message, started_at")
      .gte("started_at", since24h)
      .order("started_at", { ascending: false });

    if (e1) throw e1;

    // Last 7d baseline
    const { data: baselineRuns } = await supabase
      .from("ai_superuser_runs")
      .select("scenario_name, latency_ms, status")
      .gte("started_at", since7d)
      .lt("started_at", since24h);

    // Aggregate per scenario
    const stats = new Map<string, ScenarioStat>();
    for (const run of recentRuns || []) {
      const s = stats.get(run.scenario_name) || {
        scenario: run.scenario_name,
        totalRuns: 0,
        failures: 0,
        warnings: 0,
        avgLatency: 0,
        recentLatency: 0,
        errorMessages: [],
      };
      s.totalRuns++;
      if (run.status === "fail") s.failures++;
      if (run.status === "warning") s.warnings++;
      if (run.latency_ms) s.recentLatency = (s.recentLatency * (s.totalRuns - 1) + run.latency_ms) / s.totalRuns;
      if (run.error_message && s.errorMessages.length < 3) s.errorMessages.push(run.error_message);
      stats.set(run.scenario_name, s);
    }

    // Compare to baseline
    const baselineLatency = new Map<string, number>();
    for (const run of baselineRuns || []) {
      if (run.latency_ms && run.status === "pass") {
        const prev = baselineLatency.get(run.scenario_name) || 0;
        baselineLatency.set(run.scenario_name, prev === 0 ? run.latency_ms : (prev + run.latency_ms) / 2);
      }
    }

    // Detect anomalies
    const anomalies: Array<{ severity: string; description: string; scenarios: string[]; data: unknown }> = [];

    for (const [name, stat] of stats) {
      const failureRate = stat.failures / stat.totalRuns;
      const baseline = baselineLatency.get(name) || stat.recentLatency;
      const latencyIncrease = baseline > 0 ? (stat.recentLatency - baseline) / baseline : 0;

      if (failureRate >= 0.5) {
        anomalies.push({
          severity: "critical",
          description: `Scenario "${name}" hat eine Fehlerrate von ${Math.round(failureRate * 100)}% in den letzten 24h.`,
          scenarios: [name],
          data: { failureRate, totalRuns: stat.totalRuns, errors: stat.errorMessages },
        });
      } else if (failureRate >= 0.2) {
        anomalies.push({
          severity: "high",
          description: `Scenario "${name}" zeigt erhöhte Fehlerrate (${Math.round(failureRate * 100)}%).`,
          scenarios: [name],
          data: { failureRate, totalRuns: stat.totalRuns, errors: stat.errorMessages },
        });
      }

      if (latencyIncrease > 0.5 && stat.recentLatency > 1000) {
        anomalies.push({
          severity: "medium",
          description: `Performance-Regression: "${name}" ist ${Math.round(latencyIncrease * 100)}% langsamer als der 7-Tage-Schnitt.`,
          scenarios: [name],
          data: { recentLatency: Math.round(stat.recentLatency), baseline: Math.round(baseline) },
        });
      }

      // Absolute latency threshold: anything over 60s is a warning regardless of baseline
      if (stat.recentLatency > 60000) {
        anomalies.push({
          severity: "medium",
          description: `Hohe Latenz: "${name}" benötigt im Schnitt ${Math.round(stat.recentLatency / 1000)}s pro Run (Schwellwert 60s).`,
          scenarios: [name],
          data: { recentLatency: Math.round(stat.recentLatency), threshold: 60000 },
        });
      }
    }

    // Use AI for deeper pattern analysis if there are multiple anomalies
    let aiAnalysis: string | null = null;
    if (anomalies.length >= 2 && LOVABLE_API_KEY) {
      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: "Du bist ein DevOps-Analyst. Analysiere Test-Anomalien und identifiziere übergreifende Patterns (z.B. alle Failures betreffen die selbe Edge Function, Datenbank, oder Sprachen). Antworte auf Deutsch in 2-3 Sätzen.",
              },
              {
                role: "user",
                content: `Analysiere diese Anomalien:\n${JSON.stringify(anomalies, null, 2)}\n\nGibt es ein gemeinsames Muster?`,
              },
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          aiAnalysis = aiData.choices?.[0]?.message?.content || null;
        }
      } catch (err) {
        console.error("AI analysis failed:", err);
      }
    }

    // Insert anomalies + auto bug-report for criticals
    let inserted = 0;
    let bugReportsCreated = 0;
    for (const anomaly of anomalies) {
      let bugReportId: string | null = null;

      if (anomaly.severity === "critical") {
        const { data: bug } = await supabase
          .from("bug_reports")
          .insert({
            title: `[Auto] ${anomaly.description.substring(0, 100)}`,
            description: `Automatisch erkannt durch KI Superuser Anomaly Detection.\n\n${anomaly.description}\n\nDetails:\n${JSON.stringify(anomaly.data, null, 2)}\n\n${aiAnalysis ? `KI-Analyse:\n${aiAnalysis}` : ""}`,
            severity: "critical",
            status: "open",
            metadata: { source: "ai_superuser_anomaly", scenarios: anomaly.scenarios },
          })
          .select("id")
          .single();

        if (bug) {
          bugReportId = bug.id;
          bugReportsCreated++;
        }
      }

      const { error } = await supabase.from("ai_superuser_anomalies").insert({
        severity: anomaly.severity,
        pattern_description: anomaly.description,
        affected_scenarios: anomaly.scenarios,
        ai_analysis: aiAnalysis,
        metric_data: anomaly.data,
        auto_bug_report_id: bugReportId,
      });

      if (!error) inserted++;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scenariosAnalyzed: stats.size,
        anomaliesDetected: anomalies.length,
        anomaliesInserted: inserted,
        bugReportsCreated,
        aiAnalysisAvailable: !!aiAnalysis,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Anomalies] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
