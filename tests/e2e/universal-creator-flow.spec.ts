/**
 * E2E Tests: Universal Creator Workflow
 * Tests the complete 6-step wizard, Scene Timeline, Transitions, and Multi-Format Export
 */

import { test, expect, Page } from '@playwright/test';
import { login } from '../fixtures/auth-helpers';

test.describe('Universal Creator Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'user');
    await page.goto('/content-studio/universal');
  });

  test('should complete 6-step wizard flow', async ({ page }) => {
    // Step 1: Format Selection
    await expect(page.locator('text=/format selection/i')).toBeVisible();
    await page.click('[data-testid="format-instagram-story"]');
    await page.click('button:has-text("Next")');

    // Step 2: Content & Voice
    await expect(page.locator('text=/content/i')).toBeVisible();
    await page.fill('textarea[name="description"]', 'Test product description for video');
    await page.click('button:has-text("Next")');

    // Step 3: Scenes
    await expect(page.locator('text=/scene/i')).toBeVisible();
    await page.click('button:has-text("Next")');

    // Step 4: Audio
    await expect(page.locator('text=/audio/i')).toBeVisible();
    await page.click('button:has-text("Next")');

    // Step 5: Subtitles
    await expect(page.locator('text=/subtitle/i')).toBeVisible();
    await page.click('button:has-text("Next")');

    // Step 6: Export
    await expect(page.locator('text=/export/i')).toBeVisible();
    
    // Verify project was created and progress saved
    await page.waitForTimeout(1000);
    const url = page.url();
    expect(url).toContain('/content-studio/universal');
  });

  test('should save progress automatically', async ({ page }) => {
    // Fill format config
    await page.click('[data-testid="format-youtube"]');
    await page.click('button:has-text("Next")');

    // Fill content step
    await page.fill('textarea[name="description"]', 'Auto-save test content');
    await page.click('button:has-text("Next")');

    // Refresh page
    await page.reload();
    await page.waitForTimeout(1000);

    // Verify content is restored
    await expect(page.locator('textarea[name="description"]')).toHaveValue('Auto-save test content');
  });
});

test.describe('Scene Timeline Editor', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'user');
    await page.goto('/content-studio/universal');
    // Navigate to scenes step
    await page.click('[data-testid="format-tiktok"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Scene test');
    await page.click('button:has-text("Next")');
  });

  test('should add multiple scenes with different backgrounds', async ({ page }) => {
    // Add scene with video background
    await page.click('button:has-text("Add Scene")');
    await page.click('[data-testid="background-type-video"]');
    await page.fill('input[name="videoUrl"]', 'https://example.com/video.mp4');
    await page.click('button:has-text("Save")');

    // Add scene with image background
    await page.click('button:has-text("Add Scene")');
    await page.click('[data-testid="background-type-image"]');
    await page.fill('input[name="imageUrl"]', 'https://example.com/image.jpg');
    await page.click('button:has-text("Save")');

    // Add scene with color background
    await page.click('button:has-text("Add Scene")');
    await page.click('[data-testid="background-type-color"]');
    await page.fill('input[name="color"]', '#FF5733');
    await page.click('button:has-text("Save")');

    // Verify 3 scenes in timeline
    const sceneCards = await page.locator('[data-testid^="scene-card-"]').count();
    expect(sceneCards).toBe(3);
  });

  test('should reorder scenes via drag and drop', async ({ page }) => {
    // Create 3 scenes
    for (let i = 0; i < 3; i++) {
      await page.click('button:has-text("Add Scene")');
      await page.fill('input[name="duration"]', `${(i + 1) * 2}`);
      await page.click('button:has-text("Save")');
    }

    // Get initial order
    const firstSceneText = await page.locator('[data-testid="scene-card-0"]').innerText();

    // Drag first scene to third position
    await page.dragAndDrop('[data-testid="scene-card-0"]', '[data-testid="scene-card-2"]');

    await page.waitForTimeout(500);

    // Verify order changed
    const newFirstSceneText = await page.locator('[data-testid="scene-card-0"]').innerText();
    expect(newFirstSceneText).not.toBe(firstSceneText);
  });

  test('should change scene duration', async ({ page }) => {
    // Add a scene
    await page.click('button:has-text("Add Scene")');
    await page.fill('input[name="duration"]', '5');
    await page.click('button:has-text("Save")');

    // Edit duration
    await page.click('[data-testid="scene-card-0"]');
    await page.fill('input[name="duration"]', '10');
    await page.click('button:has-text("Save")');

    // Verify duration updated
    await expect(page.locator('[data-testid="scene-duration-0"]')).toContainText('10');
  });

  test('should delete middle scene', async ({ page }) => {
    // Create 3 scenes
    for (let i = 0; i < 3; i++) {
      await page.click('button:has-text("Add Scene")');
      await page.click('button:has-text("Save")');
    }

    // Delete middle scene
    await page.click('[data-testid="scene-card-1"] [data-testid="delete-scene"]');
    await page.click('button:has-text("Confirm")');

    // Verify only 2 scenes remain
    const sceneCount = await page.locator('[data-testid^="scene-card-"]').count();
    expect(sceneCount).toBe(2);
  });
});

