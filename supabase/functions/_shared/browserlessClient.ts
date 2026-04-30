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
  context?: Record<string, unknown>,
  timeoutMs = 130_000,
): Promise<BrowserlessActionResult> {
  const apiKey = Deno.env.get("BROWSERLESS_API_KEY");
  if (!apiKey) {
    return { ok: false, error: "BROWSERLESS_API_KEY not configured", durationMs: 0 };
  }

  const start = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  // Browserless server-side timeout cap is 60s on standard plan. Use full 60s.
  // Slow routes are mitigated via blockAds + per-step timeouts inside the script.
  const SERVER_TIMEOUT_MS = 60_000;

  try {
    const res = await fetch(
      `${BROWSERLESS_BASE}/function?token=${encodeURIComponent(apiKey)}&timeout=${SERVER_TIMEOUT_MS}&blockAds=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, context: context ?? {} }),
        signal: ctrl.signal,
      }
    );

    const durationMs = Date.now() - start;
    const rawText = await res.text();
    const rawSnippet = rawText.slice(0, 1500);

    if (!res.ok) {
      return {
        ok: false,
        error: `Browserless ${res.status}: ${rawText.slice(0, 500)}`,
        rawResponse: rawSnippet,
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
        rawResponse: rawSnippet,
        httpStatus: res.status,
        durationMs,
      };
    }

    // Browserless wraps the returned `{ data, type }` — payload sits in data.data
    // when the function returns the canonical shape. Support both.
    const payload = data?.data && typeof data.data === "object" ? data.data : data;

    if (!payload || typeof payload !== "object") {
      return {
        ok: false,
        error: "Browserless returned unexpected payload shape",
        rawResponse: rawSnippet,
        httpStatus: res.status,
        durationMs,
        data: payload,
      };
    }

    return {
      ok: payload.ok !== false,
      screenshot: payload.screenshot,
      url: payload.url,
      title: payload.title,
      consoleLogs: payload.consoleLogs ?? [],
      networkErrors: payload.networkErrors ?? [],
      domSummary: payload.domSummary,
      data: payload,
      error: payload.error,
      rawResponse: rawSnippet,
      httpStatus: res.status,
      durationMs,
    };
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? `Browserless fetch aborted after ${timeoutMs}ms`
        : `Browserless fetch failed: ${e?.message ?? String(e)}`,
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(t);
  }
}

// ESM-style Puppeteer function. Receives `context` from the JSON body.
// Selectors target our Auth.tsx: <Input id="email" type="email"> + <Input id="password" type="password">.
// We push step heartbeats into result.pathResults so the cockpit can show exactly where we stopped.
// Step types supported by the interactive script:
//   { type: "navigate", path: string, wait_ms?: number }
//   { type: "click", selector: string, timeout_ms?: number }
//   { type: "click_text", text: string, role?: "button"|"link"|"any", timeout_ms?: number }
//   { type: "fill", selector: string, value: string, timeout_ms?: number }
//   { type: "wait_for", selector: string, timeout_ms?: number }
//   { type: "expect_visible", selector?: string, text?: string, timeout_ms?: number }
//   { type: "expect_no_console_error", since_ms?: number }
//   { type: "sleep", ms: number }
//   { type: "set_header", name: "x-qa-mock", value: "true" }   (set once at run start)
//
// Each step records a heartbeat. Failures push a step-level error to result.stepErrors
// AND set result.ok = false so the executor reports a "workflow" bug.
export function buildInteractiveScript(): string {
  return `
export default async ({ page, context }) => {
  const opts = context || {};
  const consoleLogs = [];
  const networkErrors = [];

  page.on('console', m => {
    try {
      const loc = (typeof m.location === 'function') ? m.location() : null;
      consoleLogs.push({
        type: m.type(),
        text: String(m.text()).slice(0, 500),
        url: loc && loc.url ? String(loc.url).slice(0, 300) : undefined,
        line: loc && loc.lineNumber ? loc.lineNumber : undefined,
      });
    } catch (e) {}
  });
  page.on('pageerror', err => {
    consoleLogs.push({
      type: 'pageerror',
      text: String(err && err.message || err).slice(0, 500),
      stack: err && err.stack ? String(err.stack).slice(0, 800) : undefined,
    });
  });
  page.on('response', r => {
    try {
      const status = r.status();
      if (status >= 400) {
        const req = r.request();
        let postData;
        try {
          if (req && typeof req.postData === 'function') {
            const pd = req.postData();
            if (pd) postData = String(pd).slice(0, 400);
          }
        } catch (e) {}
        networkErrors.push({
          url: r.url(),
          status,
          method: req && typeof req.method === 'function' ? req.method() : undefined,
          resourceType: req && typeof req.resourceType === 'function' ? req.resourceType() : undefined,
          postData,
        });
      }
    } catch (e) {}
  });
  page.on('requestfailed', req => {
    try {
      const failure = typeof req.failure === 'function' ? req.failure() : null;
      networkErrors.push({
        url: req.url(),
        status: 0,
        method: typeof req.method === 'function' ? req.method() : undefined,
        resourceType: typeof req.resourceType === 'function' ? req.resourceType() : undefined,
        error: failure && failure.errorText ? failure.errorText : 'request-failed',
      });
    } catch (e) {}
  });

  const result = {
    ok: true, screenshot: null, loginScreenshot: null,
    url: '', title: '', consoleLogs, networkErrors, domSummary: '', pathResults: [],
  };

  const beat = (label, extra) => {
    const entry = { phase: 'login-step', label: String(label), ts: Date.now() };
    if (extra && typeof extra === 'object') Object.assign(entry, extra);
    result.pathResults.push(entry);
  };

  const grabLoginShot = async () => {
    try {
      const s = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 55, fullPage: true });
      result.loginScreenshot = 'data:image/jpeg;base64,' + s;
    } catch (e) {}
  };

  try {
    beat('start', { baseUrl: opts.baseUrl, paths: (opts.paths || []).length });

    // 1) Open auth page
    await page.goto(opts.baseUrl + '/auth', { waitUntil: 'networkidle2', timeout: 30000 });
    const landedUrl = page.url();
    beat('auth-page-loaded', { url: landedUrl });

    // Detect Lovable preview auth bridge — Browserless cannot pass that gate, so fail fast.
    if (/lovable\\.dev\\/(login|auth-bridge)/i.test(landedUrl)) {
      await grabLoginShot();
      throw new Error(
        'QA target is protected by Lovable preview auth bridge (' + landedUrl.slice(0, 120) +
        '). Set QA_TARGET_URL secret to a public domain like https://useadtool.ai.'
      );
    }

    // Wait for BOTH fields. Prefer ids (Auth.tsx uses #email / #password), fall back to type selectors.
    try {
      await page.waitForSelector('input#email, input[type="email"]', { visible: true, timeout: 20000 });
      await page.waitForSelector('input#password, input[type="password"]', { visible: true, timeout: 20000 });
      beat('auth-fields-visible');
    } catch (waitErr) {
      await grabLoginShot();
      throw new Error('Auth form not ready: ' + String(waitErr && waitErr.message || waitErr).slice(0, 180));
    }

    // Small extra settle so React state listeners attach before we type.
    await new Promise(r => setTimeout(r, 250));

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
    beat('credentials-typed');

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
    beat('submit-clicked', { via: submitClicked });

    // Wait until we leave /auth (= login redirect happened).
    try {
      await page.waitForFunction(
        () => !location.pathname.startsWith('/auth'),
        { timeout: 25000 }
      );
      beat('redirect-from-auth', { url: page.url() });
    } catch (redirErr) {
      await grabLoginShot();
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

    // ---- Optional QA-mock header injection (set once before any nav) ----
    if (opts.extraHeaders && typeof opts.extraHeaders === 'object') {
      try {
        await page.setExtraHTTPHeaders(opts.extraHeaders);
        beat('headers-set', { keys: Object.keys(opts.extraHeaders) });
      } catch (e) {
        beat('headers-set-failed', { error: String(e).slice(0, 120) });
      }
    }

    // ---- INTERACTIVE STEP ENGINE ----
    // Backwards compatible: if opts.steps is empty, fall back to opts.paths.
    const steps = Array.isArray(opts.steps) && opts.steps.length > 0
      ? opts.steps
      : (opts.paths || []).map(p => ({ type: 'navigate', path: p }));

    const stepErrors = [];
    let consoleErrorBaseline = consoleLogs.filter(l => l.type === 'error' || l.type === 'pageerror').length;

    const findByText = async (text, role) => {
      // role: 'button' | 'link' | 'any'
      const handle = await page.evaluateHandle((searchText, searchRole) => {
        const re = new RegExp(searchText.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), 'i');
        let candidates;
        if (searchRole === 'button') {
          candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
        } else if (searchRole === 'link') {
          candidates = Array.from(document.querySelectorAll('a, [role="link"]'));
        } else {
          candidates = Array.from(document.querySelectorAll('button, a, [role="button"], [role="link"], [role="tab"], [role="menuitem"]'));
        }
        for (const el of candidates) {
          const t = (el.textContent || '').trim();
          if (t && re.test(t)) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) return el;
          }
        }
        return null;
      }, text, role || 'any');
      const el = handle.asElement();
      if (!el) { handle.dispose && handle.dispose(); return null; }
      return el;
    };

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] || {};
      const tStep = Date.now();
      const label = step.type + (step.path ? ' ' + step.path : step.selector ? ' ' + step.selector : step.text ? ' "' + step.text + '"' : '');
      try {
        if (step.type === 'navigate') {
          await page.goto(opts.baseUrl + step.path, { waitUntil: 'domcontentloaded', timeout: step.timeout_ms || 15000 });
          await new Promise(r => setTimeout(r, step.wait_ms != null ? step.wait_ms : 800));
          const title = await page.title();
          result.pathResults.push({ path: step.path, ok: true, ms: Date.now() - tStep, title, step_index: i });
        }
        else if (step.type === 'click') {
          await page.waitForSelector(step.selector, { visible: true, timeout: step.timeout_ms || 8000 });
          await page.click(step.selector);
          await new Promise(r => setTimeout(r, 250));
        }
        else if (step.type === 'click_text') {
          const deadline = Date.now() + (step.timeout_ms || 8000);
          let el = null;
          while (Date.now() < deadline && !el) {
            el = await findByText(step.text, step.role);
            if (!el) await new Promise(r => setTimeout(r, 200));
          }
          if (!el) throw new Error('Element with text "' + step.text + '" not found (role=' + (step.role || 'any') + ')');
          await el.click();
          await new Promise(r => setTimeout(r, 250));
        }
        else if (step.type === 'fill') {
          await page.waitForSelector(step.selector, { visible: true, timeout: step.timeout_ms || 8000 });
          const h = await page.$(step.selector);
          await h.click({ clickCount: 3 });
          await h.type(String(step.value), { delay: 10 });
        }
        else if (step.type === 'wait_for') {
          await page.waitForSelector(step.selector, { visible: true, timeout: step.timeout_ms || 10000 });
        }
        else if (step.type === 'expect_visible') {
          if (step.selector) {
            await page.waitForSelector(step.selector, { visible: true, timeout: step.timeout_ms || 8000 });
          } else if (step.text) {
            const deadline = Date.now() + (step.timeout_ms || 8000);
            let found = false;
            while (Date.now() < deadline && !found) {
              found = await page.evaluate((t) => {
                const re = new RegExp(t.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), 'i');
                return re.test(document.body && document.body.innerText || '');
              }, step.text);
              if (!found) await new Promise(r => setTimeout(r, 200));
            }
            if (!found) throw new Error('Expected text "' + step.text + '" not visible');
          }
        }
        else if (step.type === 'expect_no_console_error') {
          const currentErrs = consoleLogs.filter(l => l.type === 'error' || l.type === 'pageerror').length;
          const newErrs = currentErrs - consoleErrorBaseline;
          if (newErrs > 0) {
            const recent = consoleLogs.filter(l => l.type === 'error' || l.type === 'pageerror').slice(-newErrs);
            throw new Error('Console errors after step ' + (i - 1) + ': ' + recent.map(r => r.text.slice(0, 100)).join(' | '));
          }
          consoleErrorBaseline = currentErrs;
        }
        else if (step.type === 'sleep') {
          await new Promise(r => setTimeout(r, step.ms || 500));
        }
        else {
          throw new Error('Unknown step type: ' + step.type);
        }
        beat('step-' + i + '-ok', { label, ms: Date.now() - tStep });
      } catch (e) {
        const errMsg = String(e && e.message || e).slice(0, 300);
        stepErrors.push({ step_index: i, type: step.type, label, error: errMsg, ms: Date.now() - tStep });
        beat('step-' + i + '-FAIL', { label, error: errMsg });
        result.ok = false;
        if (step.type === 'navigate') {
          result.pathResults.push({ path: step.path, ok: false, ms: Date.now() - tStep, error: errMsg, step_index: i });
        }
        // Continue to next step so we collect all failures (not just the first).
      }
    }
    result.stepErrors = stepErrors;

    beat('finalizing');
  } catch (e) {
    result.ok = false;
    result.error = String(e && e.message || e).slice(0, 500);
    beat('aborted', { error: result.error });
  } finally {
    // Always try to capture final state, even if the run aborted earlier.
    try {
      const shot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60, fullPage: false });
      result.screenshot = 'data:image/jpeg;base64,' + shot;
    } catch (e) {}
    try { result.url = page.url(); } catch (e) {}
    try { result.title = await page.title(); } catch (e) {}
    try {
      result.domSummary = await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll('h1,h2')).slice(0, 10).map(h => (h.textContent || '').trim()).filter(Boolean);
        return JSON.stringify({ headings, bodyLen: (document.body && document.body.innerText || '').length });
      });
    } catch (e) {}
  }

  return {
    data: result,
    type: 'application/json',
  };
};
`.trim();
}

// Backwards-compatible alias — older code imports buildSmokeNavigationScript.
export const buildSmokeNavigationScript = buildInteractiveScript;
