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
import { ProductionPlan, PlanScene, type TProductionPlan } from '@/lib/video-composer/briefing/productionPlan';
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

/** Slugify a character name into a stable @-mention key. */
function toMentionSlug(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'cast';
}

/**
 * Builds the freeform briefing blob the deep-parser expects.
 * In AUTO-DIRECTOR mode (default), the parser is allowed to synthesize a
 * full screenplay from the structured briefing + selected cast.
 */
function buildBriefingText(b: ComposerBriefing): string {
  const lines: string[] = [];
  lines.push('Mode: AUTO-DIRECTOR (synthesize full screenplay from briefing + cast)');
  lines.push('');
  if (b.productName) lines.push(`# ${b.productName}`);
  if (b.productDescription) lines.push('', b.productDescription);
  if (b.usps?.length) {
    lines.push('', '## USPs / Key Messages');
    for (const u of b.usps) lines.push(`- ${u}`);
  }
  if (b.targetAudience) lines.push('', `## Target Audience`, b.targetAudience);

  // Cast — the heart of AUTO-DIRECTOR. Each entry becomes an addressable
  // mention key the parser can place into scenes.
  if (b.characters && b.characters.length) {
    lines.push('', '## Cast (selected in briefing)');
    for (const c of b.characters) {
      const slug = toMentionSlug(c.name);
      const libSuffix = c.brandCharacterId ? `  (library:${c.brandCharacterId})` : '';
      lines.push(`- @${slug} — **${c.name}**${libSuffix}`);
      if (c.appearance) lines.push(`  · Appearance: ${c.appearance}`);
      if (c.signatureItems) lines.push(`  · Signature items: ${c.signatureItems}`);
      if (c.appearanceFrequency) lines.push(`  · Frequency: ${c.appearanceFrequency}`);
    }
  }

  lines.push('', '## Project');
  if (b.tone) lines.push(`- Tone: ${b.tone}`);
  if (b.duration) lines.push(`- Total duration: ${b.duration}s`);
  if (b.aspectRatio) lines.push(`- Aspect: ${b.aspectRatio}`);
  if (b.videoMode) lines.push(`- Video mode: ${b.videoMode}`);
  if (b.visualStyle) lines.push(`- Visual style: ${b.visualStyle}`);
  if (b.brandColors?.length) lines.push(`- Brand colors: ${b.brandColors.join(', ')}`);
  if (b.defaultQuality) lines.push(`- Default quality: ${b.defaultQuality}`);
  if (b.preferStock) lines.push(`- Prefer stock footage when appropriate`);

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

      let plan: TProductionPlan | null = null;
      let droppedScenes = 0;

      const parsed = ProductionPlan.safeParse(data?.plan);
      if (parsed.success) {
        plan = parsed.data;
      } else {
        // Per-scene recovery: keep what we can.
        console.error('[useStoryboardTransition] plan validation failed', parsed.error.flatten());
        const rawScenes: any[] = Array.isArray(data?.plan?.scenes) ? data.plan.scenes : [];
        const survivors: any[] = [];
        for (const s of rawScenes) {
          const sp = PlanScene.safeParse(s);
          if (sp.success) survivors.push(sp.data);
          else droppedScenes += 1;
        }
        if (survivors.length > 0) {
          const retry = ProductionPlan.safeParse({ ...(data?.plan ?? {}), scenes: survivors });
          if (retry.success) {
            plan = retry.data;
          } else {
            console.error('[useStoryboardTransition] retry failed', retry.error.flatten());
          }
        }
        if (!plan) {
          const issues = parsed.error.issues.slice(0, 2)
            .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
            .join(' · ');
          throw new Error(`Plan-Validierung fehlgeschlagen — ${issues || 'unbekannter Fehler'}`);
        }
        if (droppedScenes > 0) {
          toast({
            title: 'Plan teilweise übernommen',
            description: `${droppedScenes} Szene(n) konnten nicht validiert werden und wurden übersprungen.`,
          });
        }
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
        initialPlan: plan,
      });
      return { handled: true };
    } catch (e: any) {
      stopProgress();
      if (cancelledRef.current) return { handled: true };

      const msg = e?.message || (typeof e === 'string' ? e : 'Deep-Parse fehlgeschlagen');
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
