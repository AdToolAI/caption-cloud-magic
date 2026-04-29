// Lightweight Browserless.io client for the Bond QA Agent.
// Uses the /function REST endpoint with JSON body { code, context }.
// The code itself is ESM: `export default async ({ page, context }) => {...}`.
// See: https://docs.browserless.io/rest-apis/function-api

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
  rawResponse?: string;
  httpStatus?: number;
  durationMs: number;
}

export async function runBrowserlessFunction(
  code: string,
  context?: Record<string, unknown>
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
        body: JSON.stringify({ code, context: context ?? {} }),
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

    // Browserless wraps the returned `{ data, type }` — payload sits in data.data
    // when the function returns the canonical shape. Support both.
    const payload = data?.data && typeof data.data === "object" ? data.data : data;

    return {
      ok: payload?.ok !== false,
      screenshot: payload?.screenshot,
      url: payload?.url,
      title: payload?.title,
      consoleLogs: payload?.consoleLogs ?? [],
      networkErrors: payload?.networkErrors ?? [],
      domSummary: payload?.domSummary,
      data: payload,
      error: payload?.error,
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

// ESM-style Puppeteer function. Receives `context` from the JSON body.
// Selectors target our Auth.tsx: <Input id="email" type="email"> + <Input id="password" type="password">.
// In login mode (default) only one password field exists; in signup mode there is also #confirm-password.
// We always wait for BOTH email and password fields to be present & visible before typing,
// because React + framer-motion can render email first and hydrate password a tick later.
export function buildSmokeNavigationScript(): string {
  return `
export default async ({ page, context }) => {
  const opts = context || {};
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

  const result = {
    ok: true, screenshot: null, loginScreenshot: null,
    url: '', title: '', consoleLogs, networkErrors, domSummary: '', pathResults: [],
  };

  const grabLoginShot = async () => {
    try {
      const s = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 55, fullPage: true });
      result.loginScreenshot = 'data:image/jpeg;base64,' + s;
    } catch (e) {}
  };

  try {
    // 1) Open auth page
    await page.goto(opts.baseUrl + '/auth', { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for BOTH fields. Prefer ids (Auth.tsx uses #email / #password), fall back to type selectors.
    try {
      await page.waitForSelector('input#email, input[type="email"]', { visible: true, timeout: 20000 });
      await page.waitForSelector('input#password, input[type="password"]', { visible: true, timeout: 20000 });
    } catch (waitErr) {
      await grabLoginShot();
      throw new Error('Auth form not ready: ' + String(waitErr && waitErr.message || waitErr).slice(0, 180));
    }

    // Small extra settle so React state listeners attach before we type.
    await new Promise(r => setTimeout(r, 250));

    // Fill credentials. Use the actual field handles so we don't depend on focus order.
    const emailHandle = await page.$('input#email') || await page.$('input[type="email"]');
    const pwHandle = await page.$('input#password') || await page.$('input[type="password"]');
    if (!emailHandle || !pwHandle) {
      await grabLoginShot();
      throw new Error('Email or password input not present after wait');
    }
    await emailHandle.click({ clickCount: 3 });
    await emailHandle.type(opts.email, { delay: 15 });
    await pwHandle.click({ clickCount: 3 });
    await pwHandle.type(opts.password, { delay: 15 });

    // Submit. Try button[type=submit] first, then any button containing Login/Anmelden text.
    const submitClicked = await page.evaluate(() => {
      const byType = document.querySelector('button[type="submit"]');
      if (byType) { byType.click(); return 'submit-button'; }
      const buttons = Array.from(document.querySelectorAll('button'));
      const match = buttons.find(b => /login|anmelden|sign\\s*in/i.test((b.textContent || '').trim()));
      if (match) { match.click(); return 'text-button'; }
      return null;
    });
    if (!submitClicked) {
      await grabLoginShot();
      throw new Error('No submit button found on /auth');
    }

    // Wait until we leave /auth (= login redirect happened).
    try {
      await page.waitForFunction(
        () => !location.pathname.startsWith('/auth'),
        { timeout: 25000 }
      );
    } catch (redirErr) {
      await grabLoginShot();
      // Surface the visible error text from the page if any toast / inline error appeared.
      let pageErr = '';
      try {
        pageErr = await page.evaluate(() => {
          const t = document.body && document.body.innerText || '';
          const m = t.match(/(Invalid|wrong|incorrect|fehlgeschlagen|fehler|error)[^\\n]{0,160}/i);
          return m ? m[0] : '';
        });
      } catch (e) {}
      throw new Error('Login did not redirect (still on /auth)' + (pageErr ? ' — page says: ' + pageErr : ''));
    }

    // Tiny grace period for SPA route transition.
    await new Promise(r => setTimeout(r, 500));

    // 2) Visit each requested path
    for (const p of (opts.paths || [])) {
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
