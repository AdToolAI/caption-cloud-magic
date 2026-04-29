import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AutopilotBrief {
  id: string;
  user_id: string;
  topic_pillars: string[];
  forbidden_topics: string[];
  tonality: string;
  platforms: string[];
  posts_per_week: Record<string, number>;
  languages: string[];
  avatar_ids: string[];
  weekly_credit_budget: number;
  weekly_credits_spent: number;
  auto_publish_enabled: boolean;
  is_active: boolean;
  paused_until: string | null;
  locked_until: string | null;
  compliance_score: number;
  activated_at: string | null;
  last_plan_generated_at: string | null;
  budget_resets_at: string;
  created_at: string;
  updated_at: string;
}

export interface AutopilotSlot {
  id: string;
  user_id: string;
  brief_id: string;
  scheduled_at: string;
  platform: string;
  language: string;
  topic_hint: string | null;
  status: 'draft' | 'generating' | 'qa_review' | 'scheduled' | 'posted' | 'blocked' | 'failed' | 'skipped';
  content_payload: Record<string, unknown>;
  asset_url: string | null;
  caption: string | null;
  hashtags: string[] | null;
  qa_score: number | null;
  qa_findings: Record<string, unknown> | null;
  block_reason: string | null;
  approved_by_user: boolean;
  approved_at: string | null;
  posted_at: string | null;
  social_post_id: string | null;
  generation_cost_credits: number;
  created_at: string;
}

export interface AutopilotStrike {
  id: string;
  user_id: string;
  severity: 'soft' | 'hard' | 'critical';
  reason_code: string;
  reason_description: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface AutopilotActivityEntry {
  id: string;
  user_id: string;
  event_type: string;
  actor: string;
  slot_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

/* ============ Brief ============ */

export function useAutopilotBrief() {
  return useQuery({
    queryKey: ['autopilot-brief'],
    queryFn: async (): Promise<AutopilotBrief | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return null;
      const { data, error } = await supabase
        .from('autopilot_briefs')
        .select('*')
        .eq('user_id', u.user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as AutopilotBrief) ?? null;
    },
    staleTime: 15_000,
  });
}

export interface UpsertBriefInput {
  topic_pillars: string[];
  forbidden_topics: string[];
  tonality: string;
  platforms: string[];
  posts_per_week: Record<string, number>;
  languages: string[];
  avatar_ids: string[];
  weekly_credit_budget: number;
  auto_publish_enabled: boolean;
}

export function useUpsertAutopilotBrief() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: UpsertBriefInput) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) throw new Error('Not authenticated');
      const { data: existing } = await supabase
        .from('autopilot_briefs')
        .select('id')
        .eq('user_id', u.user.id)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('autopilot_briefs')
          .update(input)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('autopilot_briefs')
        .insert({ ...input, user_id: u.user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['autopilot-brief'] });
      toast({ title: 'Brief gespeichert', description: 'Deine Strategie wurde aktualisiert.' });
    },
    onError: (e: unknown) => toast({
      title: 'Speichern fehlgeschlagen',
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    }),
  });
}

