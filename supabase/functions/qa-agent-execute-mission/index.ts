// QA Agent Execute Mission (Session QA-1 skeleton)
// Loads mission, runs Browserless smoke navigation, captures bugs, finalizes run.
// Session QA-2 will add full action engine, assertions, baseline-diff.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runBrowserlessFunction, buildSmokeNavigationScript } from "../_shared/browserlessClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { run_id } = await req.json().catch(() => ({}));
  if (!run_id) {
    return new Response(JSON.stringify({ ok: false, error: "run_id required" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const t0 = Date.now();
  let bugsFound = 0;

  try {
    // Mark running
    await supabase
      .from("qa_test_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", run_id);

    const { data: run } = await supabase
      .from("qa_test_runs")
      .select("*, qa_missions(*)")
      .eq("id", run_id)
      .single();

    if (!run) throw new Error("run not found");

    const mission: any = (run as any).qa_missions;
    const steps: any[] = Array.isArray(mission?.steps) ? mission.steps : [];

    // Resolve QA test user credentials from env
    const qaEmail = Deno.env.get("QA_TEST_USER_EMAIL") ?? "qa-bot@useadtool.ai";
    const qaPassword = Deno.env.get("QA_TEST_USER_PASSWORD") ?? "";
    const baseUrl = Deno.env.get("QA_TARGET_URL") ?? "https://id-preview--8e97f8e1-59d6-4796-9a44-4c05ca0bfc66.lovable.app";

    if (!qaPassword) {
      throw new Error("QA_TEST_USER_PASSWORD secret not configured");
    }

    // Build path list from steps where step.type === "navigate"
    const navPaths: string[] = steps
      .filter((s) => s?.type === "navigate" && typeof s.path === "string")
      .map((s) => s.path);

    const finalPath = steps[steps.length - 1]?.path;

    const script = buildSmokeNavigationScript();

    const result = await runBrowserlessFunction(script, {
      baseUrl,
      email: qaEmail,
      password: qaPassword,
      paths: navPaths.length > 0 ? navPaths : ["/dashboard"],
      finalPath,
    });

    // Persist screenshots to storage
    const uploadShot = async (dataUrl: string, label: string): Promise<string | undefined> => {
      try {
        const base64 = dataUrl.split(",")[1];
        if (!base64) return undefined;
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const path = `qa-runs/${run_id}/${label}-${Date.now()}.jpg`;
        const { data: up } = await supabase.storage
          .from("qa-screenshots")
          .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
        if (up?.path) {
          const { data: pub } = supabase.storage.from("qa-screenshots").getPublicUrl(up.path);
          return pub?.publicUrl;
        }
      } catch (e) {
        console.warn(`[execute-mission] ${label} upload failed:`, e);
      }
      return undefined;
    };

    let screenshotUrl: string | undefined = undefined;
    if (result.screenshot) screenshotUrl = await uploadShot(result.screenshot, "final");

    let loginScreenshotUrl: string | undefined = undefined;
    const loginShotData = (result as any).data?.loginScreenshot;
    if (loginShotData) loginScreenshotUrl = await uploadShot(loginShotData, "login");

    // Detect bugs
    const consoleErrors = (result.consoleLogs ?? []).filter(
      (l) => l.type === "error" || l.type === "pageerror"
    );
    const netErrors = result.networkErrors ?? [];
    const pathResults: any[] = (result.data?.pathResults ?? []) as any[];
    const failedNavs = pathResults.filter((p) => !p.ok);

    // Bug: Browserless overall failure
    if (!result.ok) {
      const isLoginFail = /Login did not redirect|Auth form not ready|Email or password input|No submit button/i.test(
        result.error ?? ""
      );
      await supabase.from("qa_bug_reports").insert({
        run_id,
        mission_name: mission.name,
        severity: "high",
        category: isLoginFail ? "auth" : "workflow",
        title: isLoginFail
          ? `Login failed before any path could be visited`
          : `Mission execution failed: ${result.error?.slice(0, 100)}`,
        description: result.error,
        screenshot_url: loginScreenshotUrl ?? screenshotUrl,
        network_trace: {
          http_status: (result as any).httpStatus ?? null,
          raw_response: (result as any).rawResponse ?? null,
          duration_ms: result.durationMs,
          login_screenshot_url: loginScreenshotUrl ?? null,
        },
      });
      bugsFound++;
    }

    // Bug: console errors
    if (consoleErrors.length > 0) {
      await supabase.from("qa_bug_reports").insert({
        run_id,
        mission_name: mission.name,
        severity: consoleErrors.length > 3 ? "high" : "medium",
        category: "console",
        title: `${consoleErrors.length} console error(s) detected`,
        description: consoleErrors.slice(0, 5).map((c) => c.text).join("\n"),
        screenshot_url: screenshotUrl,
        console_log: consoleErrors.slice(0, 20),
      });
      bugsFound++;
    }

    // Bug: 5xx network errors
    const fiveXX = netErrors.filter((n) => n.status >= 500);
    if (fiveXX.length > 0) {
      await supabase.from("qa_bug_reports").insert({
        run_id,
        mission_name: mission.name,
        severity: "critical",
        category: "network",
        title: `${fiveXX.length} server error(s) (5xx)`,
        description: fiveXX.slice(0, 10).map((n) => `${n.status} ${n.url}`).join("\n"),
        screenshot_url: screenshotUrl,
        network_trace: fiveXX.slice(0, 20),
      });
      bugsFound++;
    }

    // Bug: failed navigations
    if (failedNavs.length > 0) {
      await supabase.from("qa_bug_reports").insert({
        run_id,
        mission_name: mission.name,
        severity: "high",
        category: "workflow",
        title: `${failedNavs.length} route(s) failed to load`,
        description: failedNavs.map((f: any) => `${f.path}: ${f.error}`).join("\n"),
        screenshot_url: screenshotUrl,
      });
      bugsFound++;
    }

    // Finalize
    const status = bugsFound === 0 && result.ok ? "succeeded" : "failed";
    await supabase
      .from("qa_test_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        steps_completed: pathResults.filter((p) => p.ok).length,
        bugs_found: bugsFound,
        last_screenshot_url: screenshotUrl,
        log_summary: `${pathResults.length} paths visited, ${consoleErrors.length} console errors, ${netErrors.length} network errors`,
        metadata: { result: { url: result.url, title: result.title, pathResults } },
      })
      .eq("id", run_id);

    return new Response(JSON.stringify({ ok: true, run_id, status, bugsFound }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e: any) {
    console.error("[qa-agent-execute-mission] fatal:", e);
    await supabase
      .from("qa_test_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        log_summary: `fatal: ${e?.message ?? String(e)}`,
      })
      .eq("id", run_id);

    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
