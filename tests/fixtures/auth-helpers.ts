/**
 * Authentication Helper Functions for E2E Tests
 */

import { Page } from '@playwright/test';
import { TEST_USERS, TestUserRole } from './test-users';

/**
 * Login helper that navigates to auth page and performs login
 */
export async function login(page: Page, role: TestUserRole = 'user') {
  const user = TEST_USERS[role];
  
  await page.goto('/auth');
  
  // Fill login form
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  
  // Click login button and wait for navigation
  await Promise.all([
    page.waitForURL('/', { timeout: 10000 }),
    page.click('button[type="submit"]:has-text("Sign In")'),
  ]);
  
  // Wait for authentication to complete
  await page.waitForTimeout(1000);
}

/**
 * Logout helper
 */
export async function logout(page: Page) {
  // Click on user menu and logout
  await page.click('[data-testid="user-menu"]', { timeout: 5000 }).catch(() => {
    // Fallback: navigate to auth page to clear session
    return page.goto('/auth');
  });
  
  await page.click('text="Logout"').catch(() => {});
  
  await page.waitForURL('/auth', { timeout: 5000 }).catch(() => {});
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    // Check for user menu or other auth indicators
    const userMenu = await page.$('[data-testid="user-menu"]');
    return userMenu !== null;
  } catch {
    return false;
  }
}

/**
 * Setup authentication state for reuse across tests
 */
export async function setupAuthState(page: Page, role: TestUserRole = 'admin') {
  await login(page, role);
  
  // Save authentication state
  await page.context().storageState({ 
    path: `tests/.auth/${role}.json` 
  });
}
