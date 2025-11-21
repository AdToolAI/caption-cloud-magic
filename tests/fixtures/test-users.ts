/**
 * Test User Fixtures
 * Centralized test user credentials and factory functions
 */

export const TEST_USERS = {
  admin: {
    email: 'test-admin@adtool-ai-test.internal',
    password: process.env.TEST_ADMIN_PASSWORD || 'TestAdmin123!SecurePassword',
    role: 'admin' as const,
  },
  moderator: {
    email: 'test-moderator@adtool-ai-test.internal',
    password: process.env.TEST_MODERATOR_PASSWORD || 'TestMod123!SecurePassword',
    role: 'moderator' as const,
  },
  user: {
    email: 'test-user@adtool-ai-test.internal',
    password: process.env.TEST_USER_PASSWORD || 'TestUser123!SecurePassword',
    role: 'user' as const,
  },
} as const;

export type TestUserRole = 'admin' | 'moderator' | 'user';

export interface TestUser {
  email: string;
  password: string;
  role: TestUserRole;
}

export function getTestUser(role: TestUserRole = 'user'): TestUser {
  return TEST_USERS[role];
}
