import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
  description: string;
}

interface TwitchStream {
  id: string;
  user_login: string;
  game_name: string;
  title: string;
  viewer_count: number;
  started_at: string;
  thumbnail_url: string;
}

interface TwitchChannel {
  broadcaster_login: string;
  display_name: string;
  game_name: string;
  title: string;
  is_live: boolean;
}

interface TwitchClip {
  id: string;
  url: string;
  embed_url: string;
  broadcaster_name: string;
  creator_name: string;
  title: string;
  view_count: number;
  created_at: string;
  thumbnail_url: string;
  duration: number;
}

interface TwitchGame {
  id: string;
  name: string;
  box_art_url: string;
}

export function useTwitch() {
  const { user } = useAuth();
  const [twitchUsername, setTwitchUsername] = useState<string | null>(null);
  const [twitchUser, setTwitchUser] = useState<TwitchUser | null>(null);
  const [stream, setStream] = useState<TwitchStream | null>(null);
  const [channel, setChannel] = useState<TwitchChannel | null>(null);
  const [clips, setClips] = useState<TwitchClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');
    return session;
  }, []);

  const invokeFunction = useCallback(async (name: string, body: any) => {
    const session = await getSession();
    const { data, error: fnError } = await supabase.functions.invoke(name, {
      body,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (fnError) throw fnError;
    return data;
  }, [getSession]);

  // Load twitch_username from profile
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('twitch_username')
        .eq('id', user.id)
        .single();
      setTwitchUsername(data?.twitch_username || null);
      setLoading(false);
    })();
  }, [user]);

  // Validate & save username
  const connectTwitch = useCallback(async (username: string) => {
    if (!user) throw new Error('Not authenticated');
    setError(null);

    const data = await invokeFunction('twitch-user', { login: username });
    if (!data?.data?.length) throw new Error('Twitch-Benutzer nicht gefunden');

    const tUser = data.data[0];
    await supabase
      .from('profiles')
      .update({ twitch_username: tUser.login } as any)
      .eq('id', user.id);

    setTwitchUsername(tUser.login);
    setTwitchUser(tUser);
    return tUser;
  }, [user, invokeFunction]);

  const disconnectTwitch = useCallback(async () => {
    if (!user) return;
    await supabase
      .from('profiles')
      .update({ twitch_username: null } as any)
      .eq('id', user.id);
    setTwitchUsername(null);
    setTwitchUser(null);
    setStream(null);
    setChannel(null);
    setClips([]);
  }, [user]);

  // Fetch stream status
  const fetchStream = useCallback(async () => {
    if (!twitchUsername) return;
    try {
      const data = await invokeFunction('twitch-stream', { user_login: twitchUsername });
      setStream(data?.data?.[0] || null);
      setChannel(data?.channel || null);
    } catch (e) {
      console.error('[useTwitch] fetchStream error:', e);
    }
  }, [twitchUsername, invokeFunction]);

  // Fetch clips
  const fetchClips = useCallback(async () => {
    if (!twitchUser?.id) return;
    try {
      const data = await invokeFunction('twitch-clips', { broadcaster_id: twitchUser.id });
      setClips(data?.data || []);
    } catch (e) {
      console.error('[useTwitch] fetchClips error:', e);
    }
  }, [twitchUser?.id, invokeFunction]);

  // Update channel info (title, game, tags)
  const updateChannel = useCallback(async (title?: string, gameId?: string, tags?: string[]) => {
    if (!twitchUser?.id) throw new Error('Not connected');
    await invokeFunction('twitch-channel-update', {
      broadcaster_id: twitchUser.id,
      title,
      game_id: gameId,
      tags,
    });
  }, [twitchUser?.id, invokeFunction]);

  // Search games/categories
  const searchGames = useCallback(async (query: string): Promise<TwitchGame[]> => {
    if (!query || query.length < 2) return [];
    try {
      const data = await invokeFunction('twitch-games-search', { query });
      return data?.data || [];
    } catch {
      return [];
    }
  }, [invokeFunction]);

  // Create a clip (only when live)
  const createClip = useCallback(async () => {
    if (!twitchUser?.id) throw new Error('Not connected');
    const data = await invokeFunction('twitch-clip-create', { broadcaster_id: twitchUser.id });
    return data?.data?.[0];
  }, [twitchUser?.id, invokeFunction]);

  // Send chat message
  const sendChat = useCallback(async (message: string) => {
    if (!twitchUser?.id) throw new Error('Not connected');
    await invokeFunction('twitch-send-chat', {
      broadcaster_id: twitchUser.id,
      sender_id: twitchUser.id,
      message,
    });
  }, [twitchUser?.id, invokeFunction]);

  // Get viewer list
  const getViewerList = useCallback(async () => {
    if (!twitchUser?.id) return [];
    try {
      const data = await invokeFunction('twitch-chatters', {
        broadcaster_id: twitchUser.id,
        moderator_id: twitchUser.id,
      });
      return data?.data || [];
    } catch {
      return [];
    }
  }, [twitchUser?.id, invokeFunction]);

  // Polls
  const createPoll = useCallback(async (title: string, choices: string[], duration?: number) => {
    if (!twitchUser?.id) throw new Error('Not connected');
    return invokeFunction('twitch-polls', {
      action: 'create',
      broadcaster_id: twitchUser.id,
      title,
      choices,
      duration,
    });
  }, [twitchUser?.id, invokeFunction]);

  const getPolls = useCallback(async () => {
    if (!twitchUser?.id) return [];
    try {
      const data = await invokeFunction('twitch-polls', {
        action: 'list',
        broadcaster_id: twitchUser.id,
      });
      return data?.data || [];
    } catch {
      return [];
    }
  }, [twitchUser?.id, invokeFunction]);

  const endPoll = useCallback(async (pollId: string) => {
    if (!twitchUser?.id) throw new Error('Not connected');
    return invokeFunction('twitch-polls', {
      action: 'end',
      broadcaster_id: twitchUser.id,
      poll_id: pollId,
    });
  }, [twitchUser?.id, invokeFunction]);

  // Predictions
  const createPrediction = useCallback(async (title: string, outcomes: string[], predictionWindow?: number) => {
    if (!twitchUser?.id) throw new Error('Not connected');
    return invokeFunction('twitch-predictions', {
      action: 'create',
      broadcaster_id: twitchUser.id,
      title,
      outcomes,
      prediction_window: predictionWindow,
    });
  }, [twitchUser?.id, invokeFunction]);

  const getPredictions = useCallback(async () => {
    if (!twitchUser?.id) return [];
    try {
      const data = await invokeFunction('twitch-predictions', {
        action: 'list',
        broadcaster_id: twitchUser.id,
      });
      return data?.data || [];
    } catch {
      return [];
    }
  }, [twitchUser?.id, invokeFunction]);

  // Analytics
  const getFollowerCount = useCallback(async () => {
    if (!twitchUser?.id) return { followers: 0, subscribers: 0 };
    try {
      return await invokeFunction('twitch-followers', { broadcaster_id: twitchUser.id });
    } catch {
      return { followers: 0, subscribers: 0 };
    }
  }, [twitchUser?.id, invokeFunction]);

  // Schedule
  const getSchedule = useCallback(async () => {
    if (!twitchUser?.id) return null;
    try {
      return await invokeFunction('twitch-schedule', {
        action: 'list',
        broadcaster_id: twitchUser.id,
      });
    } catch {
      return null;
    }
  }, [twitchUser?.id, invokeFunction]);

  // Rewards
  const getRewards = useCallback(async () => {
    if (!twitchUser?.id) return [];
    try {
      const data = await invokeFunction('twitch-rewards', {
        action: 'list',
        broadcaster_id: twitchUser.id,
      });
      return data?.data || [];
    } catch {
      return [];
    }
  }, [twitchUser?.id, invokeFunction]);

  const getVips = useCallback(async () => {
    if (!twitchUser?.id) return [];
    try {
      const data = await invokeFunction('twitch-rewards', {
        action: 'vips',
        broadcaster_id: twitchUser.id,
      });
      return data?.data || [];
    } catch {
      return [];
    }
  }, [twitchUser?.id, invokeFunction]);

  // Auto-fetch when connected
  useEffect(() => {
    if (!twitchUsername) return;

    if (!twitchUser) {
      (async () => {
        try {
          const data = await invokeFunction('twitch-user', { login: twitchUsername });
          if (data?.data?.[0]) setTwitchUser(data.data[0]);
        } catch (e) { console.error(e); }
      })();
    }

    fetchStream();
    const interval = setInterval(fetchStream, 30000);
    return () => clearInterval(interval);
  }, [twitchUsername, twitchUser, fetchStream, invokeFunction]);

  // Fetch clips when twitchUser is set
  useEffect(() => {
    if (twitchUser?.id) fetchClips();
  }, [twitchUser?.id, fetchClips]);

  return {
    twitchUsername,
    twitchUser,
    stream,
    channel,
    clips,
    loading,
    error,
    connectTwitch,
    disconnectTwitch,
    fetchStream,
    fetchClips,
    updateChannel,
    searchGames,
    createClip,
    sendChat,
    getViewerList,
    createPoll,
    getPolls,
    endPoll,
    createPrediction,
    getPredictions,
    getFollowerCount,
    getSchedule,
    getRewards,
    getVips,
    isConnected: !!twitchUsername,
    isLive: !!stream,
  };
}
