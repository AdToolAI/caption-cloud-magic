/**
 * Visual Regression Tests: Dashboard
 */

import { test, expect } from '@playwright/test';

test.describe('Dashboard Visual Regression', () => {
  test.use({ storageState: 'tests/.auth/user.json' });

  test('should match content studio snapshot', async ({ page }) => {
    await page.goto('/content-studio');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await expect(page).toHaveScreenshot('content-studio.png', {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test('should match video management snapshot', async ({ page }) => {
    await page.goto('/videos');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await expect(page).toHaveScreenshot('video-management.png', {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test('should match composer snapshot', async ({ page }) => {
    await page.goto('/composer');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await expect(page).toHaveScreenshot('composer.png', {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test('should match analytics snapshot', async ({ page }) => {
    await page.goto('/analytics');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await expect(page).toHaveScreenshot('analytics.png', {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });
});
