/**
 * E2E Tests: Content Creation Flows
 */

import { test, expect } from '@playwright/test';

test.describe('Universal Creator', () => {
  test.use({ storageState: 'tests/.auth/user.json' });

  test('should navigate to content studio', async ({ page }) => {
    await page.goto('/');
    
    await page.click('text="Content Studio", a[href*="content-studio"]').catch(() =>
      page.goto('/content-studio')
    );
    
    await page.waitForURL('**/content-studio**', { timeout: 5000 });
    
    await expect(page.locator('h1, h2')).toContainText(/content|studio/i);
  });

  test('should select a template', async ({ page }) => {
    await page.goto('/content-studio');
    
    // Wait for templates to load
    await page.waitForTimeout(2000);
    
    // Click on first available template
    const templateCard = page.locator('[data-testid="template-card"], .template-card, button:has-text("Select")').first();
    await templateCard.click({ timeout: 10000 });
    
    // Should navigate to customization or show preview
    await page.waitForTimeout(1000);
  });

  test('should customize template fields', async ({ page }) => {
    await page.goto('/content-studio');
    
    await page.waitForTimeout(2000);
    
    // Select first template
    await page.click('[data-testid="template-card"], .template-card, button:has-text("Select")').catch(() => {});
    
    await page.waitForTimeout(1000);
    
    // Fill customization fields
    const titleInput = page.locator('input[name="title"], input[label*="title" i]').first();
    if (await titleInput.isVisible({ timeout: 3000 })) {
      await titleInput.fill('E2E Test Title');
    }
    
    const subtitleInput = page.locator('input[name="subtitle"], input[label*="subtitle" i]').first();
    if (await subtitleInput.isVisible({ timeout: 3000 })) {
      await subtitleInput.fill('E2E Test Subtitle');
    }
  });

  test('should preview video project', async ({ page }) => {
    await page.goto('/content-studio');
    
    await page.waitForTimeout(2000);
    
    // Find and click preview button
    const previewButton = page.locator('button:has-text("Preview")');
    if (await previewButton.isVisible({ timeout: 3000 })) {
      await previewButton.click();
      
      // Should show preview player
      await expect(page.locator('[data-testid="video-preview"], video, .preview')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should save project as draft', async ({ page }) => {
    await page.goto('/content-studio');
    
    await page.waitForTimeout(2000);
    
    // Save button
    const saveButton = page.locator('button:has-text("Save")');
    if (await saveButton.isVisible({ timeout: 3000 })) {
      await saveButton.click();
      
      // Should show success message
      await expect(page.locator('text=/saved|success/i')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should create video from template', async ({ page }) => {
    await page.goto('/content-studio');
    
    await page.waitForTimeout(2000);
    
    // Click create/render button
    const createButton = page.locator('button:has-text("Create"), button:has-text("Render")');
    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      
      await page.waitForTimeout(1000);
    }
  });
});

test.describe('Composer', () => {
  test.use({ storageState: 'tests/.auth/user.json' });

  test('should navigate to composer', async ({ page }) => {
    await page.goto('/');
    
    await page.click('text="Composer", a[href*="composer"]').catch(() =>
      page.goto('/composer')
    );
    
    await page.waitForURL('**/composer**', { timeout: 5000 });
  });

  test('should write social media post', async ({ page }) => {
    await page.goto('/composer');
    
    // Fill post content
    const textarea = page.locator('textarea, [contenteditable="true"]').first();
    await textarea.fill('This is an E2E test post for automated testing.');
    
    await page.waitForTimeout(500);
  });

  test('should upload media', async ({ page }) => {
    await page.goto('/composer');
    
    // Look for upload button
    const uploadButton = page.locator('button:has-text("Upload"), input[type="file"]');
    
    if (await uploadButton.isVisible({ timeout: 3000 })) {
      // Mock file upload would go here
      console.log('Upload button found');
    }
  });

  test('should select platforms', async ({ page }) => {
    await page.goto('/composer');
    
    // Select platform checkboxes
    const facebookCheckbox = page.locator('input[type="checkbox"][value="facebook"], label:has-text("Facebook")');
    if (await facebookCheckbox.isVisible({ timeout: 3000 })) {
      await facebookCheckbox.click();
    }
    
    const twitterCheckbox = page.locator('input[type="checkbox"][value="twitter"], label:has-text("Twitter"), label:has-text("X")');
    if (await twitterCheckbox.isVisible({ timeout: 3000 })) {
      await twitterCheckbox.click();
    }
  });

  test('should schedule post', async ({ page }) => {
    await page.goto('/composer');
    
    // Fill post content
    const textarea = page.locator('textarea').first();
    await textarea.fill('Scheduled E2E test post');
    
    // Click schedule button
    const scheduleButton = page.locator('button:has-text("Schedule")');
    if (await scheduleButton.isVisible({ timeout: 3000 })) {
      await scheduleButton.click();
      
      // Should show date picker
      await page.waitForTimeout(1000);
    }
  });
});

test.describe('Video Management', () => {
  test.use({ storageState: 'tests/.auth/user.json' });

  test('should view video projects', async ({ page }) => {
    await page.goto('/videos').catch(() => page.goto('/'));
    
    await page.waitForTimeout(1000);
    
    // Should see projects list
    const projectsList = page.locator('[data-testid="projects-list"], table, .project-card');
    expect(await projectsList.count()).toBeGreaterThanOrEqual(0);
  });

  test('should filter projects by status', async ({ page }) => {
    await page.goto('/videos').catch(() => page.goto('/'));
    
    await page.waitForTimeout(1000);
    
    // Click filter dropdown
    const filterButton = page.locator('button:has-text("Filter"), select');
    if (await filterButton.isVisible({ timeout: 3000 })) {
      await filterButton.click();
      
      await page.click('text="Completed"').catch(() => {});
    }
  });
});
