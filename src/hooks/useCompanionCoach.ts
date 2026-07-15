/**
 * useCompanionCoach — adaptive onboarding trigger engine.
 *
 * Reads companion prefs (learning pace + tone), applies per-trigger cooldown
 * and per-day caps, and lets the app fire proactive tips from anywhere. All
 * fires are logged in `companion_triggers` so we never re-nag the same user.
 *
 * Public API:
 *   const { activeTip, fire, dismiss, convert, pace } = useCompanionCoach();
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  DEFAULT_LEARNING_PACE,
  getPersona,
  type LearningPace,
  type PersonaProfile,
} from '@/lib/companion/personaProfiles';
import {
  findTrigger,
  routeTriggerFor,
  TRIGGER_REGISTRY,
  type TriggerDefinition,
} from '@/lib/companion/triggerRegistry';

export type RevealMode = 'whisper' | 'spotlight' | 'ovation';

function revealModeFor(trigger: TriggerDefinition): RevealMode {
  if (trigger.category === 'milestone') return 'ovation';
  if (trigger.key === 'intent.wallet.low' || trigger.key === 'intent.errors.streak') {
    return 'spotlight';
  }
  return 'whisper';
}

export interface ActiveTip {
  trigger: TriggerDefinition;
  title: string;
  body: string;
  cta?: string;
  ctaHref?: string;
  persona: PersonaProfile;
  revealMode: RevealMode;
}

type Locale = 'de' | 'en' | 'es';

function currentLocale(): Locale {
  const raw = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'de';
  if (raw === 'en') return 'en';
  if (raw === 'es') return 'es';
  return 'de';
}

/** Simple in-memory session guard so the same trigger doesn't fire twice per page-view spike. */
const sessionFired = new Set<string>();

