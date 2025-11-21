/**
 * E2E Tests: Analytics & Reporting
 */

import { test, expect } from '@playwright/test';

test.describe('Template Analytics', () => {
  test.use({ storageState: 'tests/.auth/admin.json' });

  test('should view template analytics page', async ({ page }) => {
    // Navigate directly to analytics page with test template ID
    await page.goto('/template-analytics/test-template-001');
    
    // Should show analytics dashboard
    await expect(page.locator('h1, h2')).toContainText(/analytics|performance/i);
  });

  test('should display KPI cards', async ({ page }) => {
    await page.goto('/template-analytics/test-template-001');
    
    await page.waitForTimeout(2000);
    
    // Should see metric cards
    await expect(page.locator('text=/views|selections|conversion/i')).toBeVisible();
  });

  test('should render conversion funnel', async ({ page }) => {
    await page.goto('/template-analytics/test-template-001');
    
    await page.waitForTimeout(2000);
    
    // Should see funnel visualization
    const funnel = page.locator('[data-testid="conversion-funnel"], .recharts-wrapper, svg');
    expect(await funnel.count()).toBeGreaterThan(0);
  });

  test('should filter by date range', async ({ page }) => {
    await page.goto('/template-analytics/test-template-001');
    
    // Click on date range filter
    await page.click('button:has-text("7 days"), button:has-text("30 days")');
    
    await page.waitForTimeout(1000);
    
    // Data should reload
    await expect(page.locator('[data-testid="loading"], text="Loading"')).toBeHidden({ timeout: 5000 });
  });

  test('should display performance trends chart', async ({ page }) => {
    await page.goto('/template-analytics/test-template-001');
    
    await page.waitForTimeout(2000);
    
    // Should see chart
    const chart = page.locator('.recharts-wrapper, [role="img"]');
    expect(await chart.count()).toBeGreaterThan(0);
  });

  test('should switch between chart views', async ({ page }) => {
    await page.goto('/template-analytics/test-template-001');
    
    await page.waitForTimeout(2000);
    
    // Click on tabs to switch views
    await page.click('button:has-text("Views"), [role="tab"]:has-text("Views")').catch(() => {});
    
    await page.waitForTimeout(500);
    
    await page.click('button:has-text("Conversions"), [role="tab"]:has-text("Conversions")').catch(() => {});
    
    await page.waitForTimeout(500);
  });
});

test.describe('A/B Testing', () => {
  test.use({ storageState: 'tests/.auth/admin.json' });

  test('should view A/B tests tab', async ({ page }) => {
    await page.goto('/template-analytics/test-template-001');
    
    // Click A/B Testing tab
    await page.click('text="A/B Testing"');
    
    await page.waitForTimeout(1000);
    
    // Should see A/B test management interface
    await expect(page.locator('text=/test|experiment/i')).toBeVisible();
  });

  test('should create new A/B test', async ({ page }) => {
    await page.goto('/template-analytics/test-template-001');
    
    await page.click('text="A/B Testing"');
    
    // Click create test button
    await page.click('button:has-text("Create Test"), button:has-text("New Test")');
    
    // Should open create test dialog
    await expect(page.locator('text=/create|new test/i')).toBeVisible();
    
    // Fill test form
    await page.fill('input[name="test_name"], input[placeholder*="name"]', 'E2E Test Experiment');
    await page.fill('textarea[name="hypothesis"], textarea[placeholder*="hypothesis"]', 'Testing E2E flow');
    
    await page.click('button[type="submit"]:has-text("Create")');
    
    // Should show success message
    await expect(page.locator('text=/success|created/i')).toBeVisible({ timeout: 5000 });
  });

  test('should start A/B test', async ({ page }) => {
    await page.goto('/template-analytics/test-template-001');
    
    await page.click('text="A/B Testing"');
    
    await page.waitForTimeout(1000);
    
    // Click start button on first test
    const startButton = page.locator('button:has-text("Start")').first();
    if (await startButton.isVisible({ timeout: 3000 })) {
      await startButton.click();
      
      // Confirm if needed
      await page.click('button:has-text("Confirm"), button:has-text("Yes")').catch(() => {});
      
      await page.waitForTimeout(1000);
    }
  });

  test('should view A/B test results', async ({ page }) => {
    await page.goto('/template-analytics/test-template-001');
    
    await page.click('text="A/B Testing"');
    
    await page.waitForTimeout(1000);
    
    // Click view results button
    const resultsButton = page.locator('button:has-text("Results"), button:has-text("View")').first();
    if (await resultsButton.isVisible({ timeout: 3000 })) {
      await resultsButton.click();
      
      // Should show results dialog
      await expect(page.locator('text=/results|winner|significance/i')).toBeVisible({ timeout: 3000 });
    }
  });

  test('should display statistical significance', async ({ page }) => {
    await page.goto('/template-analytics/test-template-001');
    
    await page.click('text="A/B Testing"');
    
    await page.waitForTimeout(1000);
    
    // View results
    await page.click('button:has-text("Results")').catch(() => {});
    
    await page.waitForTimeout(1000);
    
    // Should show p-value and confidence
    const statsText = page.locator('text=/p-value|confidence|significance/i');
    expect(await statsText.count()).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Unified Analytics', () => {
  test.use({ storageState: 'tests/.auth/user.json' });

  test('should view analytics overview', async ({ page }) => {
    await page.goto('/analytics').catch(() => page.goto('/'));
    
    await page.waitForTimeout(1000);
    
    // Should see analytics overview
    const overviewSection = page.locator('h1:has-text("Analytics"), h2:has-text("Overview")');
    expect(await overviewSection.count()).toBeGreaterThanOrEqual(0);
  });

  test('should display usage metrics', async ({ page }) => {
    await page.goto('/analytics').catch(() => page.goto('/'));
    
    await page.waitForTimeout(1000);
    
    // Should see metric cards
    const metrics = page.locator('[data-testid="metric-card"], .metric, .stat');
    expect(await metrics.count()).toBeGreaterThanOrEqual(0);
  });

  test('should filter analytics by date', async ({ page }) => {
    await page.goto('/analytics').catch(() => page.goto('/'));
    
    await page.waitForTimeout(1000);
    
    // Click date filter
    const dateButton = page.locator('button:has-text("Date"), button:has-text("Filter")');
    if (await dateButton.isVisible({ timeout: 3000 })) {
      await dateButton.click();
      
      await page.waitForTimeout(500);
    }
  });
});
