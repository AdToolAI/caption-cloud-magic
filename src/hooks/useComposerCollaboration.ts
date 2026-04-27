import { useEffect, useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type CollaboratorRole = 'viewer' | 'editor' | 'owner';

export interface ComposerCollaborator {
  id: string;
  project_id: string;
  user_id: string;
  invited_email: string | null;
  role: CollaboratorRole;
  invited_by: string | null;
  invited_at: string;
  accepted_at: string | null;
}

export interface PresenceUser {
  user_id: string;
  name: string;
  email?: string;
  color: string;
  cursor_x: number | null;
  cursor_y: number | null;
  active_scene_id: string | null;
  online_at: string;
}

const PRESENCE_COLORS = [
  '#F5C76A', // gold
  '#22D3EE', // cyan
  '#A78BFA', // violet
  '#F472B6', // pink
  '#34D399', // emerald
  '#FB923C', // orange
  '#60A5FA', // blue
  '#FBBF24', // amber
];

function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}

/* -------------------- Collaborators (CRUD) -------------------- */

export function useComposerCollaborators(projectId: string | undefined) {
  return useQuery({
    queryKey: ['composer-collaborators', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('composer_collaborators')
        .select('*')
        .eq('project_id', projectId!)
        .order('invited_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ComposerCollaborator[];
    },
  });
}

export function useInviteCollaborator(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { email: string; role: CollaboratorRole }) => {
      if (!projectId) throw new Error('No project');
      const { data, error } = await supabase.functions.invoke('invite-composer-collaborator', {
        body: { projectId, email: params.email, role: params.role },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['composer-collaborators', projectId] });
    },
  });
}

export function useRemoveCollaborator(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (collaboratorId: string) => {
      const { error } = await supabase
        .from('composer_collaborators')
        .delete()
        .eq('id', collaboratorId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['composer-collaborators', projectId] });
    },
  });
}

/* -------------------- Realtime: Scenes Auto-Sync -------------------- */

export function useComposerScenesRealtime(projectId: string | undefined, onScenesChange?: () => void) {
  const callbackRef = useRef(onScenesChange);
  callbackRef.current = onScenesChange;

  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`composer-scenes:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'composer_scenes',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          callbackRef.current?.();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);
}

/* -------------------- Presence (Cursors + Active Scene) -------------------- */

export function useComposerPresence(
  projectId: string | undefined,
  selfMeta: { userId: string; name: string; email?: string } | null,
) {
  const [peers, setPeers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef<{ cursor_x: number | null; cursor_y: number | null; active_scene_id: string | null }>({
    cursor_x: null,
    cursor_y: null,
    active_scene_id: null,
  });
  const lastTrackRef = useRef(0);

  useEffect(() => {
    if (!projectId || !selfMeta) return;

    const channel = supabase.channel(`composer-presence:${projectId}`, {
      config: { presence: { key: selfMeta.userId } },
    });
    channelRef.current = channel;

    const syncPeers = () => {
      const state = channel.presenceState<PresenceUser>();
      const flat: PresenceUser[] = [];
      Object.values(state).forEach((entries) => {
        const last = entries[entries.length - 1];
        if (last && last.user_id !== selfMeta.userId) flat.push(last);
      });
      setPeers(flat);
    };

    channel
      .on('presence', { event: 'sync' }, syncPeers)
      .on('presence', { event: 'join' }, syncPeers)
      .on('presence', { event: 'leave' }, syncPeers)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: selfMeta.userId,
            name: selfMeta.name,
            email: selfMeta.email,
            color: colorForUser(selfMeta.userId),
            cursor_x: null,
            cursor_y: null,
            active_scene_id: null,
            online_at: new Date().toISOString(),
          } satisfies PresenceUser);
        }
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [projectId, selfMeta?.userId, selfMeta?.name, selfMeta?.email]);

  const updateLocalState = useCallback(
    (patch: Partial<typeof stateRef.current>) => {
      stateRef.current = { ...stateRef.current, ...patch };
      const now = Date.now();
      if (now - lastTrackRef.current < 60) return; // throttle ~16fps
      lastTrackRef.current = now;
      const ch = channelRef.current;
      if (!ch || !selfMeta) return;
      ch.track({
        user_id: selfMeta.userId,
        name: selfMeta.name,
        email: selfMeta.email,
        color: colorForUser(selfMeta.userId),
        ...stateRef.current,
        online_at: new Date().toISOString(),
      } satisfies PresenceUser);
    },
    [selfMeta],
  );

  const trackCursor = useCallback(
    (x: number | null, y: number | null) => updateLocalState({ cursor_x: x, cursor_y: y }),
    [updateLocalState],
  );

  const trackActiveScene = useCallback(
    (sceneId: string | null) => updateLocalState({ active_scene_id: sceneId }),
    [updateLocalState],
  );

  return { peers, trackCursor, trackActiveScene };
}

/* -------------------- Comments -------------------- */

export interface SceneComment {
  id: string;
  scene_id: string;
  project_id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useSceneCommentCounts(projectId: string | undefined) {
  return useQuery({
    queryKey: ['composer-scene-comment-counts', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('composer_scene_comments')
        .select('scene_id, resolved_at')
        .eq('project_id', projectId!);
      if (error) throw error;
      const map: Record<string, { total: number; open: number }> = {};
      (data ?? []).forEach((row: any) => {
        const e = (map[row.scene_id] ||= { total: 0, open: 0 });
        e.total++;
        if (!row.resolved_at) e.open++;
      });
      return map;
    },
    refetchInterval: 30_000,
  });
}

export function useSceneComments(sceneId: string | undefined, projectId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['composer-scene-comments', sceneId],
    enabled: !!sceneId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('composer_scene_comments')
        .select('*')
        .eq('scene_id', sceneId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SceneComment[];
    },
  });

  useEffect(() => {
    if (!sceneId) return;
    const ch = supabase
      .channel(`scene-comments:${sceneId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'composer_scene_comments', filter: `scene_id=eq.${sceneId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['composer-scene-comments', sceneId] });
          qc.invalidateQueries({ queryKey: ['composer-scene-comment-counts', projectId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [sceneId, projectId, qc]);

  const addComment = useMutation({
    mutationFn: async (params: { body: string; parentId?: string | null }) => {
      if (!sceneId || !projectId) throw new Error('Missing scene/project');
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('composer_scene_comments')
        .insert({
          scene_id: sceneId,
          project_id: projectId,
          user_id: u.user.id,
          parent_id: params.parentId ?? null,
          body: params.body,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
  });

  const resolveComment = useMutation({
    mutationFn: async (commentId: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('composer_scene_comments')
        .update({ resolved_at: new Date().toISOString(), resolved_by: u.user?.id ?? null })
        .eq('id', commentId);
      if (error) throw error;
    },
  });

  const reopenComment = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('composer_scene_comments')
        .update({ resolved_at: null, resolved_by: null })
        .eq('id', commentId);
      if (error) throw error;
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase.from('composer_scene_comments').delete().eq('id', commentId);
      if (error) throw error;
    },
  });

  return { ...query, addComment, resolveComment, reopenComment, deleteComment };
}

export { colorForUser };
