/**
 * SfxBrowser — Sound-Effects tab. Uses existing `search-sfx-library`
 * edge function and persists favorites in `user_audio_library` with
 * type='sfx'. Keeps UI lean — for advanced filters the dedicated
 * /sfx-library page remains the power-user surface.
 */
import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Play, Pause, Heart, Search, Volume2,
  ArrowUpRightFromSquare,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { LicenseButton } from '@/components/licensing/LicenseButton';
import { useDownloadQuota } from '@/hooks/useDownloadQuota';

interface SfxTrack {
  id: string;
  external_id?: string;
  source?: string;
  title: string;
  preview_url: string;
  download_url?: string;
  duration?: number;
  tags?: string[];
  thumbnail_url?: string;
}

const QUICK = ['whoosh', 'impact', 'click', 'notification', 'cinematic', 'transition'];

export default function SfxBrowser() {
  const { user } = useAuth();
  const quota = useDownloadQuota();
  const [query, setQuery] = useState('whoosh');
  const [results, setResults] = useState<SfxTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    runSearch('whoosh');
    if (user) loadFavorites();
    return () => audioRef.current?.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadFavorites() {
    if (!user) return;
    const { data } = await supabase
      .from('user_audio_library')
      .select('external_id, source')
      .eq('user_id', user.id)
      .eq('type', 'sfx');
    if (data) setFavorites(new Set(data.map((r: any) => `${r.source}-${r.external_id}`)));
  }

  async function runSearch(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-sfx-library', {
        body: { query: q.trim(), limit: 24 },
      });
      if (error) throw error;
      const list = (data?.results ?? data?.sfx ?? []) as SfxTrack[];
      setResults(list);
    } catch (err) {
      toast({
        title: 'SFX-Suche fehlgeschlagen',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      });
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function togglePlay(t: SfxTrack) {
    if (playingId === t.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const a = new Audio(t.preview_url);
    a.volume = 0.8;
    a.onended = () => setPlayingId(null);
    a.play().catch(() => toast({ title: 'Preview nicht abspielbar', variant: 'destructive' }));
    audioRef.current = a;
    setPlayingId(t.id);
  }

  async function toggleFavorite(t: SfxTrack) {
    if (!user) {
      toast({ title: 'Login nötig' });
      return;
    }
    const src = (t.source as any) ?? 'freesound';
    const allowedSrc = ['freesound', 'pixabay_sfx'].includes(src) ? src : 'freesound';
    const ext = String(t.external_id ?? t.id);
    const key = `${allowedSrc}-${ext}`;
    if (favorites.has(key)) {
      await supabase
        .from('user_audio_library')
        .delete()
        .eq('user_id', user.id)
        .eq('type', 'sfx')
        .eq('source', allowedSrc)
        .eq('external_id', ext);
      favorites.delete(key);
      setFavorites(new Set(favorites));
      return;
    }
    if (quota.exceeded) {
      toast({
        title: 'Monatslimit erreicht',
        description: 'Upgrade für unbegrenzte Downloads.',
        variant: 'destructive',
      });
      return;
    }
    const { error } = await supabase.from('user_audio_library').insert({
      user_id: user.id,
      type: 'sfx',
      source: allowedSrc,
      external_id: ext,
      title: t.title,
      url: t.download_url ?? t.preview_url,
      preview_url: t.preview_url,
      thumbnail_url: t.thumbnail_url ?? null,
      duration_sec: t.duration ?? null,
      tags: t.tags ?? [],
    });
    if (error) {
      toast({ title: 'Speichern fehlgeschlagen', description: error.message, variant: 'destructive' });
      return;
    }
    setFavorites(new Set([...favorites, key]));
    quota.refresh();
    toast({ title: 'SFX gespeichert' });
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suche nach SFX (z.B. whoosh, glass, footstep)…"
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Suchen'}
        </Button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <Badge
            key={q}
            variant="outline"
            className="cursor-pointer hover:bg-primary/10"
            onClick={() => {
              setQuery(q);
              runSearch(q);
            }}
          >
            {q}
          </Badge>
        ))}
        <Button asChild variant="ghost" size="sm" className="h-6 text-[11px] ml-auto">
          <Link to="/sfx-library">
            Erweiterte SFX-Library <ArrowUpRightFromSquare className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </div>

      {loading && results.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Lade SFX …
        </Card>
      ) : results.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          Keine Treffer.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {results.map((t) => {
            const ext = String(t.external_id ?? t.id);
            const src = (t.source as any) ?? 'freesound';
            const key = `${src}-${ext}`;
            const isPlay = playingId === t.id;
            const isFav = favorites.has(key);
            return (
              <Card key={t.id} className="p-3 flex items-center gap-3 hover:border-primary/40">
                <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0" onClick={() => togglePlay(t)}>
                  {isPlay ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
                </Button>
                <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {(t.tags ?? []).slice(0, 4).join(' · ') || 'royalty-free SFX'}
                    {t.duration ? ` · ${t.duration.toFixed(1)}s` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleFavorite(t)}>
                    <Heart className={`h-3.5 w-3.5 ${isFav ? 'fill-current text-rose-400' : ''}`} />
                  </Button>
                  <LicenseButton
                    asset_type="sfx"
                    asset_id={ext}
                    asset_title={t.title}
                    asset_thumbnail_url={t.thumbnail_url ?? null}
                    asset_source_url={t.download_url ?? t.preview_url}
                    source_provider={src === 'pixabay_sfx' ? 'pixabay-sfx' : 'freesound'}
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    label=""
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
