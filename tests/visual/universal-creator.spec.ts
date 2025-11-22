/**
 * Visual Regression Tests: Universal Creator UI
 * Tests visual consistency of Scene Timeline, Animation Selector, and Multi-Format Selection
 */

import { test, expect } from '@playwright/test';
import { login } from '../fixtures/auth-helpers';

test.describe('Universal Creator Visual Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'user');
  });

  test('Scene Timeline UI - Empty State', async ({ page }) => {
    await page.goto('/content-studio/universal');
    
    // Navigate to scenes step
    await page.click('[data-testid="format-youtube"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Visual test');
    await page.click('button:has-text("Next")');

    // Wait for timeline to load
    await page.waitForSelector('[data-testid="scene-timeline"]', { timeout: 5000 });

    // Take screenshot of empty timeline
    await expect(page.locator('[data-testid="scene-timeline"]')).toHaveScreenshot('scene-timeline-empty.png', {
      maxDiffPixels: 100,
    });
  });

  test('Scene Timeline UI - With 3 Scenes', async ({ page }) => {
    await page.goto('/content-studio/universal');
    
    // Navigate to scenes step
    await page.click('[data-testid="format-tiktok"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Visual test with scenes');
    await page.click('button:has-text("Next")');

    // Add 3 scenes
    for (let i = 0; i < 3; i++) {
      await page.click('button:has-text("Add Scene")');
      await page.fill('input[name="duration"]', `${(i + 1) * 2}`);
      
      if (i === 0) {
        await page.click('[data-testid="background-type-color"]');
        await page.fill('input[name="color"]', '#FF5733');
      } else if (i === 1) {
        await page.click('[data-testid="background-type-image"]');
        await page.fill('input[name="imageUrl"]', 'https://example.com/image.jpg');
      } else {
        await page.click('[data-testid="background-type-video"]');
        await page.fill('input[name="videoUrl"]', 'https://example.com/video.mp4');
      }
      
      await page.click('button:has-text("Save")');
      await page.waitForTimeout(500);
    }

    // Wait for all scenes to render
    await page.waitForTimeout(1000);

    // Take screenshot of timeline with 3 scenes
    await expect(page.locator('[data-testid="scene-timeline"]')).toHaveScreenshot('scene-timeline-three-scenes.png', {
      maxDiffPixels: 200,
    });
  });

  test('Scene Timeline UI - Scene Cards with Transitions', async ({ page }) => {
    await page.goto('/content-studio/universal');
    
    await page.click('[data-testid="format-instagram-story"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Transition visual test');
    await page.click('button:has-text("Next")');

    // Add 2 scenes with transitions
    for (let i = 0; i < 2; i++) {
      await page.click('button:has-text("Add Scene")');
      await page.fill('input[name="duration"]', '5');
      
      if (i === 0) {
        await page.selectOption('select[name="transition"]', 'crossfade');
        await page.fill('input[name="transitionDuration"]', '1');
      }
      
      await page.click('button:has-text("Save")');
      await page.waitForTimeout(500);
    }

    await page.waitForTimeout(1000);

    // Take screenshot showing transition indicators
    await expect(page.locator('[data-testid="scene-timeline"]')).toHaveScreenshot('scene-timeline-with-transitions.png', {
      maxDiffPixels: 200,
    });
  });

  test('Scene Timeline UI - Drag Handles Visible', async ({ page }) => {
    await page.goto('/content-studio/universal');
    
    await page.click('[data-testid="format-youtube"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Drag handles test');
    await page.click('button:has-text("Next")');

    // Add 2 scenes
    for (let i = 0; i < 2; i++) {
      await page.click('button:has-text("Add Scene")');
      await page.click('button:has-text("Save")');
      await page.waitForTimeout(300);
    }

    // Hover over first scene to show drag handles
    await page.hover('[data-testid="scene-card-0"]');
    await page.waitForTimeout(500);

    // Take screenshot with hover state
    await expect(page.locator('[data-testid="scene-card-0"]')).toHaveScreenshot('scene-card-hover-state.png', {
      maxDiffPixels: 100,
    });
  });

  test('Animation Selector UI - Subtitle Style Editor', async ({ page }) => {
    await page.goto('/content-studio/universal');
    
    // Navigate to subtitle step
    await page.click('[data-testid="format-instagram-reel"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Animation test');
    await page.click('button:has-text("Next")'); // Scenes
    await page.click('button:has-text("Next")'); // Audio
    await page.click('button:has-text("Next")'); // Subtitles

    // Wait for subtitle editor
    await page.waitForSelector('[data-testid="subtitle-style-editor"]', { timeout: 5000 });

    // Open animation dropdown
    await page.click('select[name="animation"]');
    await page.waitForTimeout(300);

    // Take screenshot of animation options
    await expect(page.locator('[data-testid="subtitle-style-editor"]')).toHaveScreenshot('animation-selector-dropdown.png', {
      maxDiffPixels: 150,
    });
  });

  test('Animation Selector UI - With Speed Control', async ({ page }) => {
    await page.goto('/content-studio/universal');
    
    await page.click('[data-testid="format-tiktok"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Speed control test');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');

    // Select an animation
    await page.selectOption('select[name="animation"]', 'typewriter');
    await page.waitForTimeout(500);

    // Take screenshot showing speed slider
    await expect(page.locator('[data-testid="subtitle-style-editor"]')).toHaveScreenshot('animation-speed-control.png', {
      maxDiffPixels: 150,
    });
  });

  test('Animation Selector UI - Multiple Animation Types', async ({ page }) => {
    await page.goto('/content-studio/universal');
    
    await page.click('[data-testid="format-youtube"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Multiple animations test');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');

    const animations = ['fade', 'slide', 'typewriter', 'highlight', 'bounce'];
    
    for (const animation of animations) {
      await page.selectOption('select[name="animation"]', animation);
      await page.waitForTimeout(300);
      
      await expect(page.locator('[data-testid="subtitle-style-editor"]')).toHaveScreenshot(`animation-${animation}.png`, {
        maxDiffPixels: 150,
      });
    }
  });

  test('Background Animation Selector - Scene Editor', async ({ page }) => {
    await page.goto('/content-studio/universal');
    
    await page.click('[data-testid="format-instagram-story"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Background animation test');
    await page.click('button:has-text("Next")');

    // Add a scene and open editor
    await page.click('button:has-text("Add Scene")');
    await page.waitForSelector('[data-testid="scene-editor"]', { timeout: 5000 });

    // Open background animation dropdown
    await page.click('select[name="backgroundAnimation"]');
    await page.waitForTimeout(300);

    // Take screenshot
    await expect(page.locator('[data-testid="scene-editor"]')).toHaveScreenshot('background-animation-selector.png', {
      maxDiffPixels: 150,
    });
  });

  test('Multi-Format Selection UI - Export Step', async ({ page }) => {
    await page.goto('/content-studio/universal');
    
    // Navigate to export step
    await page.click('[data-testid="format-youtube"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Export test');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');

    // Wait for export options
    await page.waitForSelector('[data-testid="export-formats"]', { timeout: 5000 });

    // Take screenshot of all format options
    await expect(page.locator('[data-testid="export-formats"]')).toHaveScreenshot('export-formats-all.png', {
      maxDiffPixels: 200,
    });
  });

  test('Multi-Format Selection UI - With Selected Formats', async ({ page }) => {
    await page.goto('/content-studio/universal');
    
    await page.click('[data-testid="format-instagram-story"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Selected formats test');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');

    // Select 3 formats
    await page.check('input[name="format-instagram-story"]');
    await page.check('input[name="format-youtube"]');
    await page.check('input[name="format-tiktok"]');
    
    await page.waitForTimeout(500);

    // Take screenshot with selected formats
    await expect(page.locator('[data-testid="export-formats"]')).toHaveScreenshot('export-formats-selected.png', {
      maxDiffPixels: 200,
    });
  });

  test('Multi-Format Selection UI - Credit Cost Display', async ({ page }) => {
    await page.goto('/content-studio/universal');
    
    await page.click('[data-testid="format-youtube"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Credit cost test');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');

    // Select 5 formats to show high cost
    await page.check('input[name="format-instagram-story"]');
    await page.check('input[name="format-youtube"]');
    await page.check('input[name="format-tiktok"]');
    await page.check('input[name="format-instagram-reel"]');
    await page.check('input[name="format-facebook"]');
    
    await page.waitForTimeout(500);

    // Take screenshot showing credit calculation
    await expect(page.locator('[data-testid="credit-cost-display"]')).toHaveScreenshot('credit-cost-breakdown.png', {
      maxDiffPixels: 100,
    });
  });

  test('Complete Wizard UI - All Steps Overview', async ({ page }) => {
    await page.goto('/content-studio/universal');
    
    // Step 1: Format
    await expect(page.locator('[data-testid="wizard-step-0"]')).toHaveScreenshot('wizard-step-1-format.png', {
      maxDiffPixels: 200,
    });
    
    await page.click('[data-testid="format-youtube"]');
    await page.click('button:has-text("Next")');

    // Step 2: Content
    await expect(page.locator('[data-testid="wizard-step-1"]')).toHaveScreenshot('wizard-step-2-content.png', {
      maxDiffPixels: 200,
    });
    
    await page.fill('textarea[name="description"]', 'Complete wizard test');
    await page.click('button:has-text("Next")');

    // Step 3: Scenes
    await expect(page.locator('[data-testid="wizard-step-2"]')).toHaveScreenshot('wizard-step-3-scenes.png', {
      maxDiffPixels: 200,
    });
    
    await page.click('button:has-text("Next")');

    // Step 4: Audio
    await expect(page.locator('[data-testid="wizard-step-3"]')).toHaveScreenshot('wizard-step-4-audio.png', {
      maxDiffPixels: 200,
    });
    
    await page.click('button:has-text("Next")');

    // Step 5: Subtitles
    await expect(page.locator('[data-testid="wizard-step-4"]')).toHaveScreenshot('wizard-step-5-subtitles.png', {
      maxDiffPixels: 200,
    });
    
    await page.click('button:has-text("Next")');

    // Step 6: Export
    await expect(page.locator('[data-testid="wizard-step-5"]')).toHaveScreenshot('wizard-step-6-export.png', {
      maxDiffPixels: 200,
    });
  });

  test('Responsive UI - Mobile View', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    
    await page.goto('/content-studio/universal');
    
    await page.click('[data-testid="format-instagram-story"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Mobile test');
    await page.click('button:has-text("Next")');

    // Take screenshot of mobile timeline
    await expect(page).toHaveScreenshot('scene-timeline-mobile.png', {
      maxDiffPixels: 300,
      fullPage: true,
    });
  });

  test('Responsive UI - Tablet View', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    
    await page.goto('/content-studio/universal');
    
    await page.click('[data-testid="format-youtube"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Tablet test');
    await page.click('button:has-text("Next")');

    // Take screenshot of tablet timeline
    await expect(page).toHaveScreenshot('scene-timeline-tablet.png', {
      maxDiffPixels: 300,
      fullPage: true,
    });
  });

  test('Dark Mode UI - Scene Timeline', async ({ page }) => {
    await page.goto('/content-studio/universal');
    
    // Toggle dark mode (assuming there's a theme toggle)
    await page.click('[data-testid="theme-toggle"]').catch(() => {});
    await page.waitForTimeout(500);

    await page.click('[data-testid="format-tiktok"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Dark mode test');
    await page.click('button:has-text("Next")');

    // Add a scene
    await page.click('button:has-text("Add Scene")');
    await page.click('button:has-text("Save")');
    await page.waitForTimeout(500);

    // Take screenshot in dark mode
    await expect(page.locator('[data-testid="scene-timeline"]')).toHaveScreenshot('scene-timeline-dark-mode.png', {
      maxDiffPixels: 200,
    });
  });
});
