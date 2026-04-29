import { useEffect, useState, useRef } from 'react';
import { Play, Pause, Download, Loader2, Music2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface Track {
  id: string;
  title: string;
  url: string;
  duration_sec: number;
  created_at: string;
  processing_preset: string | null;
  genre: string | null;
  mood: string | null;
  effect_config: any;
}

const TIER_COLOR: Record<string, string> = {
  quick: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  adaptive: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  standard: 'bg-primary/15 text-primary border-primary/30',
  vocal: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  pro: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
};

export function MyTracksGrid() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data, error } = await supabase
        .from('universal_audio_assets')
        .select('id, title, url, duration_sec, created_at, processing_preset, genre, mood, effect_config')
        .eq('user_id', user.id)
        .eq('type', 'music')
        .eq('source', 'generated')
        .order('created_at', { ascending: false })
        .limit(60);
      if (!mounted) return;
      if (!error && data) setTracks(data as Track[]);
      setLoading(false);
    })();
    return () => { mounted = false; if (audioRef.current) audioRef.current.pause(); };
  }, []);

  const togglePlay = (track: Track) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const a = new Audio(track.url);
    audioRef.current = a;
    a.onended = () => setPlayingId(null);
    a.play().catch(() => setPlayingId(null));
    setPlayingId(track.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Lade deine Tracks…
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <Card className="p-12 text-center border-dashed border-primary/20 bg-background/40">
        <Music2 className="h-10 w-10 text-primary/40 mx-auto mb-3" />
        <p className="text-foreground font-medium">Noch keine generierten Tracks</p>
        <p className="text-sm text-muted-foreground mt-1">
          Wechsel zum Generate-Tab und erschaffe deinen ersten Track.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {tracks.map((track) => {
        const isPlaying = playingId === track.id;
        const tier = track.processing_preset || 'standard';
        return (
          <Card
            key={track.id}
            className="p-4 border-primary/10 bg-gradient-to-br from-background/80 to-background/40 backdrop-blur-sm hover:border-primary/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className={`text-[10px] h-5 ${TIER_COLOR[tier] || ''}`}>
                    {tier}
                  </Badge>
                  {track.genre && <Badge variant="outline" className="text-[10px] h-5">{track.genre}</Badge>}
                  {track.mood && <Badge variant="outline" className="text-[10px] h-5">{track.mood}</Badge>}
                </div>
                <h3 className="font-medium text-sm truncate text-foreground">{track.title}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {Math.round(track.duration_sec)}s • {formatDistanceToNow(new Date(track.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => togglePlay(track)}
                className="flex-1 gap-1.5 border-primary/30 hover:bg-primary/10"
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {isPlaying ? 'Pause' : 'Abspielen'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                asChild
                className="hover:bg-primary/10"
              >
                <a href={track.url} download={`${track.title}.mp3`} target="_blank" rel="noreferrer">
                  <Download className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
