/**
 * useStoryboardTransition
 *
 * Owns the Briefing → Storyboard handoff. When the user navigates to the
 * Storyboard step for the first time on a fresh project, this hook:
 *
 *  1. Decides whether the briefing should be deep-parsed at all (guard).
 *  2. Triggers `briefing-deep-parse` and drives the War Room overlay
 *     with realistic phase + progress signals.
 *  3. Hands the resulting plan to the ProductionPlanSheet for review.
 *
 * Lip-Sync safety: the guard short-circuits as soon as ANY scene exists
 * with rendered/locked/lipsync state. We never re-analyze on top of a
 * touched storyboard, so the pipeline (compose-video-clips,
 * dialog_shots, syncso_*) is never disturbed.
 */

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProductionPlan, type TProductionPlan } from '@/lib/video-composer/briefing/productionPlan';
import { toast } from '@/hooks/use-toast';
import type { ComposerScene, ComposerBriefing } from '@/types/video-composer';

type Phase = 'idle' | 'A' | 'B' | 'done';

interface Args {
  briefing: ComposerBriefing;
  projectId: string | undefined;
  scenes: ComposerScene[];
  /** Navigation hook: switches the dashboard tab to 'storyboard'. */
  navigateToStoryboard: () => void;
}

/**
 * Returns true when a scene is "off-limits" for plan replacement.
 * Mirrors the guard in `useApplyProductionPlan` so we keep behaviour
 * consistent between the entry guard and the apply guard.
 */
function isProtected(s: ComposerScene): boolean {
  if (s.clipStatus && s.clipStatus !== 'pending') return true;
  if (s.clipUrl) return true;
  const a = s as any;
  if (a.lipSyncStatus) return true;
  if (a.dialogLockedAt) return true;
  if (a.lockReferenceUrl) return true;
  return false;
}

/** Builds the freeform briefing blob the deep-parser expects. */
function buildBriefingText(b: ComposerBriefing): string {
  const lines: string[] = [];
  if (b.productName) lines.push(`# ${b.productName}`);
  if (b.productDescription) lines.push('', b.productDescription);
  if (b.usps?.length) {
    lines.push('', '## USPs / Key Messages');
    for (const u of b.usps) lines.push(`- ${u}`);
  }
  if (b.targetAudience) lines.push('', `## Target Audience`, b.targetAudience);
  if ((b as any).tone) lines.push('', `Tone: ${(b as any).tone}`);
  if ((b as any).duration) lines.push(`Duration: ${(b as any).duration}s`);
  if ((b as any).aspectRatio) lines.push(`Aspect: ${(b as any).aspectRatio}`);
  if ((b as any).visualStyle) lines.push(`Visual style: ${(b as any).visualStyle}`);
  return lines.join('\n').trim();
}

export interface StoryboardTransitionState {
  warRoomOpen: boolean;
  phase: Phase;
  progress: number;
  phaseLabel: string;
  planSheetOpen: boolean;
  initialPlan: TProductionPlan | null;
}

export function useStoryboardTransition({
  briefing, projectId, scenes, navigateToStoryboard,
}: Args) {
  const [state, setState] = useState<StoryboardTransitionState>({
    warRoomOpen: false,
    phase: 'idle',
    progress: 0,
    phaseLabel: '',
    planSheetOpen: false,
    initialPlan: null,
  });

  const cancelledRef = useRef(false);
  const progressTimerRef = useRef<number | null>(null);

  const stopProgress = () => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  /** Drives a pseudo-progress curve while the edge function runs. */
  const startProgressLoop = () => {
    stopProgress();
    progressTimerRef.current = window.setInterval(() => {
      setState((s) => {
        // Cap at 95% until the real response lands.
        const next = Math.min(s.progress + (s.progress < 60 ? 1.1 : 0.5), 95);
        const phase: Phase = next < 60 ? 'A' : 'B';
        const phaseLabel =
          phase === 'A'
            ? 'Pass A · Strukturextraktion (Tabellen, VO-Skript, Cast)'
            : 'Pass B · Cast & Locations gegen Library auflösen';
        return { ...s, progress: next, phase, phaseLabel };
      });
    }, 700);
  };

  const close = useCallback(() => {
    cancelledRef.current = true;
    stopProgress();
    setState({
      warRoomOpen: false,
      phase: 'idle',
      progress: 0,
      phaseLabel: '',
      planSheetOpen: false,
      initialPlan: null,
    });
  }, []);

  /**
   * Decide + run. Returns true when the caller should NOT navigate itself
   * (we'll handle navigation after the plan is applied). Returns false
   * when the caller should fall through with normal tab navigation.
   */
  const attempt = useCallback(async (): Promise<{ handled: boolean }> => {
    // GUARD 1 — protected scenes exist: never re-analyse.
    if (scenes.some(isProtected)) {
      return { handled: false };
    }
    // GUARD 2 — already has any scenes: skip auto-analyse (user can re-trigger manually).
    if (scenes.length > 0) {
      return { handled: false };
    }
    // GUARD 3 — empty briefing: nothing to analyse.
    const text = buildBriefingText(briefing);
    if (text.length < 40) {
      return { handled: false };
    }

    cancelledRef.current = false;
    setState({
      warRoomOpen: true,
      phase: 'A',
      progress: 2,
      phaseLabel: 'Pass A · Strukturextraktion startet …',
      planSheetOpen: false,
      initialPlan: null,
    });
    startProgressLoop();

    try {
      const { data, error } = await supabase.functions.invoke('briefing-deep-parse', {
        body: { briefing: text, projectId },
      });
      stopProgress();
      if (cancelledRef.current) return { handled: true };
      if (error) throw error;

      const parsed = ProductionPlan.safeParse(data?.plan);
      if (!parsed.success) {
        console.warn('[useStoryboardTransition] plan validation failed', parsed.error);
        throw new Error('Plan-Validierung fehlgeschlagen');
      }

      // Smoothly drive the bar to 100% before swapping to the plan sheet.
      setState((s) => ({ ...s, progress: 100, phase: 'done', phaseLabel: 'Plan bereit' }));
      await new Promise((r) => setTimeout(r, 650));

      setState({
        warRoomOpen: false,
        phase: 'idle',
        progress: 0,
        phaseLabel: '',
        planSheetOpen: true,
        initialPlan: parsed.data,
      });
      return { handled: true };
    } catch (e: any) {
      stopProgress();
      if (cancelledRef.current) return { handled: true };

      const msg = extractFunctionsError(e) || e?.message || 'Deep-Parse fehlgeschlagen';
      toast({
        title: 'Briefing-Analyse fehlgeschlagen',
        description: msg.includes('402')
          ? 'Keine AI-Credits mehr — bitte aufladen.'
          : msg.includes('429')
            ? 'Zu viele Anfragen — bitte kurz warten und erneut versuchen.'
            : msg,
        variant: 'destructive',
      });
      setState((s) => ({ ...s, warRoomOpen: false, phase: 'idle', progress: 0 }));
      // Fall back to normal navigation so the user is never blocked.
      navigateToStoryboard();
      return { handled: true };
    }
  }, [briefing, projectId, scenes, navigateToStoryboard]);

  const setPlanSheetOpen = useCallback((open: boolean) => {
    setState((s) => ({ ...s, planSheetOpen: open, initialPlan: open ? s.initialPlan : null }));
  }, []);

  return {
    state,
    attempt,
    close,
    setPlanSheetOpen,
  };
}
