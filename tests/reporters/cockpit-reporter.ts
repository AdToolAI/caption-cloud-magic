/**
 * Custom Playwright Reporter — postet Test-Resultate ans Admin QA-Cockpit.
 *
 * Konfiguration via Env-Vars (gesetzt im CI-Workflow):
 *   E2E_INGEST_URL    – z.B. https://<ref>.functions.supabase.co/ingest-e2e-results
 *   E2E_INGEST_TOKEN  – Shared Secret (matcht Edge-Function-Env)
 *   GITHUB_SHA        – optional, wird automatisch in CI gesetzt
 *   GITHUB_REF_NAME   – optional, Branch-Name in CI
 *   BASE_URL          – optional, getestete URL
 *
 * Wird KEINE Ingest-URL gesetzt, no-op (kein Failure → keine lokalen Probleme).
 */

import type {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
} from "@playwright/test/reporter";

interface E2EResultRow {
  test_name: string;
  status: "pass" | "fail" | "skip" | "timeout";
  latency_ms?: number;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

class CockpitReporter implements Reporter {
  private results: E2EResultRow[] = [];

  onTestEnd(test: TestCase, result: TestResult) {
    const status: E2EResultRow["status"] =
      result.status === "passed"
        ? "pass"
        : result.status === "skipped"
        ? "skip"
        : result.status === "timedOut"
        ? "timeout"
        : "fail";

    const errorMessage = result.errors
      ?.map((e) => e.message ?? String(e))
      .join("\n---\n")
      .slice(0, 4000);

    this.results.push({
      test_name: test.titlePath().slice(1).join(" › ") || test.title,
      status,
      latency_ms: result.duration,
      error_message: errorMessage || undefined,
      metadata: {
        retry: result.retry,
        project: test.parent.project()?.name,
        file: test.location.file.split("/").slice(-2).join("/"),
      },
    });
  }

  async onEnd(_result: FullResult) {
    const url = process.env.E2E_INGEST_URL;
    const token = process.env.E2E_INGEST_TOKEN;

    if (!url || !token) {
      console.log("[cockpit-reporter] E2E_INGEST_URL/TOKEN nicht gesetzt — überspringe Upload.");
      return;
    }

    const payload = {
      run_id: process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`,
      base_url: process.env.BASE_URL,
      commit_sha: process.env.GITHUB_SHA,
      branch: process.env.GITHUB_REF_NAME,
      results: this.results,
    };

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-e2e-token": token,
        },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        console.error(
          `[cockpit-reporter] Upload fehlgeschlagen: HTTP ${resp.status} – ${await resp.text()}`
        );
      } else {
        console.log(
          `[cockpit-reporter] ${this.results.length} Resultate ans Cockpit gepostet.`
        );
      }
    } catch (err) {
      console.error("[cockpit-reporter] Upload-Fehler:", err);
    }
  }
}

export default CockpitReporter;
