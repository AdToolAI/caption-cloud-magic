// QA Agent Execute Mission
// Loads mission, runs Browserless smoke navigation, captures bugs (deduplicated),
// applies muted-pattern allowlist, finalizes run.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runBrowserlessFunction, buildSmokeNavigationScript } from "../_shared/browserlessClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type MutedPattern = {
  pattern_regex: string;
  severity_when_matched: string; // 'ignore' = drop entirely
  reason?: string | null;
};

// Pattern-match helper. Falls back to substring if regex is invalid.
function matchMuted(text: string, patterns: MutedPattern[]): MutedPattern | null {
  for (const p of patterns) {
    try {
      const re = new RegExp(p.pattern_regex, "i");
      if (re.test(text)) return p;
    } catch {
      if (text.toLowerCase().includes(p.pattern_regex.toLowerCase())) return p;
    }
  }
  return null;
}

// Collapse a console message to a stable signature (drop URLs, line numbers, ids).
function consoleSignature(text: string): string {
  return text
    .replace(/https?:\/\/[^\s]+/g, "<url>")
    .replace(/:\d+:\d+/g, "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\d{4,}/g, "<n>")
    .slice(0, 220);
}

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
  let highSeverityBugs = 0;
  let missionName = "unknown";

  // Load muted patterns once per run
  const { data: mutedRows } = await supabase
    .from("qa_muted_patterns")
    .select("pattern_regex, severity_when_matched, reason");
  const muted: MutedPattern[] = (mutedRows ?? []) as MutedPattern[];

  let mutedDrops = 0;
  const insertBug = async (payload: Record<string, unknown>) => {
    try {
      // Pre-insert mute filter: drop any bug whose title or description matches an "ignore" pattern.
      const titleStr = String(payload.title ?? "");
      const descStr = String(payload.description ?? "");
      const combined = `${titleStr}\n${descStr}`;
      const mute = matchMuted(combined, muted);
      if (mute?.severity_when_matched === "ignore") {
        mutedDrops++;
        console.log("[execute-mission] muted bug dropped:", titleStr.slice(0, 80), "reason:", mute.reason ?? "(no reason)");
        return;
      }
      const safe = {
        ...payload,
        description: payload.description ?? "(no description — see metadata)",
      };
      const { error } = await supabase.from("qa_bug_reports").insert(safe);
      if (error) {
        console.error("[execute-mission] bug insert failed:", error.message, payload);
      } else {
        bugsFound++;
        const sev = String(payload.severity ?? "");
        if (sev === "critical" || sev === "high") highSeverityBugs++;
      }
    } catch (e: any) {
      console.error("[execute-mission] bug insert threw:", e?.message ?? String(e));
    }
  };

  try {
    console.log("[execute-mission] start", { run_id, muted: muted.length });

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
    const baseUrl = Deno.env.get("QA_TARGET_URL") ?? "https://useadtool.ai";

    if (!qaPassword) {
      throw new Error(
        "QA_TEST_USER_PASSWORD secret not configured. Click 'Test-User einrichten' in the QA Cockpit header to provision the QA bot account, then re-run.",
      );
    }

    // Pre-flight: warn (don't block) when mission has too many steps for the
    // Browserless server cap. Hobby = 30s, Standard = 60s. Average step ≈ 3-4s
    // including navigation; login adds ~5-7s. So ~6 steps fit safely on Hobby.
    const envCap = Number(Deno.env.get("BROWSERLESS_SERVER_TIMEOUT_MS"));
    const serverCapMs = Math.min(60_000, Math.max(1_000, Number.isFinite(envCap) && envCap > 0 ? envCap : 30_000));
    const stepBudget = Math.floor((serverCapMs - 7_000) / 4_000); // -7s for login, 4s/step
    if (steps.length > stepBudget) {
      console.warn(
        `[execute-mission] mission '${missionName}' has ${steps.length} steps but server cap of ${serverCapMs}ms only fits ~${stepBudget}. Expect 408 timeout.`,
      );
    }

    const navPaths: string[] = steps
      .filter((s) => s?.type === "navigate" && typeof s.path === "string")
      .map((s) => s.path);

    const finalPath = steps[steps.length - 1]?.path;
    const interactiveCount = steps.filter((s) => s?.type && s.type !== "navigate").length;

    // Mock-mode: enabled by default unless mission explicitly opts out OR caller forces real providers.
    // Header x-qa-mock=true is read by AI edge functions (replicate-generate-video, picture-studio-*,
    // music-studio-*, render-directors-cut, etc.) — they MUST short-circuit to a fake response when set
    // AND the caller is the QA test user.
    const forceReal = (run as any).triggered_by === "manual" && (run as any).metadata?.force_real_providers === true;
    const mockEnabled = (mission as any)?.mock_mode !== false && !forceReal;
    const extraHeaders = mockEnabled ? { "x-qa-mock": "true" } : undefined;

    const script = buildSmokeNavigationScript();

    console.log("[execute-mission] invoking browserless", {
      mission: missionName,
      navPaths: navPaths.length,
      interactiveSteps: interactiveCount,
      mockEnabled,
    });

    const result = await runBrowserlessFunction(script, {
      baseUrl,
      email: qaEmail,
      password: qaPassword,
      // Pass full steps array — script supports navigate/click/click_text/fill/wait_for/expect_visible/expect_no_console_error/sleep
      steps,
      // Backwards compat: paths is still respected when steps is empty
      paths: navPaths.length > 0 ? navPaths : ["/dashboard"],
      finalPath,
      extraHeaders,
    });

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
      navAttempted: navResults.length,
      navOk: successfulNavs.length,
      consoleErrorCount: consoleErrors.length,
      networkErrorCount: netErrors.length,
    });

    // ----- BUG: Browserless overall failure -----
    let finalizeWarningOnly = false;
    if (!result.ok) {
      const rawErr = result.error;
      const httpStatus = (result as any).httpStatus ?? null;
      const rawResponse = (result as any).rawResponse ?? null;
      const lastHb = heartbeats[heartbeats.length - 1];
      const lastHbLabel = lastHb?.label ?? lastHb?.step ?? lastHb?.path ?? null;
      const stepErrorsArr: any[] = ((result.data as any)?.stepErrors ?? []) as any[];
      const realStepErrors = stepErrorsArr.filter((se: any) => se && se.type !== "navigate");
      const allStepsGreen = realStepErrors.length === 0 && successfulNavs.length > 0;
      const isFinalizePhase = /finaliz/i.test(String(lastHbLabel ?? "")) || /finaliz/i.test(String(rawResponse ?? ""));

      // Build a meaningful fallback when browserlessClient returned ok:false without an error string
      let errMsg: string;
      if (rawErr && rawErr.trim().length > 0) {
        errMsg = rawErr;
      } else {
        const parts: string[] = [];
        if (httpStatus) parts.push(`HTTP ${httpStatus}`);
        if (result.durationMs) parts.push(`after ${result.durationMs}ms`);
        if (lastHbLabel) parts.push(`last step: ${lastHbLabel}`);
        if (rawResponse) {
          const snippet = String(rawResponse).slice(0, 200).replace(/\s+/g, " ").trim();
          if (snippet) parts.push(`response: ${snippet}`);
        }
        errMsg = parts.length > 0
          ? `Browserless engine failure (${parts.join(", ")})`
          : "Browserless engine returned ok:false with no diagnostic data — likely transient (timeout or proxy hiccup)";
      }

      const description = rawResponse
        ? `${errMsg}\n\n--- raw response (truncated) ---\n${String(rawResponse).slice(0, 500)}`
        : errMsg;

      const isLoginFail = /Login did not redirect|Auth form not ready|Email or password input|No submit button|preview auth bridge/i.test(errMsg);

      // Finalize-phase failures with all real steps green = downgrade to info, do not fail mission.
      if (isFinalizePhase && allStepsGreen && !isLoginFail) {
        finalizeWarningOnly = true;
        console.log("[execute-mission] finalize-only failure suppressed — steps were green:", { lastHbLabel, errMsg });
        await insertBug({
          run_id,
          mission_name: missionName,
          severity: "info",
          category: "workflow",
          title: `Engine finalize warning (mission steps OK): ${errMsg.slice(0, 80)}`,
          description,
          screenshot_url: loginScreenshotUrl ?? screenshotUrl,
          network_trace: {
            failure_area: "finalize",
            target_url: baseUrl,
            http_status: httpStatus,
            duration_ms: result.durationMs,
            heartbeats,
          },
        });
      } else {
        await insertBug({
          run_id,
          mission_name: missionName,
          severity: "high",
          category: "workflow",
          title: isLoginFail
            ? `Login failed before any path could be visited`
            : `Mission execution failed: ${errMsg.slice(0, 120)}`,
          description,
          screenshot_url: loginScreenshotUrl ?? screenshotUrl,
          network_trace: {
            failure_area: isLoginFail ? "auth" : "workflow",
            target_url: baseUrl,
            http_status: httpStatus,
            raw_response: rawResponse,
            duration_ms: result.durationMs,
            login_screenshot_url: loginScreenshotUrl ?? null,
            last_heartbeat: heartbeats[heartbeats.length - 1] ?? null,
            heartbeats,
          },
        });
      }
    }

    // ----- BUG: silent no-op -----
    if (result.ok && navResults.length === 0 && navPaths.length > 0) {
      await insertBug({
        run_id,
        mission_name: missionName,
        severity: "high",
        category: "workflow",
        title: "Navigation never executed (login likely failed silently)",
        description: `Expected ${navPaths.length} path(s), got 0.`,
        screenshot_url: loginScreenshotUrl ?? screenshotUrl,
        network_trace: { heartbeats, login_screenshot_url: loginScreenshotUrl ?? null },
      });
    }

    // ----- BUG: console errors, grouped by signature -----
    const consoleGroups = new Map<string, { sample: any; count: number; texts: string[] }>();
    for (const c of consoleErrors) {
      const sig = consoleSignature(c.text);
      const g = consoleGroups.get(sig);
      if (g) {
        g.count++;
        if (g.texts.length < 5) g.texts.push(c.text);
      } else {
        consoleGroups.set(sig, { sample: c, count: 1, texts: [c.text] });
      }
    }

    for (const [sig, group] of consoleGroups) {
      const sampleText = group.sample.text ?? sig;
      const mute = matchMuted(sampleText, muted);
      if (mute?.severity_when_matched === "ignore") continue;
      const severity = mute
        ? mute.severity_when_matched
        : group.count > 5
        ? "high"
        : "medium";
      await insertBug({
        run_id,
        mission_name: missionName,
        severity,
        category: "console",
        title: `Console: ${sampleText.slice(0, 80)}${group.count > 1 ? ` (×${group.count})` : ""}`,
        description: group.texts.join("\n---\n"),
        screenshot_url: screenshotUrl,
        console_log: [{ ...group.sample, occurrences: group.count, signature: sig, muted_reason: mute?.reason ?? null }],
      });
    }

    // ----- BUG: network errors, grouped by status+host -----
    const netGroups = new Map<string, { sample: any; count: number; urls: string[] }>();
    for (const n of netErrors) {
      let host = "";
      try { host = new URL(n.url).host; } catch { host = "unknown"; }
      const key = `${n.status}|${host}`;
      const g = netGroups.get(key);
      if (g) {
        g.count++;
        if (g.urls.length < 5) g.urls.push(n.url);
      } else {
        netGroups.set(key, { sample: n, count: 1, urls: [n.url] });
      }
    }

    for (const [key, group] of netGroups) {
      const status = group.sample.status as number;
      const sampleText = `${status} ${group.sample.url}`;
      const mute = matchMuted(sampleText, muted);
      if (mute?.severity_when_matched === "ignore") continue;
      const baseSeverity =
        status >= 500 ? "critical"
        : status === 401 || status === 403 ? "high"
        : status === 404 ? "medium"
        : status === 406 ? "low"
        : status >= 400 ? "medium"
        : "low";
      const severity = mute ? mute.severity_when_matched : baseSeverity;
      const method = group.sample.method ?? "GET";
      const resourceType = group.sample.resourceType ?? "";
      const postData = group.sample.postData ?? null;
      const descLines = group.urls.map((u: string) => `${method} ${u}`);
      if (postData) descLines.push(`\nRequest body (truncated):\n${postData}`);
      await insertBug({
        run_id,
        mission_name: missionName,
        severity,
        category: "network",
        title: `Network ${status} ${method}: ${(() => { try { return new URL(group.sample.url).pathname.slice(0, 70); } catch { return group.sample.url.slice(0, 70); }})()}${group.count > 1 ? ` (×${group.count})` : ""}`,
        description: descLines.join("\n"),
        screenshot_url: screenshotUrl,
        network_trace: {
          status,
          method,
          resource_type: resourceType,
          post_data: postData,
          group_key: key,
          count: group.count,
          urls: group.urls,
          muted_reason: mute?.reason ?? null,
        },
      });
    }

    // ----- BUG: failed navigations -----
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

    // ----- BUG: interactive step failures (click/fill/wait_for/expect_visible) -----
    // For expect_no_console_error: only emit a bug if there is at least one console error
    // that does NOT match an "ignore" mute pattern (otherwise the assertion was triggered
    // purely by background noise we already chose to ignore).
    const unMutedConsoleCount = consoleErrors.filter((c: any) => {
      const mute = matchMuted(String(c.text ?? ""), muted);
      return !(mute?.severity_when_matched === "ignore");
    }).length;

    const stepErrors: any[] = ((result.data as any)?.stepErrors ?? []) as any[];
    for (const se of stepErrors) {
      // Skip pure 'navigate' failures here — already covered by failedNavs block above.
      if (se.type === "navigate") continue;
      // Skip console-error assertion failures whose underlying errors are all muted.
      if (se.type === "expect_no_console_error" && unMutedConsoleCount === 0) {
        console.log("[execute-mission] suppressed expect_no_console_error step (all errors muted)", {
          step_index: se.step_index,
        });
        continue;
      }
      await insertBug({
        run_id,
        mission_name: missionName,
        severity: "high",
        category: "workflow",
        title: `Step ${se.step_index} (${se.type}) failed: ${se.label?.slice(0, 60) ?? ""}`,
        description: se.error ?? "(no error message)",
        screenshot_url: screenshotUrl,
        network_trace: { step_index: se.step_index, step_type: se.type, duration_ms: se.ms },
      });
    }

    // ----- Status: succeeded if no high/critical bugs and at least one nav OK -----
    // Finalize-only failures (steps green, only finalize phase complained) count as success.
    const effectiveOk = result.ok || finalizeWarningOnly;
    const status =
      effectiveOk && successfulNavs.length > 0 && highSeverityBugs === 0
        ? "succeeded"
        : "failed";

    // ----- Auto-resolve stale "Mission execution failed: Browserless 408" bugs -----
    // When this mission now runs green, retroactively close earlier 408 reports
    // for the same mission so the Bug Inbox doesn't accumulate stale entries.
    if (status === "succeeded") {
      try {
        const { error: resolveErr } = await supabase
          .from("qa_bug_reports")
          .update({ status: "resolved", resolved_at: new Date().toISOString() })
          .eq("mission_name", missionName)
          .neq("status", "resolved")
          .or(
            [
              "title.ilike.Mission execution failed: Browserless 408%",
              "title.ilike.%ERR_BLOCKED_BY_CLIENT%",
              "title.ilike.%companion-diagnose%",
              "title.ilike.%check-subscription%",
              "title.ilike.%(no error message)%",
              "title.ilike.%Browserless engine returned ok:false%",
              "title.ilike.%Browserless engine failure%finalizing%",
              "title.ilike.%Engine finalize warning%",
              "title.ilike.%blocked by CORS%",
              "title.ilike.%Network 0 POST%companion-diagnose%",
              "title.ilike.%Network 0 POST%check-subscription%",
              "title.ilike.%Failed to load resource: net::ERR_FAILED%",
              "title.ilike.%FunctionsFetchError%",
              "title.ilike.%posthog-recorder%",
              "title.ilike.%/envelope/%",
              "title.ilike.%expect_no_console_error%",
              "description.ilike.%x-qa-mock is not allowed%",
            ].join(","),
          );
        if (resolveErr) {
          console.warn("[execute-mission] auto-resolve failed:", resolveErr.message);
        }
      } catch (e: any) {
        console.warn("[execute-mission] auto-resolve threw:", e?.message ?? String(e));
      }
    }

    await supabase
      .from("qa_test_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        steps_completed: Math.max(successfulNavs.length, steps.length - (((result.data as any)?.stepErrors ?? []) as any[]).length),
        bugs_found: bugsFound,
        last_screenshot_url: screenshotUrl,
        log_summary: `${navResults.length} paths, ${consoleErrors.length} console errs (${consoleGroups.size} unique), ${netErrors.length} net errs (${netGroups.size} unique), ${bugsFound} bugs (${highSeverityBugs} high/critical), ${mutedDrops} muted-drops`,
        metadata: {
          result: {
            url: result.url,
            title: result.title,
            targetUrl: baseUrl,
            pathResults: allPathResults,
            heartbeats,
            navResults,
            httpStatus: (result as any).httpStatus,
            error: result.error,
            rawResponse: (result as any).rawResponse,
            consoleGroups: consoleGroups.size,
            networkGroups: netGroups.size,
            highSeverityBugs,
          },
        },
      })
      .eq("id", run_id);

    return new Response(JSON.stringify({ ok: true, run_id, status, bugsFound, highSeverityBugs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.error("[qa-agent-execute-mission] fatal:", msg);

    try {
      await supabase.from("qa_bug_reports").insert({
        run_id,
        mission_name: missionName,
        severity: "critical",
        category: "workflow",
        title: `Edge function crashed: ${msg.slice(0, 100)}`,
        description: msg,
        network_trace: { failure_area: "edge_function" },
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
