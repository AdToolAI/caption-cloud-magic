/**
 * Project Test Data Fixtures
 */

export const TEST_PROJECTS = {
  basic: {
    id: 'test-project-001',
    name: 'Test Video Project',
    content_type: 'video',
    status: 'draft',
    customizations: {
      title: 'Test Video Title',
      subtitle: 'Test Subtitle',
    },
  },
  completed: {
    id: 'test-project-002',
    name: 'Completed Test Project',
    content_type: 'social-post',
    status: 'completed',
    customizations: {
      caption: 'Test social media post',
      hashtags: ['test', 'automation'],
    },
  },
} as const;

export function createProjectData(overrides: any = {}) {
  return {
    ...TEST_PROJECTS.basic,
    ...overrides,
    id: `test-project-${Date.now()}`,
  };
}
