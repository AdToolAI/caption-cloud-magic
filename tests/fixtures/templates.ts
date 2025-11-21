/**
 * Template Test Data Fixtures
 */

export const TEST_TEMPLATES = {
  basic: {
    id: 'test-template-basic-001',
    name: 'Test Basic Template',
    description: 'A basic test template for E2E tests',
    category: 'social-media',
    thumbnail_url: 'https://placeholder.co/400x300',
    preview_url: 'https://placeholder.co/800x600',
    is_public: true,
    config_schema: {
      fields: [
        { name: 'title', type: 'text', label: 'Title', default: 'Default Title' },
        { name: 'subtitle', type: 'text', label: 'Subtitle', default: 'Default Subtitle' },
      ],
    },
  },
  advanced: {
    id: 'test-template-advanced-001',
    name: 'Test Advanced Template',
    description: 'An advanced test template with multiple fields',
    category: 'video',
    thumbnail_url: 'https://placeholder.co/400x300',
    preview_url: 'https://placeholder.co/800x600',
    is_public: true,
    config_schema: {
      fields: [
        { name: 'title', type: 'text', label: 'Title' },
        { name: 'bgColor', type: 'color', label: 'Background Color', default: '#000000' },
        { name: 'duration', type: 'number', label: 'Duration (seconds)', default: 10 },
        { name: 'tags', type: 'array', label: 'Tags', default: [] },
      ],
    },
  },
} as const;

export function createTemplateData(overrides: any = {}) {
  return {
    ...TEST_TEMPLATES.basic,
    ...overrides,
    id: `test-template-${Date.now()}`,
  };
}
