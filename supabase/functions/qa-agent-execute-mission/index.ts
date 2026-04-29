// QA Agent Execute Mission (Session QA-1 skeleton)
// Loads mission, runs Browserless smoke navigation, captures bugs, finalizes run.

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
  let missionName = "unknown";

  // Defensive bug-insert wrapper — never let an insert error kill the whole run.
  const insertBug = async (payload: Record<string, unknown>) => {
    try {
      const safe = {
        ...payload,
        description: payload.description ?? "(no description — see metadata)",
      };
      const { error } = await supabase.from("qa_bug_reports").insert(safe);
      if (error) {
        console.error("[execute-mission] bug insert failed:", error.message, payload);
      } else {
        bugsFound++;
      }
    } catch (e: any) {
      console.error("[execute-mission] bug insert threw:", e?.message ?? String(e));
    }
  };

  try {
    console.log("[execute-mission] start", { run_id });

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
    missionName = mission?.name ?? (run as any).mission_name ?? "unknown";
    const steps: any[] = Array.isArray(mission?.steps) ? mission.steps : [];

    const qaEmail = Deno.env.get("QA_TEST_USER_EMAIL") ?? "qa-bot@useadtool.ai";
    const qaPassword = Deno.env.get("QA_TEST_USER_PASSWORD") ?? "";
    // IMPORTANT: id-preview--*.lovable.app is gated by Lovable's auth-bridge
    // (lovable.dev/login). Browserless cannot authenticate against that. Default to
    // the public app domain instead so that /auth renders the real login form.
    const baseUrl = Deno.env.get("QA_TARGET_URL") ?? "https://useadtool.ai";

    if (!qaPassword) {
      throw new Error("QA_TEST_USER_PASSWORD secret not configured");
    }

    const navPaths: string[] = steps
      .filter((s) => s?.type === "navigate" && typeof s.path === "string")
      .map((s) => s.path);

    const finalPath = steps[steps.length - 1]?.path;

    const script = buildSmokeNavigationScript();

    console.log("[execute-mission] invoking browserless", { mission: missionName, navPaths: navPaths.length });

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
        const { data: up, error } = await supabase.storage
          .from("qa-screenshots")
          .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
        if (error) {
          console.warn(`[execute-mission] ${label} upload error:`, error.message);
          return undefined;
        }
        if (up?.path) {
          const { data: pub } = supabase.storage.from("qa-screenshots").getPublicUrl(up.path);
          return pub?.publicUrl;
        }
      } catch (e: any) {
        console.warn(`[execute-mission] ${label} upload threw:`, e?.message ?? String(e));
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
    const allPathResults: any[] = (result.data?.pathResults ?? []) as any[];
    const navResults = allPathResults.filter((p) => typeof p?.path === "string");
    const heartbeats = allPathResults.filter((p) => p?.phase === "login-step");
    const failedNavs = navResults.filter((p) => !p.ok);
    const successfulNavs = navResults.filter((p) => p.ok);

    console.log("[execute-mission] result-summary", {
      ok: result.ok,
      error: result.error,
      httpStatus: (result as any).httpStatus,
      durationMs: result.durationMs,
      navAttempted: navResults.length,
      navOk: successfulNavs.length,
      heartbeats: heartbeats.length,
      lastBeat: heartbeats[heartbeats.length - 1]?.label,
      urlReturned: result.url,
      titleReturned: result.title,
      hasFinalScreenshot: !!result.screenshot,
      hasLoginScreenshot: !!loginShotData,
      consoleErrorCount: consoleErrors.length,
      networkErrorCount: netErrors.length,
    });

    // Bug: Browserless overall failure
    if (!result.ok) {
      const errMsg = result.error ?? "(no error message)";
      const isLoginFail = /Login did not redirect|Auth form not ready|Email or password input|No submit button|preview auth bridge/i.test(errMsg);
      await insertBug({
        run_id,
        mission_name: missionName,
        // NOTE: qa_bug_reports.category check-constraint allows only:
        // workflow|visual|data-integrity|performance|regression|cost-overrun|console|network|assertion
        // Login failures don't have a dedicated category, so we tag failure_area instead.
        severity: "high",
        category: "workflow",
        title: isLoginFail
          ? `Login failed before any path could be visited`
          : `Mission execution failed: ${errMsg.slice(0, 100)}`,
        description: errMsg,
        screenshot_url: loginScreenshotUrl ?? screenshotUrl,
        network_trace: {
          failure_area: isLoginFail ? "auth" : "workflow",
          target_url: baseUrl,
          http_status: (result as any).httpStatus ?? null,
          raw_response: (result as any).rawResponse ?? null,
          duration_ms: result.durationMs,
          login_screenshot_url: loginScreenshotUrl ?? null,
          last_heartbeat: heartbeats[heartbeats.length - 1] ?? null,
          heartbeats,
        },
      });
    }

    // Bug: silent no-op (script returned ok but never executed any navigation)
    if (result.ok && navResults.length === 0 && navPaths.length > 0) {
      await insertBug({
        run_id,
        mission_name: missionName,
        severity: "high",
        category: "workflow",
        title: "Navigation never executed (login likely failed silently)",
        description: `Expected ${navPaths.length} path(s), got 0. Last heartbeat: ${heartbeats[heartbeats.length - 1]?.label ?? "(none)"}.`,
        screenshot_url: loginScreenshotUrl ?? screenshotUrl,
        network_trace: {
          http_status: (result as any).httpStatus ?? null,
          raw_response: (result as any).rawResponse ?? null,
          duration_ms: result.durationMs,
          heartbeats,
          login_screenshot_url: loginScreenshotUrl ?? null,
        },
      });
    }

    // Bug: console errors
    if (consoleErrors.length > 0) {
      await insertBug({
        run_id,
        mission_name: missionName,
        severity: consoleErrors.length > 3 ? "high" : "medium",
        category: "console",
        title: `${consoleErrors.length} console error(s) detected`,
        description: consoleErrors.slice(0, 5).map((c) => c.text).join("\n"),
        screenshot_url: screenshotUrl,
        console_log: consoleErrors.slice(0, 20),
      });
    }

    // Bug: 5xx network errors
    const fiveXX = netErrors.filter((n) => n.status >= 500);
    if (fiveXX.length > 0) {
      await insertBug({
        run_id,
        mission_name: missionName,
        severity: "critical",
        category: "network",
        title: `${fiveXX.length} server error(s) (5xx)`,
        description: fiveXX.slice(0, 10).map((n) => `${n.status} ${n.url}`).join("\n"),
        screenshot_url: screenshotUrl,
        network_trace: fiveXX.slice(0, 20),
      });
    }

    // Bug: failed navigations
    if (failedNavs.length > 0) {
      await insertBug({
        run_id,
        mission_name: missionName,
        severity: "high",
        category: "workflow",
        title: `${failedNavs.length} route(s) failed to load`,
        description: failedNavs.map((f: any) => `${f.path}: ${f.error}`).join("\n"),
        screenshot_url: screenshotUrl,
      });
    }

    // Finalize — also fail if no nav succeeded.
    const status =
      bugsFound === 0 && result.ok && successfulNavs.length > 0 ? "succeeded" : "failed";

    await supabase
      .from("qa_test_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        steps_completed: successfulNavs.length,
        bugs_found: bugsFound,
        last_screenshot_url: screenshotUrl,
        log_summary: `${navResults.length} paths visited, ${consoleErrors.length} console errors, ${netErrors.length} network errors, ${heartbeats.length} heartbeats`,
        metadata: {
          result: {
            url: result.url,
            title: result.title,
            pathResults: allPathResults,
            heartbeats,
            navResults,
            httpStatus: (result as any).httpStatus,
            error: result.error,
            rawResponse: (result as any).rawResponse,
          },
        },
      })
      .eq("id", run_id);

    return new Response(JSON.stringify({ ok: true, run_id, status, bugsFound }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.error("[qa-agent-execute-mission] fatal:", msg);

    // Always leave a bug breadcrumb so the cockpit shows *why* the run died.
    try {
      await supabase.from("qa_bug_reports").insert({
        run_id,
        mission_name: missionName,
        severity: "critical",
        category: "infrastructure",
        title: `Edge function crashed: ${msg.slice(0, 100)}`,
        description: msg,
      });
    } catch (insertErr: any) {
      console.error("[execute-mission] could not insert fatal bug:", insertErr?.message ?? insertErr);
    }

    await supabase
      .from("qa_test_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        log_summary: `fatal: ${msg}`,
      })
      .eq("id", run_id);

    return new Response(JSON.stringify({ ok: false, error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
