/**
 * Visual Regression Tests: Landing Page
 */

import { test, expect } from '@playwright/test';

test.describe('Landing Page Visual Regression', () => {
  test('should match hero section snapshot', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of hero section
    const hero = page.locator('section, .hero, [data-testid="hero"]').first();
    await expect(hero).toHaveScreenshot('hero-section.png', {
      maxDiffPixels: 100,
    });
  });

  test('should match pricing section snapshot', async ({ page }) => {
    await page.goto('/');
    
    // Scroll to pricing section
    await page.locator('#pricing, [data-testid="pricing"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    
    const pricing = page.locator('#pricing, [data-testid="pricing"]');
    await expect(pricing).toHaveScreenshot('pricing-section.png', {
      maxDiffPixels: 100,
    });
  });

  test('should match features section snapshot', async ({ page }) => {
    await page.goto('/');
    
    // Scroll to features
    await page.locator('#features, [data-testid="features"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    
    const features = page.locator('#features, [data-testid="features"]');
    await expect(features).toHaveScreenshot('features-section.png', {
      maxDiffPixels: 100,
    });
  });

  test('should match full landing page snapshot', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForLoadState('networkidle');
    
    // Full page screenshot
    await expect(page).toHaveScreenshot('landing-page-full.png', {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test('should match mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('landing-page-mobile.png', {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });
});
