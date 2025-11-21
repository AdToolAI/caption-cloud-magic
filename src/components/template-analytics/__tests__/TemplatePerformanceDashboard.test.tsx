/**
 * Integration Tests: Template Performance Dashboard
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplatePerformanceDashboard } from '../TemplatePerformanceDashboard';
import * as useTemplateAnalyticsModule from '@/hooks/useTemplateAnalytics';
import { TEST_ANALYTICS } from '../../../../tests/fixtures/analytics';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    {children}
  </QueryClientProvider>
);

describe('TemplatePerformanceDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state', () => {
    vi.spyOn(useTemplateAnalyticsModule, 'useTemplateAnalytics').mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
      trackEvent: vi.fn(),
    });

    render(
      <TemplatePerformanceDashboard templateId="test-123" />,
      { wrapper }
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('should render error state', () => {
    vi.spyOn(useTemplateAnalyticsModule, 'useTemplateAnalytics').mockReturnValue({
      data: null,
      loading: false,
      error: 'Failed to load analytics',
      refetch: vi.fn(),
      trackEvent: vi.fn(),
    });

    render(
      <TemplatePerformanceDashboard templateId="test-123" />,
      { wrapper }
    );

    expect(screen.getByText(/failed|error/i)).toBeInTheDocument();
  });

  it('should render analytics data with KPIs', async () => {
    vi.spyOn(useTemplateAnalyticsModule, 'useTemplateAnalytics').mockReturnValue({
      data: {
        summary: TEST_ANALYTICS.templatePerformance,
        conversion: TEST_ANALYTICS.conversionFunnel,
        daily_metrics: [...TEST_ANALYTICS.dailyMetrics],
        active_tests: [],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
      trackEvent: vi.fn(),
    });

    render(
      <TemplatePerformanceDashboard templateId="test-123" />,
      { wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText(/1,500|1500/)).toBeInTheDocument(); // Total views
      expect(screen.getByText(/30%/)).toBeInTheDocument(); // Selection rate
      expect(screen.getByText(/12%/)).toBeInTheDocument(); // Conversion rate
    });
  });

  it('should render conversion funnel', async () => {
    vi.spyOn(useTemplateAnalyticsModule, 'useTemplateAnalytics').mockReturnValue({
      data: {
        summary: TEST_ANALYTICS.templatePerformance,
        conversion: TEST_ANALYTICS.conversionFunnel,
        daily_metrics: [...TEST_ANALYTICS.dailyMetrics],
        active_tests: [],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
      trackEvent: vi.fn(),
    });

    render(
      <TemplatePerformanceDashboard templateId="test-123" />,
      { wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText(/funnel|conversion/i)).toBeInTheDocument();
    });
  });

  it('should handle empty data gracefully', () => {
    vi.spyOn(useTemplateAnalyticsModule, 'useTemplateAnalytics').mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
      trackEvent: vi.fn(),
    });

    render(
      <TemplatePerformanceDashboard templateId="test-123" />,
      { wrapper }
    );

    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});
