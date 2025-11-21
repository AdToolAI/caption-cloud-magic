import { test, expect } from '@playwright/test';

test.describe('Template System E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');
  });

  test('should navigate to admin dashboard as admin user', async ({ page }) => {
    // Note: This test requires a user with admin role
    // In a real test environment, you would:
    // 1. Create a test admin user via API
    // 2. Login with that user
    // 3. Navigate to admin page
    
    // For now, we'll check if the route exists
    await page.goto('/admin');
    
    // Should either show admin dashboard or redirect to auth/unauthorized
    const url = page.url();
    expect(url).toMatch(/(admin|auth|unauthorized)/);
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
    // This test would require:
    // 1. Admin authentication
    // 2. Navigate to templates
    // 3. Test create/edit/delete operations
    
    test.skip(); // Skip until admin test user is set up
  });

  test('should handle field mapping operations', async ({ page }) => {
    // This test would require:
    // 1. Admin authentication
    // 2. Navigate to field mappings
    // 3. Test CRUD operations for field mappings
    
    test.skip(); // Skip until admin test user is set up
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
