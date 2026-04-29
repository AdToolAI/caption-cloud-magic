// Lightweight Browserless.io client for the Bond QA Agent.
// Uses the /function REST endpoint with raw JS body (CommonJS export).
// See: https://docs.browserless.io/baas/start/sending-code

const BROWSERLESS_BASE = "https://production-sfo.browserless.io";

export interface BrowserlessActionResult {
  ok: boolean;
  screenshot?: string;
  url?: string;
  title?: string;
  consoleLogs?: Array<{ type: string; text: string }>;
  networkErrors?: Array<{ url: string; status: number }>;
  domSummary?: string;
  data?: any;
  error?: string;
  rawResponse?: string; // first 2KB of raw body for debugging
  httpStatus?: number;
  durationMs: number;
}

export async function runBrowserlessFunction(
  code: string
): Promise<BrowserlessActionResult> {
  const apiKey = Deno.env.get("BROWSERLESS_API_KEY");
  if (!apiKey) {
    return { ok: false, error: "BROWSERLESS_API_KEY not configured", durationMs: 0 };
  }

  const start = Date.now();
  try {
    // Browserless /function expects raw JavaScript (CommonJS) as the body
    // with Content-Type: application/javascript. NOT JSON.
    const res = await fetch(
      `${BROWSERLESS_BASE}/function?token=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/javascript" },
        body: code,
      }
    );

    const durationMs = Date.now() - start;
    const rawText = await res.text();

    if (!res.ok) {
      return {
        ok: false,
        error: `Browserless ${res.status}: ${rawText.slice(0, 500)}`,
        rawResponse: rawText.slice(0, 2000),
        httpStatus: res.status,
        durationMs,
      };
    }

    // Successful response: try JSON first, fall back to raw
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      return {
        ok: false,
        error: "Browserless returned non-JSON response",
        rawResponse: rawText.slice(0, 2000),
        httpStatus: res.status,
        durationMs,
      };
    }

    return {
      ok: data?.ok !== false,
      screenshot: data?.screenshot,
      url: data?.url,
      title: data?.title,
      consoleLogs: data?.consoleLogs ?? [],
      networkErrors: data?.networkErrors ?? [],
      domSummary: data?.domSummary,
      data,
      error: data?.error,
      httpStatus: res.status,
      durationMs,
    };
  } catch (e: any) {
    return {
      ok: false,
      error: `Browserless fetch failed: ${e?.message ?? String(e)}`,
      durationMs: Date.now() - start,
    };
  }
}

// Build a Puppeteer "function" body (CommonJS, as required by Browserless /function).
// Returns a JSON object with screenshot + console + network + nav-results.
export function buildSmokeNavigationScript(opts: {
  baseUrl: string;
  email: string;
  password: string;
  paths: string[];
  finalPath?: string;
}): string {
  const json = JSON.stringify(opts);
  return `
module.exports = async ({ page }) => {
  const opts = ${json};
  const consoleLogs = [];
  const networkErrors = [];

  page.on('console', m => {
    try { consoleLogs.push({ type: m.type(), text: String(m.text()).slice(0, 500) }); } catch (e) {}
  });
  page.on('pageerror', err => {
    consoleLogs.push({ type: 'pageerror', text: String(err && err.message || err).slice(0, 500) });
  });
  page.on('response', r => {
    try {
      if (r.status() >= 400) networkErrors.push({ url: r.url(), status: r.status() });
    } catch (e) {}
  });

  const result = { ok: true, screenshot: null, url: '', title: '', consoleLogs, networkErrors, domSummary: '', pathResults: [] };

  try {
    // 1) Login
    await page.goto(opts.baseUrl + '/auth', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.type('input[type="email"]', opts.email, { delay: 20 });
    await page.type('input[type="password"]', opts.password, { delay: 20 });
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
    ]);

    // 2) Visit each requested path
    for (const p of opts.paths) {
      const t0 = Date.now();
      try {
        await page.goto(opts.baseUrl + p, { waitUntil: 'networkidle2', timeout: 25000 });
        const title = await page.title();
        result.pathResults.push({ path: p, ok: true, ms: Date.now() - t0, title });
      } catch (e) {
        result.pathResults.push({ path: p, ok: false, ms: Date.now() - t0, error: String(e).slice(0, 200) });
      }
    }

    // 3) Final screenshot + DOM summary
    if (opts.finalPath) {
      await page.goto(opts.baseUrl + opts.finalPath, { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
    }
    const shot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60, fullPage: false });
    result.screenshot = 'data:image/jpeg;base64,' + shot;
    result.url = page.url();
    result.title = await page.title();
    result.domSummary = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h1,h2')).slice(0, 10).map(h => (h.textContent || '').trim()).filter(Boolean);
      return JSON.stringify({ headings, bodyLen: (document.body && document.body.innerText || '').length });
    });
  } catch (e) {
    result.ok = false;
    result.error = String(e && e.message || e).slice(0, 500);
  }

  return {
    data: result,
    type: 'application/json',
  };
};
`.trim();
}
