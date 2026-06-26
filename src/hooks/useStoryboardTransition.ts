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
import { extractFunctionsErrorDetails } from '@/lib/functionsError';
import type { ComposerScene, ComposerBriefing } from '@/types/video-composer';

/**
 * Build a deterministic 3-scene Hook/Reveal/CTA arc so the user is never
 * blocked when the AI gateway is unreachable. Mirrors the server-side
 * safety arc in briefing-deep-parse (lines 627-669).
 */
function buildLocalFallbackPlan(briefing: ComposerBriefing, briefingText: string): TProductionPlan {
  const total = Number(briefing.duration) || 15;
  const per = Math.max(3, Math.min(12, Math.round(total / 3)));
  const mentionMatch = briefingText.match(/@[a-z0-9][a-z0-9-_]{1,47}/i);
  const firstMention = mentionMatch ? mentionMatch[0] : null;
  const firstChar = briefing.characters?.[0];
  const cast = firstMention
    ? [{
        mentionKey: firstMention,
        characterId: firstChar?.brandCharacterId ?? null,
        characterName: firstChar?.name ?? firstMention.replace(/^@/, ''),
        voiceId: null,
      }]
    : [];
  const engine = firstMention ? 'cinematic-sync' as const : 'broll' as const;
  const beats: Array<{ beat: string; framing: string; movement: string; energy: 'low' | 'mid' | 'high' }> = [
    { beat: 'Hook',   framing: 'medium-close-up', movement: 'slow-push-in', energy: 'high' },
    { beat: 'Reveal', framing: 'wide',            movement: 'tracking',     energy: 'mid'  },
    { beat: 'CTA',    framing: 'medium',          movement: 'static',       energy: 'high' },
  ];
  return ProductionPlan.parse({
    project: {
      name: briefing.productName,
      aspectRatio: briefing.aspectRatio as any,
      totalDurationSec: per * 3,
    },
    scenes: beats.map((b, i) => ({
      index: i + 1,
      label: b.beat,
      beat: b.beat,
      durationSec: per,
      engine,
      lipSync: !!firstMention,
      cast,
      shotDirector: {
        framing: b.framing, angle: 'eye-level', movement: b.movement, lighting: 'soft-window',
      },
      anchorPromptEN: `${b.beat} beat for ${briefing.productName ?? 'the brand'}: cinematic establishing shot in a relevant setting.`,
      performance: {
        mimik: b.beat === 'Hook' ? 'confident' : b.beat === 'CTA' ? 'warm-smile' : 'curious',
        gestik: b.beat === 'CTA' ? 'open-palms' : 'still',
        blick: b.beat === 'CTA' ? 'to-camera' : 'away',
        energy: b.energy === 'high' ? 4 : 3,
      },
      musicCue: { energy: b.energy },
    })),
    unresolved: [{
      field: 'auto-director',
      reason: 'AI-Director offline — deterministischer 3-Szenen-Plan erstellt. Bitte vor dem Rendern prüfen.',
      severity: 'warn',
    }],
  });
}

type Phase = 'idle' | 'A' | 'B' | 'done';

