/**
 * E2E Tests: Authentication & Authorization
 */

import { test, expect } from '@playwright/test';
import { login, logout, isAuthenticated } from '../fixtures/auth-helpers';
import { TEST_USERS } from '../fixtures/test-users';

test.describe('Authentication Flow', () => {
  test('should register new user', async ({ page }) => {
    await page.goto('/auth');
    
    // Click on sign up tab/link if needed
    await page.click('text="Sign Up"').catch(() => {});
    
    const testEmail = `test-${Date.now()}@example.com`;
    
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', 'TestPassword123!');
    
    await page.click('button[type="submit"]:has-text("Sign Up")');
    
    // Should redirect or show success message
    await page.waitForTimeout(2000);
    
    const url = page.url();
    expect(url).not.toContain('/auth');
  });

  test('should login with valid credentials', async ({ page }) => {
    await login(page, 'user');
    
    const authenticated = await isAuthenticated(page);
    expect(authenticated).toBe(true);
    
    // Should be on home page
    expect(page.url()).toContain('/');
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/auth');
    
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    
    await page.click('button[type="submit"]:has-text("Sign In")');
    
    // Should show error message
    await expect(page.locator('text=/invalid|error|incorrect/i')).toBeVisible({ timeout: 5000 });
  });

  test('should logout successfully', async ({ page }) => {
    await login(page, 'user');
    
    await logout(page);
    
    const authenticated = await isAuthenticated(page);
    expect(authenticated).toBe(false);
    
    // Should redirect to auth page
    await page.waitForURL('/auth', { timeout: 5000 });
  });

  test('should persist session after page reload', async ({ page }) => {
    await login(page, 'user');
    
    await page.reload();
    
    const authenticated = await isAuthenticated(page);
    expect(authenticated).toBe(true);
  });
});

test.describe('Authorization & Route Protection', () => {
  test('should redirect to auth when accessing protected route while logged out', async ({ page }) => {
    await page.goto('/content-studio');
    
    // Should redirect to auth
    await page.waitForURL('/auth', { timeout: 5000 });
  });

  test('should allow admin access to admin routes', async ({ page }) => {
    await login(page, 'admin');
    
    await page.goto('/admin');
    
    // Should stay on admin page
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/admin');
    
    // Should see admin content
    await expect(page.locator('text=/admin|dashboard/i')).toBeVisible();
  });

  test('should redirect non-admin to unauthorized page', async ({ page }) => {
    await login(page, 'user');
    
    await page.goto('/admin');
    
    // Should redirect to unauthorized or home
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('/admin');
  });

  test('should allow access to public routes', async ({ page }) => {
    // No login required
    await page.goto('/');
    
    await expect(page.locator('body')).toBeVisible();
    expect(page.url()).toBe('http://localhost:5173/');
  });
});

test.describe('Password Reset Flow', () => {
  test('should show password reset form', async ({ page }) => {
    await page.goto('/auth');
    
    await page.click('text="Forgot Password"').catch(() => {});
    
    await expect(page.locator('text=/reset|forgot/i')).toBeVisible();
  });

  test('should submit password reset request', async ({ page }) => {
    await page.goto('/auth');
    
    await page.click('text="Forgot Password"').catch(() => {});
    
    await page.fill('input[type="email"]', 'test@example.com');
    await page.click('button[type="submit"]');
    
    // Should show success message
    await expect(page.locator('text=/sent|check|email/i')).toBeVisible({ timeout: 5000 });
  });
});
