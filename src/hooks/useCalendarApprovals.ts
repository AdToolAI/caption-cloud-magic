import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ApprovalRequest {
  email: string;
  role?: string;
  user_id?: string;
}

export function useCalendarApprovals() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const requestApproval = async (event_id: string, approvers: ApprovalRequest[]) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-request-approval', {
        body: { event_id, approvers }
      });

      if (error) throw error;

      toast({
        title: '✅ Approval angefordert',
        description: `${data.approvals} Freigabe-Anfragen versendet`,
      });

      return true;
    } catch (error: any) {
      console.error('Request approval error:', error);
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const approveStage = async (approval_id: string, comment?: string, approved_changes?: any) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-approve-stage', {
        body: { approval_id, comment, approved_changes }
      });

      if (error) throw error;

      toast({
        title: '✅ Freigabe erteilt',
        description: data.all_approved ? 'Alle Freigaben erteilt!' : 'Freigabe erfolgreich',
      });

      return data;
    } catch (error: any) {
      console.error('Approve error:', error);
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const rejectApproval = async (approval_id: string, comment: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('calendar-reject-approval', {
        body: { approval_id, comment }
      });

      if (error) throw error;

      toast({
        title: '🚫 Freigabe abgelehnt',
        description: 'Event wurde zur Überarbeitung zurückgeschickt',
      });

      return true;
    } catch (error: any) {
      console.error('Reject error:', error);
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const getApprovals = async (event_id: string) => {
    try {
      const { data, error } = await supabase
        .from('calendar_approvals')
        .select('*')
        .eq('event_id', event_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Get approvals error:', error);
      return [];
    }
  };

  return {
    loading,
    requestApproval,
    approveStage,
    rejectApproval,
    getApprovals,
  };
}
