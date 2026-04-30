/**
 * Auth-Flow Smoke — KEIN echter Login. Prüft nur dass die Forms rendern.
 */
import { test, expect } from '@playwright/test';
import { BASE, collectErrors } from './helpers/page-checks';

test.describe('Auth-Flows (no login)', () => {
  test('/auth zeigt Email + Password + Submit', async ({ page }) => {
    const errs = collectErrors(page);
    await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    errs.assertNoErrors();
  });

  test('/forgot-password zeigt Email-Eingabe', async ({ page }) => {
    const errs = collectErrors(page);
    await page.goto(`${BASE}/forgot-password`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    errs.assertNoErrors();
  });

  test('/reset-password ohne Token bricht nicht hart', async ({ page }) => {
    // Ohne ?type=recovery sollte die Seite trotzdem rendern (Hint/Error/Form)
    const resp = await page.goto(`${BASE}/reset-password`, { waitUntil: 'domcontentloaded' });
    if (resp) expect(resp.status()).toBeLessThan(500);
    // Body muss sichtbaren Inhalt haben (kein White-Screen)
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length, 'Reset-Password zeigt leeren Body').toBeGreaterThan(20);
  });
});
