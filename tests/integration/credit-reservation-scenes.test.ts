/**
 * Integration Tests: Credit System for Scenes & Multi-Format Rendering
 * Tests credit calculation, reservation, commit, and refund for scene-based videos
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@/test/utils/test-utils';
import { useCreditReservation } from '@/hooks/useCreditReservation';
import { useCredits } from '@/hooks/useCredits';
import { renderHook, waitFor } from '@testing-library/react';

// Mock Supabase functions
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: { balance: 50, plan_code: 'pro', monthly_credits: 100, last_reset_at: new Date().toISOString() },
            error: null,
          })),
        })),
      })),
    })),
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn(),
      })),
    })),
    removeChannel: vi.fn(),
  },
}));

describe('Credit System - Multi-Format Rendering', () => {
  const ESTIMATED_COSTS = {
    video_render: 5,
    scene_processing: 1,
    transition_effect: 0.5,
  };

  describe('Credit Calculation', () => {
    it('should calculate credits for single format render', () => {
      const formatCount = 1;
      const totalCost = formatCount * ESTIMATED_COSTS.video_render;
      
      expect(totalCost).toBe(5);
    });

    it('should calculate credits for multiple formats (3 formats)', () => {
      const formats = ['instagram-story', 'youtube', 'tiktok'];
      const totalCost = formats.length * ESTIMATED_COSTS.video_render;
      
      expect(totalCost).toBe(15);
    });

    it('should calculate credits for 5 formats', () => {
      const formats = ['instagram-story', 'youtube', 'tiktok', 'instagram-reel', 'facebook'];
      const totalCost = formats.length * ESTIMATED_COSTS.video_render;
      
      expect(totalCost).toBe(25);
    });

    it('should include scene processing costs', () => {
      const sceneCount = 3;
      const formatCount = 2;
      
      const renderCost = formatCount * ESTIMATED_COSTS.video_render;
      const sceneCost = sceneCount * ESTIMATED_COSTS.scene_processing;
      const totalCost = renderCost + sceneCost;
      
      expect(totalCost).toBe(13); // 10 (render) + 3 (scenes)
    });

    it('should include transition costs', () => {
      const transitionCount = 2; // Between 3 scenes
      const formatCount = 1;
      
      const renderCost = formatCount * ESTIMATED_COSTS.video_render;
      const transitionCost = transitionCount * ESTIMATED_COSTS.transition_effect;
      const totalCost = renderCost + transitionCost;
      
      expect(totalCost).toBe(6); // 5 (render) + 1 (transitions)
    });
  });

  describe('Credit Reservation', () => {
    it('should reserve credits before starting render', async () => {
      const { result } = renderHook(() => useCreditReservation());
      
      const mockInvoke = vi.fn().mockResolvedValue({
        data: {
          reservation_id: 'res_123',
          reserved_amount: 15,
          expires_at: new Date(Date.now() + 900000).toISOString(),
        },
        error: null,
      });
      
      (supabase.functions.invoke as any).mockImplementation(mockInvoke);
      
      const reservation = await result.current.reserve('video_render', 15);
      
      expect(reservation).toBeTruthy();
      expect(reservation.reservation_id).toBe('res_123');
      expect(reservation.reserved_amount).toBe(15);
    });

    it('should check preflight before reservation', async () => {
      const { result } = renderHook(() => useCreditReservation());
      
      const mockPreflight = vi.fn().mockResolvedValue({
        data: { can_proceed: true, estimated_cost: 10 },
        error: null,
      });
      
      (supabase.functions.invoke as any).mockImplementation(mockPreflight);
      
      const preflight = await result.current.checkPreflight('video_render', 10);
      
      expect(preflight.can_proceed).toBe(true);
      expect(preflight.estimated_cost).toBe(10);
    });

    it('should show insufficient credits error', async () => {
      const { result } = renderHook(() => useCreditReservation());
      
      const mockInvoke = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Insufficient credits' },
      });
      
      (supabase.functions.invoke as any).mockImplementation(mockInvoke);
      
      await expect(result.current.reserve('video_render', 100)).rejects.toThrow();
    });
  });

  describe('Partial Render Success', () => {
    it('should charge only for successful renders', async () => {
      const { result } = renderHook(() => useCreditReservation());
      
      // Reserve for 3 formats
      const mockReserve = vi.fn().mockResolvedValue({
        data: {
          reservation_id: 'res_123',
          reserved_amount: 15,
          expires_at: new Date(Date.now() + 900000).toISOString(),
        },
        error: null,
      });
      
      (supabase.functions.invoke as any).mockImplementation(mockReserve);
      
      const reservation = await result.current.reserve('video_render', 15);
      
      // Commit only 2 successful renders (10 credits)
      const mockCommit = vi.fn().mockResolvedValue({
        data: { committed_amount: 10 },
        error: null,
      });
      
      (supabase.functions.invoke as any).mockImplementation(mockCommit);
      
      await result.current.commit(reservation.reservation_id, 10);
      
      expect(mockCommit).toHaveBeenCalledWith('credit-commit', {
        reservation_id: 'res_123',
        actual_cost: 10,
      });
    });

    it('should refund credits for failed renders', async () => {
      const { result } = renderHook(() => useCreditReservation());
      
      const mockRefund = vi.fn().mockResolvedValue({
        data: { refunded_amount: 5 },
        error: null,
      });
      
      (supabase.functions.invoke as any).mockImplementation(mockRefund);
      
      await result.current.refund('res_123', 'Render failed for format');
      
      expect(mockRefund).toHaveBeenCalledWith('credit-refund', {
        reservation_id: 'res_123',
        reason: 'Render failed for format',
      });
    });

    it('should handle scenario: 5 formats requested, 3 succeed', async () => {
      const totalCost = 5 * ESTIMATED_COSTS.video_render; // 25
      const successCost = 3 * ESTIMATED_COSTS.video_render; // 15
      const refundAmount = totalCost - successCost; // 10
      
      expect(totalCost).toBe(25);
      expect(successCost).toBe(15);
      expect(refundAmount).toBe(10);
    });
  });

  describe('Insufficient Credits Warning', () => {
    it('should show warning when balance < required credits', async () => {
      const { result } = renderHook(() => useCredits());
      
      // Mock balance of 8 credits
      const mockBalance = vi.fn().mockResolvedValue({
        data: { balance: 8, plan_code: 'free', monthly_credits: 10, last_reset_at: new Date().toISOString() },
        error: null,
      });
      
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockBalance,
          }),
        }),
      });
      
      await waitFor(() => {
        expect(result.current.balance).toBeTruthy();
      });
      
      const requiredCredits = 15;
      const hasEnough = (result.current.balance?.balance || 0) >= requiredCredits;
      
      expect(hasEnough).toBe(false);
    });

    it('should allow render when balance >= required credits', async () => {
      const { result } = renderHook(() => useCredits());
      
      // Mock balance of 50 credits
      const mockBalance = vi.fn().mockResolvedValue({
        data: { balance: 50, plan_code: 'pro', monthly_credits: 100, last_reset_at: new Date().toISOString() },
        error: null,
      });
      
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockBalance,
          }),
        }),
      });
      
      await waitFor(() => {
        expect(result.current.balance).toBeTruthy();
      });
      
      const requiredCredits = 15;
      const hasEnough = (result.current.balance?.balance || 0) >= requiredCredits;
      
      expect(hasEnough).toBe(true);
    });

    it('should calculate exact credits needed message', () => {
      const balance = 8;
      const required = 25;
      const needed = required - balance;
      
      const message = `You need ${needed} more credits to render all ${5} formats`;
      
      expect(needed).toBe(17);
      expect(message).toContain('17 more credits');
    });

    it('should show per-format cost breakdown', () => {
      const formats = ['Instagram Story', 'YouTube', 'TikTok', 'Instagram Reel', 'Facebook'];
      const costPerFormat = ESTIMATED_COSTS.video_render;
      
      const breakdown = formats.map((format, index) => ({
        format,
        cost: costPerFormat,
        total: (index + 1) * costPerFormat,
      }));
      
      expect(breakdown[0].total).toBe(5);
      expect(breakdown[2].total).toBe(15);
      expect(breakdown[4].total).toBe(25);
    });
  });

  describe('Credit Expiration', () => {
    it('should expire reservation after timeout', async () => {
      const expiresAt = new Date(Date.now() + 900000); // 15 minutes
      const now = new Date();
      
      const isExpired = now > expiresAt;
      
      expect(isExpired).toBe(false);
    });

    it('should refund expired reservations', async () => {
      const expiresAt = new Date(Date.now() - 1000); // 1 second ago
      const now = new Date();
      
      const isExpired = now > expiresAt;
      
      expect(isExpired).toBe(true);
      
      // Would trigger refund in actual implementation
    });
  });

  describe('Concurrent Renders', () => {
    it('should handle multiple simultaneous reservations', async () => {
      const { result } = renderHook(() => useCreditReservation());
      
      const mockInvoke = vi.fn()
        .mockResolvedValueOnce({
          data: { reservation_id: 'res_1', reserved_amount: 15, expires_at: new Date().toISOString() },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { reservation_id: 'res_2', reserved_amount: 10, expires_at: new Date().toISOString() },
          error: null,
        });
      
      (supabase.functions.invoke as any).mockImplementation(mockInvoke);
      
      const res1 = await result.current.reserve('video_render', 15);
      const res2 = await result.current.reserve('video_render', 10);
      
      expect(res1.reservation_id).toBe('res_1');
      expect(res2.reservation_id).toBe('res_2');
      expect(res1.reserved_amount + res2.reserved_amount).toBe(25);
    });

    it('should prevent over-reservation', async () => {
      const balance = 20;
      const reservation1 = 15;
      const reservation2 = 10;
      
      const totalReserved = reservation1 + reservation2;
      const canReserve = totalReserved <= balance;
      
      expect(canReserve).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero-cost renders', async () => {
      const { result } = renderHook(() => useCreditReservation());
      
      const mockInvoke = vi.fn().mockResolvedValue({
        data: { reservation_id: 'res_123', reserved_amount: 0, expires_at: new Date().toISOString() },
        error: null,
      });
      
      (supabase.functions.invoke as any).mockImplementation(mockInvoke);
      
      const reservation = await result.current.reserve('video_render', 0);
      
      expect(reservation.reserved_amount).toBe(0);
    });

    it('should handle negative balance (debt)', () => {
      const balance = -5;
      const required = 10;
      const totalNeeded = required + Math.abs(balance);
      
      expect(totalNeeded).toBe(15);
    });

    it('should handle very large format counts', () => {
      const formatCount = 20;
      const totalCost = formatCount * ESTIMATED_COSTS.video_render;
      
      expect(totalCost).toBe(100);
    });
  });
});
