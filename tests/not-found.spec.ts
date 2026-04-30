/**
 * 404-Handling — NotFound-Page rendert sauber statt White-Screen.
 */
import { test, expect } from '@playwright/test';
import { BASE, collectErrors } from './helpers/page-checks';

test.describe('404 Handling', () => {
  test('Nicht-existente Route zeigt NotFound-Page', async ({ page }) => {
    const errs = collectErrors(page);
    const resp = await page.goto(`${BASE}/this-route-does-not-exist-xyz-${Date.now()}`, {
      waitUntil: 'domcontentloaded',
    });
    // Lovable-Hosting macht SPA-Fallback → 200 mit React-NotFound-Page
    if (resp) expect(resp.status()).toBeLessThan(500);

    // Body muss sichtbaren Inhalt haben (kein White-Screen)
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length, 'NotFound-Page zeigt leeren Body').toBeGreaterThan(10);

    errs.assertNoErrors();
  });
});
