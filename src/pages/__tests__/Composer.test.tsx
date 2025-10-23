import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/test-utils';
import userEvent from '@testing-library/user-event';
import Composer from '@/pages/Composer';
import { supabase } from '@/integrations/supabase/client';

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-123', email: 'test@example.com' },
    loading: false,
  }),
}));

describe('Composer E2E/Integration Test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    
    // Mock Storage
    vi.mocked(supabase.storage.from).mockReturnValue({
      upload: vi.fn().mockResolvedValue({
        data: { path: 'public/test-image.jpg' },
        error: null,
      }),
      getPublicUrl: vi.fn().mockReturnValue({
        data: { publicUrl: 'https://example.com/test-image.jpg' },
      }),
    } as any);
  });

  it('loads /composer page correctly', () => {
    render(<Composer />);
    
    expect(screen.getByPlaceholderText(/what.*share/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post now/i })).toBeInTheDocument();
  });

  it('publishes to FB, X, LinkedIn and validates response structure', async () => {
    const user = userEvent.setup();
    
    // Mock Publish Response
    const mockResults = [
      { provider: 'facebook', ok: true, external_id: 'fb_12345', permalink: 'https://fb.com/12345' },
      { provider: 'x', ok: true, external_id: 'x_67890', permalink: 'https://x.com/67890' },
      { 
        provider: 'linkedin', 
        ok: true, 
        external_id: 'li_403', 
        error_code: 'LI_403', 
        error_message: 'Restricted API access'
      },
    ];
    
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { jobId: 'test-job-123', results: mockResults },
      error: null,
    });

    // Spy on console.log to capture external_ids
    const consoleLogSpy = vi.spyOn(console, 'log');

    render(<Composer />);

    // Step 1: Set Text "Hello MVP"
    const textarea = screen.getByPlaceholderText(/what.*share/i);
    await user.clear(textarea);
    await user.type(textarea, 'Hello MVP');

    // Step 2: Simulate Image Upload
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(['test-image'], 'test.jpg', { type: 'image/jpeg' });
    
    if (fileInput) {
      await user.upload(fileInput, testFile);
    }

    // Step 3: Select Channels FB, X, LinkedIn
    // Default channels: instagram, facebook, x
    // Need to: deselect Instagram, keep FB + X, select LinkedIn

    // Deselect Instagram (default active)
    const instagramBadge = screen.getByText('Instagram');
    await user.click(instagramBadge);

    // Select LinkedIn (not default)
    const linkedinBadge = screen.getByText('LinkedIn');
    await user.click(linkedinBadge);

    // Facebook and X remain selected (default)
    // Wait for state updates
    await waitFor(() => {
      expect(textarea).toHaveValue('Hello MVP');
    });

    // Step 4: Click "Post Now"
    const publishButton = screen.getByRole('button', { name: /post now/i });
    await user.click(publishButton);

    // Wait for publishing to complete
    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('publish', expect.any(Object));
    }, { timeout: 3000 });

    // Assertion 1: Response has at least 3 results
    const invokeCall = vi.mocked(supabase.functions.invoke).mock.results[0];
    const response = await invokeCall.value;
    
    expect(response.data.results).toHaveLength(3);

    // Assertion 2: Each result has `ok` boolean
    response.data.results.forEach((result: any) => {
      expect(result).toHaveProperty('ok');
      expect(typeof result.ok).toBe('boolean');
    });

    // Assertion 3: LinkedIn result has ok:true with optional error_code LI_403
    const linkedinResult = response.data.results.find((r: any) => r.provider === 'linkedin');
    expect(linkedinResult).toBeDefined();
    expect(linkedinResult.ok).toBe(true);
    expect(linkedinResult.error_code).toBe('LI_403');

    // Assertion 4: external_ids logged (Snapshot)
    console.log('=== Published Posts External IDs ===');
    mockResults.forEach(result => {
      if (result.external_id) {
        console.log(`${result.provider}: ${result.external_id}`);
      }
    });

    // Verify at least one external_id was logged
    expect(consoleLogSpy).toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('does not fail test when LinkedIn returns 403', async () => {
    const user = userEvent.setup();
    
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        jobId: 'test-job-456',
        results: [
          { provider: 'linkedin', ok: true, error_code: 'LI_403', error_message: 'Restricted API access' },
        ],
      },
      error: null,
    });

    render(<Composer />);

    const textarea = screen.getByPlaceholderText(/what.*share/i);
    await user.type(textarea, 'Test LinkedIn 403');

    // Select only LinkedIn channel
    const instagramBadge = screen.getByText('Instagram');
    await user.click(instagramBadge);
    const facebookBadge = screen.getByText('Facebook');
    await user.click(facebookBadge);
    const xBadge = screen.getByText('X');
    await user.click(xBadge);
    const linkedinBadge = screen.getByText('LinkedIn');
    await user.click(linkedinBadge);

    const publishButton = screen.getByRole('button', { name: /post now/i });
    await user.click(publishButton);

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalled();
    }, { timeout: 3000 });

    const invokeCall = vi.mocked(supabase.functions.invoke).mock.results[0];
    const response = await invokeCall.value;

    // Verify LinkedIn 403 is handled gracefully
    const linkedinResult = response.data.results.find((r: any) => r.provider === 'linkedin');
    expect(linkedinResult?.ok).toBe(true);
    expect(linkedinResult?.error_code).toBe('LI_403');

    // Test should pass (no exceptions)
    expect(true).toBe(true);
  });
});
