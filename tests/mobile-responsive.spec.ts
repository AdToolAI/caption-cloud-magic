/**
 * Mobile-Responsiveness Smoke — kein horizontaler Scroll auf 375px.
 */
import { test, expect } from '@playwright/test';
import { BASE } from './helpers/page-checks';

test.use({ viewport: { width: 375, height: 667 } });

const MOBILE_ROUTES = ['/', '/pricing', '/auth'];

test.describe('Mobile Responsive (iPhone SE 375px)', () => {
  for (const path of MOBILE_ROUTES) {
    test(`${path} hat keinen horizontalen Scroll`, async ({ page }) => {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      // Kleine Toleranz (1px) für Sub-Pixel-Rendering
      expect(
        scrollWidth,
        `Horizontaler Overflow auf ${path}: scrollWidth=${scrollWidth}, clientWidth=${clientWidth}`
      ).toBeLessThanOrEqual(clientWidth + 1);
    });
  }
});
