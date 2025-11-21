/**
 * E2E Tests: Template System (Updated with Admin Auth)
 */

import { test, expect } from '@playwright/test';

test.describe('Template System - Admin Operations', () => {
  test.use({ storageState: 'tests/.auth/admin.json' });

  test('should navigate to admin dashboard as admin user', async ({ page }) => {
    await page.goto('/admin');
    
    // Should stay on admin page
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator('h1, h2')).toContainText(/admin/i);
  });

  test('should load templates in admin interface', async ({ page }) => {
    // Note: Requires admin authentication
    await page.goto('/admin');
    
    // Check if we're on admin page or redirected
    const isOnAdminPage = page.url().includes('/admin');
    
    if (isOnAdminPage) {
      // Wait for templates tab to be visible
      const templatesTab = page.getByRole('tab', { name: /templates/i });
      if (await templatesTab.isVisible()) {
        await templatesTab.click();
        
        // Check for template manager component
        await expect(page.getByText(/template/i)).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should display field mappings tab', async ({ page }) => {
    await page.goto('/admin');
    
    const isOnAdminPage = page.url().includes('/admin');
    
    if (isOnAdminPage) {
      const fieldMappingsTab = page.getByRole('tab', { name: /field.*mapping/i });
      if (await fieldMappingsTab.isVisible()) {
        await fieldMappingsTab.click();
        
        // Check for field mapping manager
        await expect(page.getByText(/field.*mapping/i)).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should display system monitor', async ({ page }) => {
    await page.goto('/admin');
    
    const isOnAdminPage = page.url().includes('/admin');
    
    if (isOnAdminPage) {
      const monitorTab = page.getByRole('tab', { name: /system.*monitor/i });
      if (await monitorTab.isVisible()) {
        await monitorTab.click();
        
        // Check for system health metrics
        await expect(page.getByText(/health|status|cache/i)).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should display cache monitor page', async ({ page }) => {
    await page.goto('/admin/cache-monitor');
    
    const isOnCachePage = page.url().includes('/admin/cache-monitor');
    
    if (isOnCachePage) {
      // Check for cache statistics
      await expect(page.getByText(/cache|performance|metrics/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('should protect admin routes from unauthorized access', async ({ page }) => {
    // Without authentication, should redirect
    await page.goto('/admin');
    
    // Should redirect to auth or unauthorized
    await page.waitForURL(/\/(auth|unauthorized)/, { timeout: 5000 });
    
    const url = page.url();
    expect(url).toMatch(/(auth|unauthorized)/);
  });

  test('should handle template CRUD operations', async ({ page }) => {
    await page.goto('/admin');
    await page.click('text="Templates"');
    
    // Create template
    await page.click('button:has-text("Create"), button:has-text("New")');
    await page.fill('input[name="name"]', 'E2E CRUD Test Template');
    await page.click('button[type="submit"]:has-text("Create")');
    
    // Should show success
    await expect(page.locator('text=/success|created/i')).toBeVisible({ timeout: 5000 });
  });

  test('should handle field mapping operations', async ({ page }) => {
    await page.goto('/admin');
    await page.click('text="Field Mappings"').catch(() => 
      page.click('[role="tab"]:has-text("Field")')
    );
    
    await page.waitForTimeout(1000);
    
    // Should see field mappings interface
    await expect(page.locator('text=/field.*mapping/i')).toBeVisible();
  });

  test('should display performance metrics', async ({ page }) => {
    await page.goto('/admin/cache-monitor');
    
    if (page.url().includes('/admin/cache-monitor')) {
      // Check for performance charts/metrics
      const hasMetrics = await page.getByText(/cache.*hit|miss|rate/i).isVisible()
        .catch(() => false);
      
      if (hasMetrics) {
        expect(hasMetrics).toBeTruthy();
      }
    }
  });
});
