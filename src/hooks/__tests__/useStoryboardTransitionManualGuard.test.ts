import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStoryboardTransition } from '@/hooks/useStoryboardTransition';
import type { ComposerBriefing } from '@/types/video-composer';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

const longBriefing = {
  productName: 'AdTool AI',
  mode: 'manual',
  goal: 'Ein langes Briefing mit sehr viel Text, damit der Längen-Guard nicht greift und die Analyse ohne den Modus-Guard tatsächlich starten würde.',
  duration: 30,
  usps: ['Lip-Sync', 'Multi-Speaker', 'Cast & World'],
} as unknown as ComposerBriefing;

describe('useStoryboardTransition — empty path guard', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const setup = (briefing: ComposerBriefing) =>
    renderHook(() =>
      useStoryboardTransition({
        briefing,
        projectId: '11111111-2222-3333-4444-555555555555',
        scenes: [],
        language: 'de',
        ensureProjectId: async () => '11111111-2222-3333-4444-555555555555',
        navigateToStoryboard: () => {},
        onUpdateBriefing: () => {},
      }),
    );

  it('does not analyse when the user chose the empty path (mode = manual)', async () => {
    const { result } = setup(longBriefing);
    const res = await result.current.attempt();
    expect(res.handled).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is bypassed by force (explicit "generate from briefing")', async () => {
    const { result } = setup(longBriefing);
    // force skips Guard 0; the request itself is stubbed and may fail, we only
    // assert that the manual mode no longer short-circuits the run.
    fetchSpy.mockRejectedValue(Object.assign(new Error('stub'), { status: 500 }));
    await result.current.attempt({ force: true }).catch(() => undefined);
    expect(fetchSpy).toHaveBeenCalled();
  });
});