export function useToggleAutopilot() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { activate: boolean; consentTextHash?: string; consentTextVersion?: string }) => {
      // Try Edge Function first (Session B). Fallback to direct DB update so Session A is functional standalone.
      try {
        const { data, error } = await supabase.functions.invoke('autopilot-toggle', { body: input });
        if (!error && data) return data as { ok: boolean; is_active?: boolean; error?: string; lock_reason?: string };
      } catch {
        /* Edge function not yet deployed — fall through */
      }

      // Fallback path
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) throw new Error('Not authenticated');

      // Lock check
      const { data: existing } = await supabase
        .from('autopilot_briefs')
        .select('id, locked_until')
        .eq('user_id', u.user.id)
        .maybeSingle();
      if (existing?.locked_until && new Date(existing.locked_until) > new Date()) {
        return { ok: false, error: 'Autopilot ist gesperrt. Kontaktiere den Support.' };
      }

      const patch: Record<string, unknown> = {
        is_active: input.activate,
        activated_at: input.activate ? new Date().toISOString() : null,
      };
      const { error: updErr } = await supabase
        .from('autopilot_briefs')
        .update(patch)
        .eq('user_id', u.user.id);
      if (updErr) throw updErr;

      // Consent log
      if (input.activate && input.consentTextVersion) {
        await supabase.from('autopilot_consent_log').insert({
          user_id: u.user.id,
          event_type: 'autopilot_activated',
          accepted_text_version: input.consentTextVersion,
          accepted_text_hash: input.consentTextHash ?? 'unknown',
          metadata: { clauses: ['aup', 'no_deepfake', 'no_copyright', 'termination_acknowledged'] },
        });
      }

      // Activity log
      await supabase.from('autopilot_activity_log').insert({
        user_id: u.user.id,
        event_type: input.activate ? 'autopilot_activated' : 'autopilot_deactivated',
        actor: 'user',
        payload: {},
      });

      return { ok: true, is_active: input.activate };
    },
    onSuccess: (res) => {
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ['autopilot-brief'] });
        qc.invalidateQueries({ queryKey: ['autopilot-activity'] });
        toast({
          title: res.is_active ? 'Autopilot aktiviert' : 'Autopilot deaktiviert',
          description: res.is_active
            ? 'Die KI plant jetzt deine nächsten 14 Tage. Erste Slots erscheinen in Kürze.'
            : 'Alle automatischen Aktionen sind gestoppt. Bereits geplante Posts werden nicht veröffentlicht.',
        });
      } else {
        toast({
          title: 'Aktivierung blockiert',
          description: res.error ?? res.lock_reason ?? 'Unbekannter Fehler',
          variant: 'destructive',
        });
      }
    },
    onError: (e: unknown) => toast({
      title: 'Toggle fehlgeschlagen',
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    }),
  });
}

export function usePauseAutopilot() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { hours: number | null }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) throw new Error('Not authenticated');
      const paused_until = input.hours
        ? new Date(Date.now() + input.hours * 3600 * 1000).toISOString()
        : null;
      const { error } = await supabase
        .from('autopilot_briefs')
        .update({ paused_until })
        .eq('user_id', u.user.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['autopilot-brief'] });
      toast({
        title: vars.hours ? `Pause ${vars.hours}h aktiv` : 'Pause aufgehoben',
      });
    },
  });
}

/* ============ Queue / Slots ============ */

export function useAutopilotQueue(daysAhead = 14) {
  return useQuery({
    queryKey: ['autopilot-queue', daysAhead],
    queryFn: async (): Promise<AutopilotSlot[]> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return [];
      const until = new Date(Date.now() + daysAhead * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from('autopilot_queue')
        .select('*')
        .eq('user_id', u.user.id)
        .lte('scheduled_at', until)
        .order('scheduled_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as AutopilotSlot[];
    },
    staleTime: 30_000,
  });
}

export function useApproveSlot() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (slotId: string) => {
      const { error } = await supabase
        .from('autopilot_queue')
        .update({
          approved_by_user: true,
          approved_at: new Date().toISOString(),
          status: 'scheduled',
        })
        .eq('id', slotId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['autopilot-queue'] });
      toast({ title: 'Freigegeben', description: 'Slot wird zur geplanten Zeit veröffentlicht.' });
    },
  });
}

export function useSkipSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slotId: string) => {
      const { error } = await supabase
        .from('autopilot_queue')
        .update({ status: 'skipped' })
        .eq('id', slotId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['autopilot-queue'] }),
  });
}

/* ============ Strikes ============ */

export function useAutopilotStrikes() {
  return useQuery({
    queryKey: ['autopilot-strikes'],
    queryFn: async (): Promise<AutopilotStrike[]> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return [];
      const { data, error } = await supabase
        .from('autopilot_strikes')
        .select('*')
        .eq('user_id', u.user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AutopilotStrike[];
    },
    staleTime: 60_000,
  });
}

/* ============ Activity Log ============ */

export function useAutopilotActivity(limit = 50) {
  return useQuery({
    queryKey: ['autopilot-activity', limit],
    queryFn: async (): Promise<AutopilotActivityEntry[]> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return [];
      const { data, error } = await supabase
        .from('autopilot_activity_log')
        .select('*')
        .eq('user_id', u.user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as AutopilotActivityEntry[];
    },
    staleTime: 15_000,
  });
}
