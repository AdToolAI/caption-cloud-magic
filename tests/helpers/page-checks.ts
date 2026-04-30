/**
 * Wiederverwendbare Page-Health-Checks für Smoke-Tests.
 * Sammelt JS-Errors und liefert eine Assertion-Funktion zurück.
 */
import { Page, ConsoleMessage, expect } from '@playwright/test';

export const BASE = process.env.BASE_URL || 'http://localhost:5173';

/** Bekannte harmlose Drittanbieter-/Browser-Fehler ignorieren. */
const IGNORED_ERRORS = [
  'favicon',
  'ResizeObserver',
  'Failed to load resource', // 404 für Optionalbilder
  'net::ERR_BLOCKED_BY_CLIENT', // AdBlocker
  'net::ERR_FAILED', // Drittanbieter-Tracking blockiert
  'manifest.json',
  'sw.js',
  'AbortError',
];

export function collectErrors(page: Page) {
  const errors: string[] = [];

  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_ERRORS.some((ignored) => text.includes(ignored))) return;
    errors.push(`console.error: ${text}`);
  });

  return {
    assertNoErrors: () => {
      if (errors.length > 0) {
        throw new Error(`Unerwartete JS-Errors:\n  - ${errors.join('\n  - ')}`);
      }
    },
    getErrors: () => [...errors],
  };
}

/**
 * Prüft eine Seite auf Grund-Gesundheit:
 *  - HTTP-Status < 400
 *  - Title-Tag nicht leer
 *  - Mindestens ein <h1> oder <h2> sichtbar
 *  - Keine harten JS-Errors
 */
export async function assertPageHealthy(
  page: Page,
  path: string,
  opts: { allowMissingHeading?: boolean; expectStatusBelow?: number } = {}
) {
  const { allowMissingHeading = false, expectStatusBelow = 400 } = opts;
  const errs = collectErrors(page);

  const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  if (resp) {
    expect(resp.status(), `HTTP-Status für ${path}`).toBeLessThan(expectStatusBelow);
  }

  // Title darf nicht leer sein
  const title = await page.title();
  expect(title.trim().length, `Title-Tag leer auf ${path}`).toBeGreaterThan(0);

  // Heading sichtbar (außer ausdrücklich erlaubt z.B. für /reset-password ohne Token)
  if (!allowMissingHeading) {
    await expect(
      page.locator('h1, h2').first(),
      `Kein h1/h2 auf ${path} gefunden`
    ).toBeVisible({ timeout: 8_000 });
  }

  errs.assertNoErrors();
}
