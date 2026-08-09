import { tx } from "@/lib/i18nText";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface RecurringRuleConfig {
  workspace_id: string;
  name: string;
  template_event: any;
  recurrence_pattern: string; // 'daily', 'weekly', 'monthly', or cron syntax
  auto_render?: boolean;
  video_template_id?: string;
}

export function useRecurringEvents(workspace_id?: string) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch recurring rules
  const { data: rules, isLoading: rulesLoading } = useQuery({
    queryKey: ['recurring-event-rules', workspace_id],
    queryFn: async () => {
      if (!workspace_id) return [];

      const { data, error } = await supabase
        .from('recurring_event_rules')
        .select('*')
        .eq('workspace_id', workspace_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!workspace_id,
  });

  // Create recurring rule
  const createRuleMutation = useMutation({
    mutationFn: async (config: RecurringRuleConfig) => {
      const { data, error } = await supabase.functions.invoke('calendar-create-recurring-rule', {
        body: config
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-event-rules'] });
      toast({
        title: tx({ de: '✅ Recurring Rule erstellt', en: '✅ Recurring Rule created', es: '✅ Regla recurrente creada' }),
        description: tx({ de: 'Automatische Events werden jetzt generiert', en: 'Automatic events are now being generated', es: 'Se están generando eventos automáticos' }),
      });
    },
    onError: (error: any) => {
      toast({
        title: tx({ de: 'Fehler', en: 'Mistake', es: 'Error' }),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Toggle rule active status
  const toggleRuleMutation = useMutation({
    mutationFn: async ({ rule_id, is_active }: { rule_id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('recurring_event_rules')
        .update({ is_active })
        .eq('id', rule_id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-event-rules'] });
      toast({
        title: tx({ de: 'Status geändert', en: 'Status changed', es: 'Estado cambiado' }),
        description: tx({ de: 'Recurring Rule aktualisiert', en: 'Recurring Rule updated', es: 'Regla recurrente actualizada' }),
      });
    },
  });

  // Delete rule
  const deleteRuleMutation = useMutation({
    mutationFn: async (rule_id: string) => {
      const { error } = await supabase
        .from('recurring_event_rules')
        .delete()
        .eq('id', rule_id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-event-rules'] });
      toast({
        title: tx({ de: '🗑️ Regel gelöscht', en: '🗑️ Rule deleted', es: '🗑️ Regla eliminada' }),
        description: tx({ de: 'Recurring Rule wurde entfernt', en: 'Recurring Rule has been removed', es: 'Se ha eliminado la regla recurrente.' }),
      });
    },
  });

  return {
    rules: rules || [],
    loading: rulesLoading || loading,
    createRule: createRuleMutation.mutate,
    toggleRule: toggleRuleMutation.mutate,
    deleteRule: deleteRuleMutation.mutate,
  };
}
