/**
 * Visual Regression Tests: Admin Interface
 */

import { test, expect } from '@playwright/test';

test.describe('Admin Interface Visual Regression', () => {
  test.use({ storageState: 'tests/.auth/admin.json' });

  test('should match admin dashboard snapshot', async ({ page }) => {
    await page.goto('/admin');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await expect(page).toHaveScreenshot('admin-dashboard.png', {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test('should match templates tab snapshot', async ({ page }) => {
    await page.goto('/admin');
    
    await page.click('text="Templates"');
    await page.waitForTimeout(1000);
    
    await expect(page).toHaveScreenshot('admin-templates.png', {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test('should match field mappings tab snapshot', async ({ page }) => {
    await page.goto('/admin');
    
    await page.click('text="Field Mappings"').catch(() => 
      page.click('[role="tab"]:has-text("Field")')
    );
    await page.waitForTimeout(1000);
    
    await expect(page).toHaveScreenshot('admin-field-mappings.png', {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test('should match system monitor snapshot', async ({ page }) => {
    await page.goto('/admin');
    
    await page.click('text="System Monitor"').catch(() =>
      page.click('[role="tab"]:has-text("System")')
    );
    await page.waitForTimeout(1000);
    
    await expect(page).toHaveScreenshot('admin-system-monitor.png', {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test('should match cache monitor page snapshot', async ({ page }) => {
    await page.goto('/admin/cache-monitor');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await expect(page).toHaveScreenshot('admin-cache-monitor.png', {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test('should match template analytics page snapshot', async ({ page }) => {
    await page.goto('/template-analytics/test-template-001');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await expect(page).toHaveScreenshot('template-analytics.png', {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });
});
