import { test, expect } from '@playwright/test';

test.describe('Remotion Rendering', () => {
  test('ProductAd template renders successfully', async ({ page }) => {
    await page.goto('/content-studio');
    
    // Wait for templates to load
    await page.waitForSelector('[data-template-card]', { timeout: 10000 });
    
    // Click on Product Ad template
    await page.click('text=Product Ad');
    
    // Fill customizations
    await page.fill('[name="imageUrl"]', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e');
    await page.fill('[name="productName"]', 'Test Product');
    await page.fill('[name="tagline"]', 'Amazing test product');
    await page.fill('[name="ctaText"]', 'Buy Now');
    
    // Select Remotion engine
    await page.click('[id="remotion"]');
    
    // Start render
    await page.click('text=Video erstellen');
    
    // Wait for completion (max 2 min)
    await page.waitForSelector('[data-render-status="completed"]', { timeout: 120000 });
    
    // Verify video URL exists
    const videoUrl = await page.getAttribute('[data-video-url]', 'href');
    expect(videoUrl).toBeTruthy();
    expect(videoUrl).toContain('http');
  });

  test('Live preview works with Remotion Player', async ({ page }) => {
    await page.goto('/content-studio');
    
    await page.waitForSelector('[data-template-card]', { timeout: 10000 });
    
    // Hover over template to trigger preview
    await page.hover('[data-template-card]:first-child');
    
    // Wait for Remotion Player to appear
    await page.waitForSelector('[data-remotion-player]', { timeout: 5000 });
    
    // Verify player controls are visible
    const playButton = await page.locator('[data-remotion-player] button[aria-label*="play"]');
    expect(await playButton.isVisible()).toBeTruthy();
  });

  test('Render engine selection persists', async ({ page }) => {
    await page.goto('/settings');
    
    // Select Remotion
    await page.click('[id="remotion"]');
    
    // Reload page
    await page.reload();
    
    // Verify Remotion is still selected
    const remotionRadio = await page.locator('[id="remotion"]');
    expect(await remotionRadio.isChecked()).toBeTruthy();
  });

  test('Credits are correctly deducted for Remotion renders', async ({ page }) => {
    await page.goto('/content-studio');
    
    // Get initial credit balance
    const initialCredits = await page.textContent('[data-credit-balance]');
    const initialBalance = parseInt(initialCredits?.replace(/\D/g, '') || '0');
    
    // Create a video with Remotion
    await page.click('[data-template-card]:first-child');
    await page.click('[id="remotion"]');
    await page.click('text=Video erstellen');
    
    await page.waitForSelector('[data-render-status="completed"]', { timeout: 120000 });
    
    // Get new credit balance
    const newCredits = await page.textContent('[data-credit-balance]');
    const newBalance = parseInt(newCredits?.replace(/\D/g, '') || '0');
    
    // Verify 5 credits were deducted (Remotion cost)
    expect(initialBalance - newBalance).toBe(5);
  });

  test('Fallback to Shotstack when Remotion fails', async ({ page }) => {
    await page.goto('/content-studio');
    
    // Simulate Remotion failure by using invalid template
    await page.click('[data-template-card]:first-child');
    await page.click('[id="remotion"]');
    
    // Inject error into customizations
    await page.evaluate(() => {
      localStorage.setItem('force_remotion_error', 'true');
    });
    
    await page.click('text=Video erstellen');
    
    // Should automatically fallback to Shotstack
    await page.waitForSelector('text=Shotstack wird verwendet', { timeout: 5000 });
    
    // Verify render still completes
    await page.waitForSelector('[data-render-status="completed"]', { timeout: 120000 });
  });
});

test.describe('Remotion Performance', () => {
  test('Remotion renders faster than Shotstack', async ({ page }) => {
    // Test Remotion render time
    await page.goto('/content-studio');
    await page.click('[data-template-card]:first-child');
    await page.click('[id="remotion"]');
    
    const remotionStart = Date.now();
    await page.click('text=Video erstellen');
    await page.waitForSelector('[data-render-status="completed"]', { timeout: 120000 });
    const remotionTime = Date.now() - remotionStart;
    
    // Test Shotstack render time
    await page.goto('/content-studio');
    await page.click('[data-template-card]:first-child');
    await page.click('[id="shotstack"]');
    
    const shotstackStart = Date.now();
    await page.click('text=Video erstellen');
    await page.waitForSelector('[data-render-status="completed"]', { timeout: 120000 });
    const shotstackTime = Date.now() - shotstackStart;
    
    // Remotion should be at least 30% faster
    expect(remotionTime).toBeLessThan(shotstackTime * 0.7);
  });
});
