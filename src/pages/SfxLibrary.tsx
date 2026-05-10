import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { LicenseButton } from "@/components/licensing/LicenseButton";
import { useAuth } from "@/hooks/useAuth";
import {
  Search, Play, Pause, Heart, Loader2, AudioWaveform, Download,
  Scissors, Edit, Sparkles,
} from "lucide-react";

interface SfxItem {
  id: string;
  title: string;
  artist: string;
  duration: number;
  preview_url: string;
  download_url: string;
  source: string;
  tags: string[];
  license?: string;
}

const CATEGORIES = [
  { key: "", label: "Alle" },
  { key: "whoosh transition", label: "Whoosh & Transitions" },
  { key: "impact cinematic", label: "Cinematic Impact" },
  { key: "ui click", label: "UI Clicks" },
  { key: "ambient", label: "Ambient" },
  { key: "footsteps", label: "Footsteps" },
  { key: "explosion", label: "Explosions" },
  { key: "nature", label: "Nature" },
  { key: "sci-fi", label: "Sci-Fi" },
  { key: "notification", label: "Notifications" },
];

export default function SfxLibrary() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [results, setResults] = useState<SfxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<SfxItem[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initial load
  useEffect(() => {
    runSearch("", "");
    if (user) loadFavorites();
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(q: string, cat: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-sfx-library", {
        body: { query: q, category: cat, limit: 30 },
      });
      if (error) throw error;
      setResults((data?.results ?? []) as SfxItem[]);
    } catch (err: any) {
      toast({ title: "Suche fehlgeschlagen", description: err?.message ?? "Unbekannter Fehler", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function loadFavorites() {
    if (!user) return;
    setFavoritesLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_audio_library")
        .select("external_id, title, artist, url, preview_url, duration_sec, source, tags")
        .eq("user_id", user.id)
        .eq("type", "sfx")
        .eq("is_favorite", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setFavorites(
        (data ?? []).map((r: any) => ({
          id: r.external_id ?? r.url,
          title: r.title,
          artist: r.artist ?? "",
          duration: Number(r.duration_sec) || 0,
          preview_url: r.preview_url ?? r.url,
          download_url: r.url,
          source: r.source,
          tags: r.tags ?? [],
        }))
      );
    } finally {
      setFavoritesLoading(false);
    }
  }

  const isFavorite = (item: SfxItem) =>
    favorites.some((f) => f.id === item.id || f.download_url === item.download_url);

  async function toggleFavorite(item: SfxItem) {
    if (!user) {
      toast({ title: "Login nötig", description: "Bitte einloggen, um Favoriten zu speichern." });
      return;
    }
    const fav = isFavorite(item);
    if (fav) {
      await supabase
        .from("user_audio_library")
        .delete()
        .eq("user_id", user.id)
        .eq("type", "sfx")
        .eq("source", item.source as any)
        .eq("external_id", item.id.replace(/^[^-]+-/, ""));
      toast({ title: "Aus Favoriten entfernt" });
    } else {
      await supabase.from("user_audio_library").insert({
        user_id: user.id,
        type: "sfx",
        source: (item.source === "pixabay" ? "pixabay_sfx" : item.source) as any,
        external_id: item.id.replace(/^[^-]+-/, ""),
        title: item.title,
        artist: item.artist,
        url: item.download_url,
        preview_url: item.preview_url,
        duration_sec: item.duration,
        tags: item.tags,
        is_favorite: true,
      });
      toast({ title: "Zu Favoriten hinzugefügt", description: item.title });
    }
    loadFavorites();
  }

  function togglePlay(item: SfxItem) {
    if (playingId === item.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(item.preview_url);
    audio.volume = 0.85;
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      setPlayingId(null);
      toast({ title: "Wiedergabe fehlgeschlagen", variant: "destructive" });
    };
    audio.play().catch(() => setPlayingId(null));
    audioRef.current = audio;
    setPlayingId(item.id);
  }

  function useInComposer(item: SfxItem) {
    sessionStorage.setItem(
      "composer:incoming-sfx",
      JSON.stringify({
        title: item.title,
        url: item.download_url,
        duration: item.duration,
        source: item.source,
        license: item.license,
        tags: item.tags,
      })
    );
    toast({ title: "Im Composer geladen", description: "SFX wird beim Öffnen automatisch hinzugefügt." });
    navigate("/video-composer");
  }

  function useInDirectorsCut(item: SfxItem) {
    sessionStorage.setItem(
      "directors-cut:incoming-sfx",
      JSON.stringify({
        title: item.title,
        url: item.download_url,
        duration: item.duration,
        source: item.source,
        license: item.license,
        tags: item.tags,
      })
    );
    toast({ title: "In Director's Cut geladen", description: "SFX wird als Audio-Layer hinzugefügt." });
    navigate("/universal-directors-cut");
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query, category);
  };

  const renderGrid = (items: SfxItem[], emptyMsg: string) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.length === 0 ? (
        <div className="col-span-full text-center py-12 text-muted-foreground text-sm">
          {emptyMsg}
        </div>
      ) : (
        items.map((item) => (
          <Card
            key={item.id}
            className="p-4 bg-black/40 border-yellow-500/15 hover:border-yellow-500/40 transition-all backdrop-blur-sm"
          >
            <div className="flex items-start gap-3">
              <Button
                size="icon"
                variant="outline"
                className="shrink-0 h-10 w-10 rounded-full border-yellow-500/40"
                onClick={() => togglePlay(item)}
              >
                {playingId === item.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
              </Button>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.artist} · {item.duration ? `${item.duration.toFixed(1)}s` : "—"}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => toggleFavorite(item)}
                  >
                    <Heart
                      className={`h-4 w-4 ${isFavorite(item) ? "fill-red-500 text-red-500" : ""}`}
                    />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {item.tags.slice(0, 3).map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">
                      {t}
                    </Badge>
                  ))}
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-yellow-500/30 text-yellow-300/80">
                    {item.source}
                  </Badge>
                </div>
                <div className="flex gap-1 mt-3">
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => useInComposer(item)}>
                    <Scissors className="h-3 w-3 mr-1" />
                    Composer
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => useInDirectorsCut(item)}>
                    <Edit className="h-3 w-3 mr-1" />
                    DC
                  </Button>
                  <LicenseButton
                    asset_type="stock-sfx"
                    asset_id={String(item.id)}
                    asset_title={item.title}
                    asset_thumbnail_url={null}
                    asset_source_url={item.download_url}
                    source_provider={item.source === "freesound" ? "freesound" : "pixabay"}
                    size="icon"
                    label=""
                    className="h-7 w-7"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => window.open(item.download_url, "_blank")}
                    title="Download"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#050816] via-[#0a0f24] to-[#050816] text-foreground">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <header className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-yellow-400/20 to-yellow-600/10 border border-yellow-500/30 flex items-center justify-center">
              <AudioWaveform className="h-5 w-5 text-yellow-400" />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-semibold tracking-tight">SFX Library</h1>
              <p className="text-sm text-muted-foreground">
                Royalty-free Sound Effects · Pixabay + Freesound · 24h cached
              </p>
            </div>
          </div>
        </header>

        <form onSubmit={handleSearchSubmit} className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="z.B. whoosh, explosion, click, ambient forest..."
              className="pl-10 bg-black/40 border-yellow-500/20"
            />
          </div>
          <Button type="submit" disabled={loading} className="bg-yellow-500/90 text-black hover:bg-yellow-500">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="ml-2">Suchen</span>
          </Button>
        </form>

        <ScrollArea className="mb-4">
          <div className="flex gap-2 pb-2">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat.key || "all"}
                size="sm"
                variant={category === cat.key ? "default" : "outline"}
                className={`shrink-0 h-7 text-xs ${category === cat.key ? "bg-yellow-500 text-black hover:bg-yellow-400" : "border-yellow-500/20"}`}
                onClick={() => {
                  setCategory(cat.key);
                  runSearch(query, cat.key);
                }}
              >
                {cat.label}
              </Button>
            ))}
          </div>
        </ScrollArea>

        <Tabs defaultValue="results">
          <TabsList className="bg-black/40 border border-yellow-500/15">
            <TabsTrigger value="results">Ergebnisse ({results.length})</TabsTrigger>
            <TabsTrigger value="favorites">Favoriten ({favorites.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="results" className="mt-4">
            {loading && results.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-yellow-400" />
              </div>
            ) : (
              renderGrid(results, "Keine Ergebnisse — versuche eine andere Suche.")
            )}
          </TabsContent>

          <TabsContent value="favorites" className="mt-4">
            {favoritesLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-yellow-400" />
              </div>
            ) : (
              renderGrid(favorites, user ? "Noch keine Favoriten — klicke das Herz auf einem Sound." : "Bitte einloggen, um Favoriten zu speichern.")
            )}
          </TabsContent>
        </Tabs>

        <p className="text-[10px] text-muted-foreground/70 mt-8 text-center">
          Sounds stammen von Pixabay (Pixabay Content License) und Freesound (Creative Commons).
          Beim Verwenden bleibt die Original-Lizenz des jeweiligen Anbieters gültig — siehe spätere License-Certificate-Funktion (Phase 6.2).
        </p>
      </div>
    </div>
  );
}
