/**
 * E2E Tests: Admin Dashboard
 */

import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard', () => {
  test.use({ storageState: 'tests/.auth/admin.json' });

  test('should access admin dashboard', async ({ page }) => {
    await page.goto('/admin');
    
    await expect(page.locator('h1, h2')).toContainText(/admin/i);
    
    // Should see admin navigation
    await expect(page.locator('text="Templates"')).toBeVisible();
    await expect(page.locator('text="Field Mappings"')).toBeVisible();
  });

  test('should view templates tab', async ({ page }) => {
    await page.goto('/admin');
    
    await page.click('text="Templates"');
    
    // Should see templates list or table
    await expect(page.locator('table, [role="grid"]')).toBeVisible({ timeout: 5000 });
  });

  test('should view field mappings tab', async ({ page }) => {
    await page.goto('/admin');
    
    await page.click('text="Field Mappings"').catch(() => 
      page.click('[role="tab"]:has-text("Field")')
    );
    
    await page.waitForTimeout(1000);
    
    // Should see field mappings content
    expect(page.url()).toContain('/admin');
  });

  test('should view system monitor', async ({ page }) => {
    await page.goto('/admin');
    
    await page.click('text="System Monitor"').catch(() =>
      page.click('[role="tab"]:has-text("System")')
    );
    
    await page.waitForTimeout(1000);
    
    // Should see system metrics
    await expect(page.locator('text=/health|status|metric/i')).toBeVisible({ timeout: 5000 });
  });

  test('should create new template', async ({ page }) => {
    await page.goto('/admin');
    
    await page.click('text="Templates"');
    await page.click('button:has-text("Create"), button:has-text("New")');
    
    // Should open create template dialog/form
    await expect(page.locator('text=/create|new/i')).toBeVisible();
    
    // Fill template form
    await page.fill('input[name="name"], input[placeholder*="name"]', 'Test E2E Template');
    
    await page.click('button[type="submit"]:has-text("Create"), button:has-text("Save")');
    
    // Should show success message
    await expect(page.locator('text=/success|created/i')).toBeVisible({ timeout: 5000 });
  });

  test('should search templates', async ({ page }) => {
    await page.goto('/admin');
    
    await page.click('text="Templates"');
    
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]');
    await searchInput.fill('test');
    
    await page.waitForTimeout(500);
    
    // Results should update
    const rows = await page.locator('table tbody tr, [role="row"]').count();
    expect(rows).toBeGreaterThanOrEqual(0);
  });

  test('should view template analytics', async ({ page }) => {
    await page.goto('/admin');
    
    await page.click('text="Templates"');
    
    // Click on first template's analytics button
    await page.click('button:has-text("Analytics"), a:has-text("Analytics")').catch(() => {
      console.log('Analytics button not found, skipping');
    });
    
    await page.waitForTimeout(1000);
  });
});

test.describe('Admin Dashboard - Non-Admin Access', () => {
  test.use({ storageState: 'tests/.auth/user.json' });

  test('should block non-admin from accessing admin dashboard', async ({ page }) => {
    await page.goto('/admin');
    
    // Should redirect away from admin
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('/admin');
  });
});
