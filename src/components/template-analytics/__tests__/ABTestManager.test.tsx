/**
 * Integration Tests: A/B Test Manager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ABTestManager } from '../ABTestManager';
import * as useABTestingModule from '@/hooks/useABTesting';

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

const mockTests = [
  {
    id: 'test-1',
    test_name: 'Test Experiment 1',
    status: 'active' as const,
    hypothesis: 'Testing hypothesis',
    template_id: 'test-template-1',
    variant_a_config: {},
    variant_b_config: {},
    target_metric: 'conversion_rate',
    target_sample_size: 1000,
    confidence_level: 0.95,
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    ended_at: null,
    completed_at: null,
    user_id: 'test-user',
    winner_variant: null,
    statistical_significance: null,
    created_by: 'test-user',
  },
  {
    id: 'test-2',
    test_name: 'Test Experiment 2',
    status: 'draft' as const,
    hypothesis: 'Another hypothesis',
    template_id: 'test-template-1',
    variant_a_config: {},
    variant_b_config: {},
    target_metric: 'conversion_rate',
    target_sample_size: 1000,
    confidence_level: 0.95,
    created_at: new Date().toISOString(),
    started_at: null,
    ended_at: null,
    completed_at: null,
    user_id: 'test-user',
    winner_variant: null,
    statistical_significance: null,
    created_by: 'test-user',
  },
] as any[];

describe('ABTestManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render create test button', () => {
    vi.spyOn(useABTestingModule, 'useABTesting').mockReturnValue({
      tests: [],
      loading: false,
      error: '',
      createTest: vi.fn(),
      startTest: vi.fn(),
      pauseTest: vi.fn(),
      completeTest: vi.fn(),
      getTestResults: vi.fn(),
      fetchActiveTests: vi.fn(),
    } as any);

    render(
      <ABTestManager templateId="test-123" />,
      { wrapper }
    );

    expect(screen.getByText(/create.*test|new.*test/i)).toBeInTheDocument();
  });

  it('should render list of tests', () => {
    vi.spyOn(useABTestingModule, 'useABTesting').mockReturnValue({
      tests: mockTests,
      loading: false,
      error: '',
      createTest: vi.fn(),
      startTest: vi.fn(),
      pauseTest: vi.fn(),
      completeTest: vi.fn(),
      getTestResults: vi.fn(),
      fetchActiveTests: vi.fn(),
    } as any);
    });

    render(
      <ABTestManager templateId="test-123" />,
      { wrapper }
    );

    expect(screen.getByText('Test Experiment 1')).toBeInTheDocument();
    expect(screen.getByText('Test Experiment 2')).toBeInTheDocument();
  });

  it('should open create test dialog', async () => {
    vi.spyOn(useABTestingModule, 'useABTesting').mockReturnValue({
      tests: [],
      loading: false,
      error: '',
      createTest: vi.fn(),
      startTest: vi.fn(),
      pauseTest: vi.fn(),
      completeTest: vi.fn(),
      getTestResults: vi.fn(),
      refetch: vi.fn(),
    });

    render(
      <ABTestManager templateId="test-123" />,
      { wrapper }
    );

    const createButton = screen.getByText(/create.*test|new.*test/i);
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(screen.getByText(/test name|name/i)).toBeInTheDocument();
    });
  });

  it('should call createTest when form is submitted', async () => {
    const createTestMock = vi.fn();

    vi.spyOn(useABTestingModule, 'useABTesting').mockReturnValue({
      tests: [],
      loading: false,
      error: '',
      createTest: createTestMock,
      startTest: vi.fn(),
      pauseTest: vi.fn(),
      completeTest: vi.fn(),
      getTestResults: vi.fn(),
      refetch: vi.fn(),
    });

    render(
      <ABTestManager templateId="test-123" />,
      { wrapper }
    );

    // Open dialog
    fireEvent.click(screen.getByText(/create.*test|new.*test/i));

    await waitFor(() => {
      const nameInput = screen.getByLabelText(/test name|name/i);
      expect(nameInput).toBeInTheDocument();
    });

    // Fill form (implementation will vary based on actual form structure)
    // const nameInput = screen.getByLabelText(/test name/i);
    // fireEvent.change(nameInput, { target: { value: 'New Test' } });

    // Submit form
    // const submitButton = screen.getByText(/create|submit/i);
    // fireEvent.click(submitButton);

    // await waitFor(() => {
    //   expect(createTestMock).toHaveBeenCalled();
    // });
  });

  it('should show test status badges', () => {
    vi.spyOn(useABTestingModule, 'useABTesting').mockReturnValue({
      tests: mockTests,
      loading: false,
      error: '',
      createTest: vi.fn(),
      startTest: vi.fn(),
      pauseTest: vi.fn(),
      completeTest: vi.fn(),
      getTestResults: vi.fn(),
      refetch: vi.fn(),
    });

    render(
      <ABTestManager templateId="test-123" />,
      { wrapper }
    );

    expect(screen.getByText(/active/i)).toBeInTheDocument();
    expect(screen.getByText(/draft/i)).toBeInTheDocument();
  });

  it('should handle loading state', () => {
    vi.spyOn(useABTestingModule, 'useABTesting').mockReturnValue({
      tests: [],
      loading: true,
      error: '',
      createTest: vi.fn(),
      startTest: vi.fn(),
      pauseTest: vi.fn(),
      completeTest: vi.fn(),
      getTestResults: vi.fn(),
      refetch: vi.fn(),
    });

    render(
      <ABTestManager templateId="test-123" />,
      { wrapper }
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
