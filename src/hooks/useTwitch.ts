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

export function useTwitch() {
  const { user } = useAuth();
  const [twitchUsername, setTwitchUsername] = useState<string | null>(null);
  const [twitchUser, setTwitchUser] = useState<TwitchUser | null>(null);
  const [stream, setStream] = useState<TwitchStream | null>(null);
  const [channel, setChannel] = useState<TwitchChannel | null>(null);
  const [clips, setClips] = useState<TwitchClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error: fnError } = await supabase.functions.invoke('twitch-user', {
      body: { login: username },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (fnError) throw fnError;
    if (!data?.data?.length) throw new Error('Twitch-Benutzer nicht gefunden');

    const tUser = data.data[0];

    await supabase
      .from('profiles')
      .update({ twitch_username: tUser.login } as any)
      .eq('id', user.id);

    setTwitchUsername(tUser.login);
    setTwitchUser(tUser);
    return tUser;
  }, [user]);

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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error: fnError } = await supabase.functions.invoke('twitch-stream', {
        body: { user_login: twitchUsername },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) { console.error('[useTwitch] stream error:', fnError); return; }

      setStream(data?.data?.[0] || null);
      setChannel(data?.channel || null);
    } catch (e) {
      console.error('[useTwitch] fetchStream error:', e);
    }
  }, [twitchUsername]);

  // Fetch clips
  const fetchClips = useCallback(async () => {
    if (!twitchUser?.id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error: fnError } = await supabase.functions.invoke('twitch-clips', {
        body: { broadcaster_id: twitchUser.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) { console.error('[useTwitch] clips error:', fnError); return; }
      setClips(data?.data || []);
    } catch (e) {
      console.error('[useTwitch] fetchClips error:', e);
    }
  }, [twitchUser?.id]);

  // Auto-fetch when connected
  useEffect(() => {
    if (!twitchUsername) return;

    // Fetch user info if not loaded
    if (!twitchUser) {
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) return;
          const { data } = await supabase.functions.invoke('twitch-user', {
            body: { login: twitchUsername },
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (data?.data?.[0]) setTwitchUser(data.data[0]);
        } catch (e) { console.error(e); }
      })();
    }

    fetchStream();
    const interval = setInterval(fetchStream, 30000);
    return () => clearInterval(interval);
  }, [twitchUsername, twitchUser, fetchStream]);

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
    isConnected: !!twitchUsername,
    isLive: !!stream,
  };
}
