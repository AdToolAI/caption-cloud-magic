/**
 * Performance-Budgets — pro kritischer Page eine Load-Time-Schwelle.
 */
import { test, expect } from '@playwright/test';
import { BASE } from './helpers/page-checks';

const BUDGETS: Array<{ path: string; budgetMs: number }> = [
  { path: '/', budgetMs: 4_000 },
  { path: '/pricing', budgetMs: 4_500 },
  { path: '/auth', budgetMs: 3_500 },
];

test.describe('Performance Budgets', () => {
  for (const { path, budgetMs } of BUDGETS) {
    test(`${path} lädt unter ${budgetMs}ms`, async ({ page }) => {
      const start = Date.now();
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('h1, h2, form').first()).toBeVisible({ timeout: budgetMs });
      const loadTime = Date.now() - start;
      console.log(`${path}: ${loadTime}ms (Budget: ${budgetMs}ms)`);
      expect(loadTime, `Load-Time ${path} war ${loadTime}ms`).toBeLessThan(budgetMs);
    });
  }
});
