/**
 * Playwright Global Setup
 * 
 * Runs once before all tests to set up authentication state
 */

import { chromium, FullConfig } from '@playwright/test';
import { setupAuthState } from '../fixtures/auth-helpers';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Running global test setup...');
  
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Setup admin authentication state
    console.log('🔐 Setting up admin authentication...');
    await setupAuthState(page, 'admin');
    console.log('✅ Admin auth state saved');

    // Setup regular user authentication state
    console.log('🔐 Setting up user authentication...');
    await setupAuthState(page, 'user');
    console.log('✅ User auth state saved');

  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }

  console.log('✅ Global setup completed\n');
}

export default globalSetup;
