/**
 * Analytics Test Data Fixtures
 */

export const TEST_ANALYTICS = {
  templatePerformance: {
    template_id: 'test-template-001',
    total_views: 1500,
    total_selections: 450,
    total_projects: 320,
    total_publishes: 180,
    avg_rating: 4.5,
    total_ratings: 89,
    selection_rate: 0.3,
    conversion_rate: 0.12,
    publish_rate: 0.56,
  },
  conversionFunnel: {
    total_views: 1500,
    total_selections: 450,
    total_creates: 320,
    total_publishes: 180,
    selection_rate: 0.3,
    create_rate: 0.71,
    publish_rate: 0.56,
  },
  dailyMetrics: [
    {
      date: '2024-01-01',
      total_views: 100,
      total_selections: 30,
      projects_created: 20,
      projects_published: 12,
      avg_rating_in_period: 4.5,
      ratings_submitted: 5,
    },
    {
      date: '2024-01-02',
      total_views: 150,
      total_selections: 45,
      projects_created: 35,
      projects_published: 18,
      avg_rating_in_period: 4.7,
      ratings_submitted: 8,
    },
  ],
} as const;

export function createAnalyticsData(overrides: any = {}) {
  return {
    ...TEST_ANALYTICS.templatePerformance,
    ...overrides,
  };
}