interface Args {
  briefing: ComposerBriefing;
  projectId: string | undefined;
  scenes: ComposerScene[];
  /** Project language (de/en/es/…) — forwarded to deep-parse for LANGUAGE LOCK. */
  language: string;
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
  briefing, projectId, scenes, language, navigateToStoryboard,
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
        // Cap at 70% until the real response lands.
        const next = Math.min(s.progress + (s.progress < 50 ? 1.1 : 0.35), 70);
        const phase: Phase = next < 60 ? 'A' : 'B';
        // Briefing-Intelligence v2 — 4 inhaltliche Schritte:
        //   0–20%  Briefing-Modus erkennen (Storytelling/Brand/Produkt/…)
        //   20–45% Research & Wissens-Anreicherung (KI füllt Lücken)
        //   45–65% Strukturextraktion (Szenen, VO, Cast)
        //   65–95% Cast & Locations gegen deine Library auflösen
        const phaseLabel =
          next < 20
            ? 'Schritt 1/4 · Briefing-Modus erkennen'
            : next < 45
              ? 'Schritt 2/4 · Research & Wissens-Anreicherung (KI füllt Lücken)'
              : next < 65
                ? 'Schritt 3/4 · Strukturextraktion (Szenen, VO, Cast)'
                : 'Schritt 4/4 · Cast & Locations gegen Library auflösen';
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
      phaseLabel: 'Schritt 1/4 · Briefing-Modus erkennen …',
      planSheetOpen: false,
      initialPlan: null,
    });
    startProgressLoop();

    // Direct fetch with 180s AbortController — `supabase.functions.invoke`
    // imposes a ~30s timeout that kicks in before deep-parse (research +
    // gemini pass) can finish (~40–90s typical, up to 150s with research).
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 180_000);
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/briefing-deep-parse`;
    const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token ?? anon;

    const parsePlan = (data: any): { plan: TProductionPlan | null; dropped: number; error?: string } => {
      let dropped = 0;
      const parsed = ProductionPlan.safeParse(data?.plan);
      if (parsed.success) return { plan: parsed.data, dropped };
      console.error('[useStoryboardTransition] plan validation failed', parsed.error.flatten());
      const rawScenes: any[] = Array.isArray(data?.plan?.scenes) ? data.plan.scenes : [];
      const survivors: any[] = [];
      for (const s of rawScenes) {
        const sp = PlanScene.safeParse(s);
        if (sp.success) survivors.push(sp.data); else dropped += 1;
      }
      if (survivors.length > 0) {
        const retry = ProductionPlan.safeParse({ ...(data?.plan ?? {}), scenes: survivors });
        if (retry.success) return { plan: retry.data, dropped };
      }
      const issues = parsed.error.issues.slice(0, 2)
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`).join(' · ');
      return { plan: null, dropped, error: `Plan-Validierung fehlgeschlagen — ${issues || 'unbekannter Fehler'}` };
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'apikey': anon,
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ briefing: text, projectId, language }),
      });
      window.clearTimeout(timeoutId);
      stopProgress();
      if (cancelledRef.current) return { handled: true };

      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        const err: any = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        err.body = bodyText;
        throw err;
      }
      const data = await res.json();
      const { plan, dropped, error: validationErr } = parsePlan(data);
      if (!plan) throw new Error(validationErr || 'Plan-Validierung fehlgeschlagen');
      if (dropped > 0) {
        toast({
          title: 'Plan teilweise übernommen',
          description: `${dropped} Szene(n) konnten nicht validiert werden und wurden übersprungen.`,
        });
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

      const details = await extractFunctionsErrorDetails(e);
      const status = details.status;
      const msg = details.message || 'Deep-Parse fehlgeschlagen';
      console.error('[useStoryboardTransition] deep-parse failed', { status, msg, body: details.body });

      // Hard blocks (credits / rate-limit / payload): keep classic toast + navigate.
      if (status === 402 || status === 429 || status === 413 || /402|429/.test(msg)) {
        toast({
          title: 'Briefing-Analyse fehlgeschlagen',
          description: status === 402 || /402/.test(msg) ? 'Keine AI-Credits mehr — bitte aufladen.'
            : status === 429 || /429/.test(msg) ? 'Zu viele Anfragen — bitte kurz warten und erneut versuchen.'
            : 'Briefing zu lang — bitte kürzen.',
          variant: 'destructive',
        });
        setState((s) => ({ ...s, warRoomOpen: false, phase: 'idle', progress: 0 }));
        navigateToStoryboard();
        return { handled: true };
      }

      // Soft fail (500 / network / validation): build a local fallback plan
      // so the user is never stuck. Open the plan sheet for review.
      try {
        const fallback = buildLocalFallbackPlan(briefing, text);
        const reason = status
          ? (status === 504 ? `Timeout (${status})` : `Status ${status}`)
          : (msg.toLowerCase().includes('timeout') ? 'Timeout' : 'Netzwerkfehler');
        toast({
          title: 'Auto-Analyse offline',
          description: `${reason} — Basis-Plan (3 Szenen) erstellt, bitte prüfen & anpassen.`,
        });
        setState({
          warRoomOpen: false,
          phase: 'idle',
          progress: 0,
          phaseLabel: '',
          planSheetOpen: true,
          initialPlan: fallback,
        });
      } catch (fallbackErr: any) {
        console.error('[useStoryboardTransition] local fallback failed', fallbackErr);
        toast({
          title: 'Briefing-Analyse fehlgeschlagen',
          description: status ? `${status}: ${msg}` : msg,
          variant: 'destructive',
        });
        setState((s) => ({ ...s, warRoomOpen: false, phase: 'idle', progress: 0 }));
        navigateToStoryboard();
      }
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
