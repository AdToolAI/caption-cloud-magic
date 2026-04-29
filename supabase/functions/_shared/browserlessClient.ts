// Lightweight Browserless.io client for the Bond QA Agent.
// Uses BQL (REST + Function endpoint) instead of WebSocket to keep things
// edge-function-friendly. For complex action sequences we send a single
// Puppeteer "function" payload that returns DOM/screenshots/console logs.

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
  durationMs: number;
}

export async function runBrowserlessFunction(
  code: string,
  context: Record<string, any> = {}
): Promise<BrowserlessActionResult> {
  const apiKey = Deno.env.get("BROWSERLESS_API_KEY");
  if (!apiKey) {
    return { ok: false, error: "BROWSERLESS_API_KEY not configured", durationMs: 0 };
  }

  const start = Date.now();
  try {
    const res = await fetch(
      `${BROWSERLESS_BASE}/function?token=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, context }),
      }
    );

    const durationMs = Date.now() - start;
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Browserless ${res.status}: ${text.slice(0, 500)}`, durationMs };
    }

    const data = await res.json();
    return {
      ok: data?.ok !== false,
      screenshot: data?.screenshot,
      url: data?.url,
      title: data?.title,
      consoleLogs: data?.consoleLogs ?? [],
      networkErrors: data?.networkErrors ?? [],
      domSummary: data?.domSummary,
      data: data?.data,
      error: data?.error,
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

// Build a Puppeteer "function" body that:
// 1) Logs in via the QA test account
// 2) Visits each step path
// 3) Captures console + failing network requests
// 4) Returns a screenshot of the final page
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

  page.on('console', m => consoleLogs.push({ type: m.type(), text: m.text().slice(0, 500) }));
  page.on('response', r => {
    if (r.status() >= 400) networkErrors.push({ url: r.url(), status: r.status() });
  });

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
  const pathResults = [];
  for (const p of opts.paths) {
    const t0 = Date.now();
    try {
      await page.goto(opts.baseUrl + p, { waitUntil: 'networkidle2', timeout: 25000 });
      const title = await page.title();
      pathResults.push({ path: p, ok: true, ms: Date.now() - t0, title });
    } catch (e) {
      pathResults.push({ path: p, ok: false, ms: Date.now() - t0, error: String(e).slice(0, 200) });
    }
  }

  // 3) Final screenshot + DOM summary
  if (opts.finalPath) {
    await page.goto(opts.baseUrl + opts.finalPath, { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
  }
  const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60, fullPage: false });
  const url = page.url();
  const title = await page.title();
  const domSummary = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('h1,h2')).slice(0, 10).map(h => h.textContent?.trim()).filter(Boolean);
    return JSON.stringify({ headings, bodyLen: document.body?.innerText?.length ?? 0 });
  });

  return {
    data: { ok: true, screenshot: 'data:image/jpeg;base64,' + screenshot, url, title, consoleLogs, networkErrors, domSummary, pathResults },
    type: 'application/json',
  };
};
`;
}