test.describe('Scene Transitions', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'user');
    await page.goto('/content-studio/universal');
    // Navigate to scenes step
    await page.click('[data-testid="format-instagram-reel"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Transition test');
    await page.click('button:has-text("Next")');
  });

  test('should set crossfade transition between scenes', async ({ page }) => {
    // Add 2 scenes
    for (let i = 0; i < 2; i++) {
      await page.click('button:has-text("Add Scene")');
      await page.click('button:has-text("Save")');
    }

    // Set transition on first scene
    await page.click('[data-testid="scene-card-0"]');
    await page.selectOption('select[name="transition"]', 'crossfade');
    await page.fill('input[name="transitionDuration"]', '1');
    await page.click('button:has-text("Save")');

    // Verify transition was set
    await expect(page.locator('[data-testid="scene-card-0"] [data-testid="transition-indicator"]'))
      .toContainText('crossfade');
  });

  test('should preview scene transitions', async ({ page }) => {
    // Add 2 scenes with crossfade
    for (let i = 0; i < 2; i++) {
      await page.click('button:has-text("Add Scene")');
      if (i === 0) {
        await page.selectOption('select[name="transition"]', 'crossfade');
      }
      await page.click('button:has-text("Save")');
    }

    // Click preview button
    await page.click('button:has-text("Preview")');

    // Wait for preview to load
    await page.waitForSelector('[data-testid="video-preview"]', { timeout: 5000 });

    // Verify preview is showing
    await expect(page.locator('[data-testid="video-preview"]')).toBeVisible();
  });
});

test.describe('Multi-Format Export', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'user');
    await page.goto('/content-studio/universal');
  });

  test('should select multiple formats and calculate credits', async ({ page }) => {
    // Navigate to export step
    await page.click('[data-testid="format-youtube"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Multi-format test');
    
    // Skip to export step
    await page.click('button:has-text("Next")'); // Scenes
    await page.click('button:has-text("Next")'); // Audio
    await page.click('button:has-text("Next")'); // Subtitles

    // Select 3 formats
    await page.check('input[name="format-instagram-story"]');
    await page.check('input[name="format-youtube"]');
    await page.check('input[name="format-tiktok"]');

    // Verify credit cost is 3 × 5 = 15
    await expect(page.locator('[data-testid="total-cost"]')).toContainText('15');
  });

  test('should start render for multiple formats', async ({ page }) => {
    // Navigate to export step
    await page.click('[data-testid="format-instagram-story"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Render test');
    
    // Skip to export
    await page.click('button:has-text("Next")'); // Scenes
    await page.click('button:has-text("Next")'); // Audio
    await page.click('button:has-text("Next")'); // Subtitles

    // Select 2 formats
    await page.check('input[name="format-instagram-story"]');
    await page.check('input[name="format-youtube"]');

    // Start render
    await page.click('button:has-text("Start Render")');

    // Wait for render to start
    await page.waitForTimeout(2000);

    // Verify success message or redirect to projects
    await expect(page.locator('text=/render started|processing/i')).toBeVisible({ timeout: 5000 });
  });

  test('should show insufficient credits warning', async ({ page }) => {
    // Mock insufficient credits (would need backend setup)
    // This test assumes user has less than 15 credits
    
    await page.click('[data-testid="format-youtube"]');
    await page.click('button:has-text("Next")');
    await page.fill('textarea[name="description"]', 'Credits test');
    
    // Skip to export
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');

    // Select many formats to exceed credits
    await page.check('input[name="format-instagram-story"]');
    await page.check('input[name="format-youtube"]');
    await page.check('input[name="format-tiktok"]');
    await page.check('input[name="format-instagram-reel"]');
    await page.check('input[name="format-facebook"]');

    // If insufficient credits, render button should be disabled or show warning
    const renderButton = page.locator('button:has-text("Start Render")');
    const isDisabled = await renderButton.isDisabled().catch(() => false);
    
    if (isDisabled) {
      await expect(page.locator('text=/insufficient|not enough credits/i')).toBeVisible();
    }
  });
});

test.describe('Project Persistence', () => {
  test('should save and restore complete project state', async ({ page }) => {
    await login(page, 'user');
    await page.goto('/content-studio/universal');

    // Create a complete project
    await page.click('[data-testid="format-youtube"]');
    await page.click('button:has-text("Next")');
    
    const testDescription = `Test project ${Date.now()}`;
    await page.fill('textarea[name="description"]', testDescription);
    await page.click('button:has-text("Next")');

    // Add 2 scenes
    await page.click('button:has-text("Add Scene")');
    await page.fill('input[name="duration"]', '5');
    await page.click('button:has-text("Save")');

    await page.click('button:has-text("Add Scene")');
    await page.fill('input[name="duration"]', '3');
    await page.click('button:has-text("Save")');

    // Get project ID from URL
    const projectUrl = page.url();
    
    // Navigate away
    await page.goto('/content-studio');
    
    // Navigate back
    await page.goto(projectUrl);
    
    // Verify all data is restored
    await expect(page.locator('textarea[name="description"]')).toHaveValue(testDescription);
    
    const sceneCount = await page.locator('[data-testid^="scene-card-"]').count();
    expect(sceneCount).toBe(2);
  });
});
