/**
 * Critical User Journeys — Phase 2
 * 
 * Diese Tests laufen gegen die Live Preview/Published URL und benötigen
 * KEINE Test-Credentials. Sie decken die 5 wichtigsten öffentlichen Pfade
 * ab und fangen damit erfahrungsgemäß ~80% aller Regressionen.
 * 
 * Konfiguration:
 *  - BASE_URL Env-Var überschreibt die playwright.config baseURL
 *    (z.B. https://caption-cloud-magic.lovable.app)
 *  - JS-Errors auf jeder Seite werden als Test-Failure gewertet
 */

import { test, expect, Page, ConsoleMessage } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

/** Sammelt JS-Errors während des Tests und failt am Ende, falls welche auftraten. */
function collectErrors(page: Page): { assertNoErrors: () => void } {
  const errors: string[] = [];

  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Bekannte harmlose Drittanbieter-Errors ignorieren
    if (
      text.includes('favicon') ||
      text.includes('ResizeObserver') ||
      text.includes('Failed to load resource') || // 404 für Optionalbilder
      text.includes('net::ERR_BLOCKED_BY_CLIENT') // AdBlocker
    ) {
      return;
    }
    errors.push(`console.error: ${text}`);
  });

  return {
    assertNoErrors: () => {
      if (errors.length > 0) {
        throw new Error(`Unerwartete JS-Errors auf der Seite:\n  - ${errors.join('\n  - ')}`);
      }
    },
  };
}

test.describe('Critical Journeys', () => {
  // === Journey 1: Landing Page lädt komplett ohne JS-Errors ===
  test('Landing Page lädt sauber & zeigt Pricing + Legal-Links', async ({ page }) => {
    const { assertNoErrors } = collectErrors(page);

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });

    // Wait for hydration so dynamic content (pricing/footer) has time to render
    await page.waitForLoadState('networkidle').catch(() => {});

    // Pricing-Indikation: entweder ein Preis-Pattern auf der Landing
    // ODER ein Link/Button zur Pricing-Seite. Beides ist akzeptabel.
    const hasPriceOnLanding = await page
      .getByText(/\d+[,.]\d{2}\s*€|€\s*\d+|\$\s*\d+|kostenlos|free\s*plan|monatlich|per\s*month/i)
      .first()
      .isVisible()
      .catch(() => false);
    const hasPricingLink = await page
      .getByRole('link', { name: /pricing|preise|plan|tarif/i })
      .first()
      .isVisible()
      .catch(() => false);
    const hasPricingButton = await page
      .getByRole('button', { name: /pricing|preise|plan|tarif|jetzt\s*starten|get\s*started/i })
      .first()
      .isVisible()
      .catch(() => false);
    expect(
      hasPriceOnLanding || hasPricingLink || hasPricingButton,
      'Weder Preis-Indikation noch Pricing-Link/Button auf Landing gefunden'
    ).toBeTruthy();

    // Legal-Footer (Pflicht für DACH) — robust: Link ODER Text reicht
    const hasImpressumLink = await page
      .getByRole('link', { name: /impressum/i })
      .first()
      .isVisible()
      .catch(() => false);
    const hasDatenschutzLink = await page
      .getByRole('link', { name: /datenschutz|privacy/i })
      .first()
      .isVisible()
      .catch(() => false);
    expect(
      hasImpressumLink || hasDatenschutzLink,
      'Weder Impressum- noch Datenschutz-Link im Footer gefunden'
    ).toBeTruthy();

    assertNoErrors();
  });

  // === Journey 2: Auth-Seite ist erreichbar & rendert Login-Formular ===
  test('Auth-Seite rendert Login-Formular', async ({ page }) => {
    const { assertNoErrors } = collectErrors(page);

    await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });

    // Email + Password Inputs vorhanden
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('input[type="password"]').first()).toBeVisible();

    // Mindestens ein Submit-Button
    await expect(
      page.getByRole('button', { name: /anmelden|sign in|einloggen|log in/i }).first()
    ).toBeVisible();

    assertNoErrors();
  });

  // === Journey 3: Geschützte Routen redirecten auf /auth (kein 500) ===
  test('Geschützte Routen redirecten unauth auf /auth', async ({ page }) => {
    // Nur echte ProtectedRoute-Pfade aus App.tsx — /dashboard existiert nicht
    const protectedPaths = ['/video-composer', '/picture-studio', '/account'];

    for (const path of protectedPaths) {
      const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      // Kein 5xx
      if (resp) {
        expect(resp.status(), `Status für ${path}`).toBeLessThan(500);
      }
      // Entweder Auth-Redirect oder Auth-Form sichtbar
      await page.waitForTimeout(1500);
      const url = page.url();
      const onAuthPage =
        url.includes('/auth') ||
        (await page.locator('input[type="email"]').first().isVisible().catch(() => false));
      expect(onAuthPage, `Erwartete Auth-Redirect für ${path}, war ${url}`).toBeTruthy();
    }
  });

  // === Journey 4: Legal-Seiten sind erreichbar (Compliance-kritisch) ===
  test('Legal-Seiten sind erreichbar', async ({ page }) => {
    const legalPaths = ['/impressum', '/datenschutz', '/agb'];

    for (const path of legalPaths) {
      const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      if (resp) {
        expect(resp.status(), `Status für ${path}`).toBeLessThan(400);
      }
      await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // === Journey 5: Performance-Budget — Landing Page < 4s ===
  test('Landing Page lädt unter 4 Sekunden', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toBeVisible();
    const loadTime = Date.now() - start;

    console.log(`Landing Page: ${loadTime}ms`);
    expect(loadTime, `Load-Time war ${loadTime}ms (Budget: 4000ms)`).toBeLessThan(4000);
  });
});
