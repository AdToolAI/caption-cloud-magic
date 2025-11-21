import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const useTemplateCollaboration = (templateId?: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch comments
  const { data: comments, isLoading: isLoadingComments } = useQuery({
    queryKey: ['template-comments', templateId],
    queryFn: async () => {
      if (!templateId) return [];
      
      const { data, error } = await supabase
        .from('template_comments')
        .select('*')
        .eq('template_id', templateId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });

  // Fetch activity log
  const { data: activity, isLoading: isLoadingActivity } = useQuery({
    queryKey: ['template-activity', templateId],
    queryFn: async () => {
      if (!templateId) return [];
      
      const { data, error } = await supabase
        .from('template_activity')
        .select('*')
        .eq('template_id', templateId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });

  // Fetch active editing sessions
  const { data: activeSessions, isLoading: isLoadingSessions } = useQuery({
    queryKey: ['template-sessions', templateId],
    queryFn: async () => {
      if (!templateId) return [];
      
      const { data, error } = await supabase
        .from('template_editing_sessions')
        .select('*')
        .eq('template_id', templateId)
        .eq('is_active', true);

      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });

  // Fetch approvals
  const { data: approvals, isLoading: isLoadingApprovals } = useQuery({
    queryKey: ['template-approvals', templateId],
    queryFn: async () => {
      if (!templateId) return [];
      
      const { data, error } = await supabase
        .from('template_approvals')
        .select('*')
        .eq('template_id', templateId)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });

  // Real-time subscriptions
  useEffect(() => {
    if (!templateId) return;

    const commentsChannel = supabase
      .channel('template-comments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'template_comments',
          filter: `template_id=eq.${templateId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['template-comments', templateId] });
        }
      )
      .subscribe();

    const activityChannel = supabase
      .channel('template-activity')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'template_activity',
          filter: `template_id=eq.${templateId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['template-activity', templateId] });
        }
      )
      .subscribe();

    const sessionsChannel = supabase
      .channel('template-sessions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'template_editing_sessions',
          filter: `template_id=eq.${templateId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['template-sessions', templateId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(commentsChannel);
      supabase.removeChannel(activityChannel);
      supabase.removeChannel(sessionsChannel);
    };
  }, [templateId, queryClient]);

  // Add comment
  const addComment = useMutation({
    mutationFn: async ({
      templateId,
      commentText,
      parentCommentId,
    }: {
      templateId: string;
      commentText: string;
      parentCommentId?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nicht authentifiziert');

      const { data, error } = await supabase
        .from('template_comments')
        .insert({
          template_id: templateId,
          user_id: user.id,
          comment_text: commentText,
          parent_comment_id: parentCommentId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Kommentar hinzugefügt',
        description: 'Ihr Kommentar wurde erfolgreich hinzugefügt.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Kommentar konnte nicht hinzugefügt werden',
        variant: 'destructive',
      });
    },
  });

  // Submit for approval
  const submitForApproval = useMutation({
    mutationFn: async ({
      templateId,
      versionId,
      approverId,
    }: {
      templateId: string;
      versionId?: string;
      approverId: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nicht authentifiziert');

      const { data, error } = await supabase
        .from('template_approvals')
        .insert({
          template_id: templateId,
          version_id: versionId,
          submitted_by: user.id,
          approver_id: approverId,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-approvals'] });
      toast({
        title: 'Freigabe beantragt',
        description: 'Das Template wurde zur Freigabe eingereicht.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Freigabe konnte nicht beantragt werden',
        variant: 'destructive',
      });
    },
  });

  // Update approval status
  const updateApproval = useMutation({
    mutationFn: async ({
      approvalId,
      status,
      comment,
    }: {
      approvalId: string;
      status: 'approved' | 'rejected';
      comment?: string;
    }) => {
      const { error } = await supabase
        .from('template_approvals')
        .update({
          status,
          comment,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', approvalId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-approvals'] });
      toast({
        title: 'Freigabe aktualisiert',
        description: 'Der Freigabestatus wurde aktualisiert.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Freigabe konnte nicht aktualisiert werden',
        variant: 'destructive',
      });
    },
  });

  // Start editing session
  const startEditingSession = useMutation({
    mutationFn: async (templateId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nicht authentifiziert');

      const { data, error } = await supabase
        .from('template_editing_sessions')
        .insert({
          template_id: templateId,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
  });

  // End editing session
  const endEditingSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('template_editing_sessions')
        .update({ is_active: false })
        .eq('id', sessionId);

      if (error) throw error;
    },
  });

  // Update session activity
  const updateSessionActivity = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('template_editing_sessions')
        .update({ last_activity: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) throw error;
    },
  });

  return {
    comments,
    activity,
    activeSessions,
    approvals,
    isLoading: isLoadingComments || isLoadingActivity || isLoadingSessions || isLoadingApprovals,
    addComment: addComment.mutate,
    submitForApproval: submitForApproval.mutate,
    updateApproval: updateApproval.mutate,
    startEditingSession: startEditingSession.mutate,
    endEditingSession: endEditingSession.mutate,
    updateSessionActivity: updateSessionActivity.mutate,
    isAddingComment: addComment.isPending,
    isSubmittingApproval: submitForApproval.isPending,
    isUpdatingApproval: updateApproval.isPending,
  };
};