export function useCompanionCoach() {
  const { user } = useAuth();
  const location = useLocation();
  const [pace, setPace] = useState<LearningPace>(DEFAULT_LEARNING_PACE);
  const [activeTip, setActiveTip] = useState<ActiveTip | null>(null);
  const [paused, setPaused] = useState(false);
  const historyRef = useRef<Map<string, { shown_at: string; dismissed_at: string | null }>>(
    new Map(),
  );
  const dailyCountRef = useRef(0);
  const lastFireRef = useRef(0);

  const persona = useMemo(() => getPersona(pace), [pace]);

  // ── Load prefs + trigger history once per user ───────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const { data: prefs } = await supabase
        .from('companion_user_preferences')
        .select('preferences')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!cancelled && prefs?.preferences) {
        const p = prefs.preferences as Record<string, unknown>;
        if (typeof p.learning_pace === 'string') {
          setPace(p.learning_pace as LearningPace);
        }
        if (typeof p.coach_paused_until === 'string') {
          setPaused(new Date(p.coach_paused_until).getTime() > Date.now());
        }
      }

      const since = new Date();
      since.setDate(since.getDate() - 90);
      const { data: history } = await supabase
        .from('companion_triggers')
        .select('trigger_key, shown_at, dismissed_at')
        .eq('user_id', user.id)
        .gte('shown_at', since.toISOString())
        .order('shown_at', { ascending: false });

      if (!cancelled && history) {
        const map = new Map<string, { shown_at: string; dismissed_at: string | null }>();
        for (const row of history) {
          if (!map.has(row.trigger_key)) {
            map.set(row.trigger_key, {
              shown_at: row.shown_at,
              dismissed_at: row.dismissed_at,
            });
          }
        }
        historyRef.current = map;

        // Count today's fires
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        dailyCountRef.current = history.filter(
          (r) => new Date(r.shown_at).getTime() >= startOfDay.getTime(),
        ).length;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // ── Guard: can this trigger fire right now? ─────────────────────────────
  const canFire = useCallback(
    (trigger: TriggerDefinition): boolean => {
      if (!user || paused) return false;
      if (sessionFired.has(trigger.key)) return false;

      const now = Date.now();
      if (now - lastFireRef.current < persona.minGapSeconds * 1000) return false;

      if (!trigger.bypassDailyCap && dailyCountRef.current >= persona.dailyPopupCap) {
        return false;
      }

      const prev = historyRef.current.get(trigger.key);
      if (prev) {
        const shown = new Date(prev.shown_at).getTime();
        if (now - shown < trigger.cooldownDays * 24 * 60 * 60 * 1000) return false;
      }
      return true;
    },
    [user, paused, persona.minGapSeconds, persona.dailyPopupCap],
  );

  // ── Fire a trigger by key or definition ─────────────────────────────────
  const fire = useCallback(
    async (keyOrDef: string | TriggerDefinition) => {
      const trigger = typeof keyOrDef === 'string' ? findTrigger(keyOrDef) : keyOrDef;
      if (!trigger || !user) return;
      if (!canFire(trigger)) return;

      sessionFired.add(trigger.key);
      lastFireRef.current = Date.now();
      dailyCountRef.current += 1;

      const locale = currentLocale();
      const copy = trigger.copy[locale] ?? trigger.copy.de;

      const nowIso = new Date().toISOString();
      historyRef.current.set(trigger.key, { shown_at: nowIso, dismissed_at: null });

      setActiveTip({
        trigger,
        title: copy.title,
        body: copy.body,
        cta: copy.cta,
        ctaHref: copy.ctaHref,
        persona,
      });

      // Persist fire — fire-and-forget, error is non-fatal
      supabase
        .from('companion_triggers')
        .insert({
          user_id: user.id,
          trigger_key: trigger.key,
          category: trigger.category,
          shown_at: nowIso,
        })
        .then(({ error }) => {
          if (error) console.warn('[companion-coach] persist fire failed', error.message);
        });
    },
    [user, canFire, persona],
  );

  // ── Route trigger auto-fire ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const trigger = routeTriggerFor(location.pathname);
    if (!trigger) return;
    // Delay slightly so the page has a chance to render first.
    const timer = window.setTimeout(() => fire(trigger), 900);
    return () => window.clearTimeout(timer);
  }, [user, location.pathname, fire]);

  // ── Dismiss / convert ───────────────────────────────────────────────────
  const dismiss = useCallback(async () => {
    const current = activeTip;
    setActiveTip(null);
    if (!current || !user) return;
    supabase
      .from('companion_triggers')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('trigger_key', current.trigger.key)
      .is('dismissed_at', null)
      .then(({ error }) => {
        if (error) console.warn('[companion-coach] dismiss failed', error.message);
      });
  }, [activeTip, user]);

  const convert = useCallback(async () => {
    const current = activeTip;
    setActiveTip(null);
    if (!current || !user) return;
    supabase
      .from('companion_triggers')
      .update({ converted_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('trigger_key', current.trigger.key)
      .is('converted_at', null)
      .then(({ error }) => {
        if (error) console.warn('[companion-coach] convert failed', error.message);
      });
  }, [activeTip, user]);

  const setLearningPace = useCallback(
    async (next: LearningPace) => {
      setPace(next);
      if (!user) return;
      const { data: existing } = await supabase
        .from('companion_user_preferences')
        .select('id, preferences')
        .eq('user_id', user.id)
        .maybeSingle();
      const nextPrefs = {
        ...((existing?.preferences as Record<string, unknown>) ?? {}),
        learning_pace: next,
      };
      if (existing) {
        await supabase
          .from('companion_user_preferences')
          .update({ preferences: nextPrefs, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
      } else {
        await supabase.from('companion_user_preferences').insert({
          user_id: user.id,
          preferences: nextPrefs,
        });
      }
    },
    [user],
  );

  return {
    pace,
    persona,
    activeTip,
    fire,
    dismiss,
    convert,
    setLearningPace,
    paused,
    triggerRegistry: TRIGGER_REGISTRY,
  };
}
