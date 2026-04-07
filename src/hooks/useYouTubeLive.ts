import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Broadcast {
  id: string;
  snippet: {
    title: string;
    description: string;
    scheduledStartTime: string;
    liveChatId?: string;
    thumbnails?: Record<string, { url: string }>;
  };
  status: {
    lifeCycleStatus: string;
    privacyStatus: string;
    recordingStatus: string;
  };
  contentDetails?: {
    boundStreamId?: string;
  };
}

interface StreamKey {
  id: string;
  snippet: { title: string };
  cdn: {
    ingestionInfo: {
      streamName: string;
      ingestionAddress: string;
      backupIngestionAddress: string;
    };
    resolution: string;
    frameRate: string;
  };
  status?: { streamStatus: string };
}

interface ChatMessage {
  id: string;
  snippet: {
    displayMessage: string;
    publishedAt: string;
    liveChatId: string;
  };
  authorDetails: {
    displayName: string;
    profileImageUrl: string;
    isChatOwner: boolean;
    isChatModerator: boolean;
  };
}

export function useYouTubeLive() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [streams, setStreams] = useState<StreamKey[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [chatPolling, setChatPolling] = useState(false);
  const chatPageToken = useRef<string | null>(null);
  const chatInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const invoke = useCallback(async (action: string, extra: Record<string, any> = {}) => {
    const { data, error } = await supabase.functions.invoke('youtube-live', {
      body: { action, ...extra },
    });
    if (error) throw new Error(error.message);
    if (!data?.ok) throw new Error(data?.error || 'Unknown error');
    return data.data;
  }, []);

  const checkConnection = useCallback(async () => {
    try {
      await invoke('check_connection');
      setIsConnected(true);
    } catch {
      setIsConnected(false);
    }
  }, [invoke]);

  const fetchBroadcasts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoke('get_broadcasts');
      setBroadcasts(res.items || []);
    } catch (err: any) {
      console.error('fetchBroadcasts:', err);
      if (err.message?.includes('not connected')) setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  const fetchStreams = useCallback(async () => {
    try {
      const res = await invoke('get_streams');
      setStreams(res.items || []);
    } catch (err: any) {
      console.error('fetchStreams:', err);
    }
  }, [invoke]);

  const createBroadcast = useCallback(async (
    title: string, description: string, scheduledStartTime: string, privacyStatus: string
  ) => {
    const res = await invoke('create_broadcast', { title, description, scheduledStartTime, privacyStatus });
    toast({ title: '🎬 Broadcast erstellt', description: title });
    await fetchBroadcasts();
    return res;
  }, [invoke, fetchBroadcasts, toast]);

  const updateBroadcast = useCallback(async (broadcastId: string, title: string, description: string) => {
    await invoke('update_broadcast', { broadcastId, title, description });
    toast({ title: '✏️ Broadcast aktualisiert' });
    await fetchBroadcasts();
  }, [invoke, fetchBroadcasts, toast]);

  const transitionBroadcast = useCallback(async (broadcastId: string, broadcastStatus: string) => {
    await invoke('transition_broadcast', { broadcastId, broadcastStatus });
    toast({ title: `🔄 Status: ${broadcastStatus}` });
    await fetchBroadcasts();
  }, [invoke, fetchBroadcasts, toast]);

  const createStream = useCallback(async (streamTitle?: string) => {
    const res = await invoke('create_stream', { streamTitle });
    toast({ title: '🔑 Stream-Key erstellt' });
    await fetchStreams();
    return res;
  }, [invoke, fetchStreams, toast]);

  const bindStream = useCallback(async (broadcastId: string, streamId: string) => {
    await invoke('bind_stream', { broadcastId, streamId });
    toast({ title: '🔗 Stream an Broadcast gebunden' });
    await fetchBroadcasts();
  }, [invoke, fetchBroadcasts, toast]);

  const fetchChat = useCallback(async (liveChatId: string) => {
    const res = await invoke('get_chat', { liveChatId, pageToken: chatPageToken.current });
    if (res.items) {
      setChatMessages(prev => {
        const ids = new Set(prev.map(m => m.id));
        const newMsgs = res.items.filter((m: ChatMessage) => !ids.has(m.id));
        return [...prev, ...newMsgs];
      });
    }
    chatPageToken.current = res.nextPageToken || null;
    return res.pollingIntervalMillis || 5000;
  }, [invoke]);

  const startChatPolling = useCallback((liveChatId: string) => {
    if (chatInterval.current) clearInterval(chatInterval.current);
    setChatPolling(true);
    setChatMessages([]);
    chatPageToken.current = null;

    const poll = async () => {
      try {
        const interval = await fetchChat(liveChatId);
        if (chatInterval.current) clearInterval(chatInterval.current);
        chatInterval.current = setInterval(poll, interval);
      } catch { /* ignore */ }
    };
    poll();
  }, [fetchChat]);

  const stopChatPolling = useCallback(() => {
    if (chatInterval.current) clearInterval(chatInterval.current);
    chatInterval.current = null;
    setChatPolling(false);
  }, []);

  const sendChatMessage = useCallback(async (liveChatId: string, messageText: string) => {
    await invoke('send_chat', { liveChatId, messageText });
  }, [invoke]);

  const getVideoStats = useCallback(async (videoId: string) => {
    const res = await invoke('get_video_stats', { videoId });
    return res.items?.[0] || null;
  }, [invoke]);

  useEffect(() => {
    checkConnection();
    return () => stopChatPolling();
  }, [checkConnection, stopChatPolling]);

  return {
    isConnected,
    broadcasts,
    streams,
    chatMessages,
    loading,
    chatPolling,
    fetchBroadcasts,
    fetchStreams,
    createBroadcast,
    updateBroadcast,
    transitionBroadcast,
    createStream,
    bindStream,
    startChatPolling,
    stopChatPolling,
    sendChatMessage,
    getVideoStats,
    checkConnection,
  };
}
