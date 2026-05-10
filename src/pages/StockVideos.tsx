import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Film, Search, Loader2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useStockVideoSearch, type StockVideo, type StockVideoFilters } from "@/hooks/useStockVideoSearch";
import { StockVideoCard } from "@/components/stock-videos/StockVideoCard";
import { StockVideoFilters as FiltersBar } from "@/components/stock-videos/StockVideoFilters";
import { EditorialCollections } from "@/components/stock-videos/EditorialCollections";
import type { StockVideoCollection } from "@/config/stockVideoCollections";
import { useTrackPageFeature } from "@/hooks/useTrackPageFeature";

export default function StockVideos() {
  useTrackPageFeature("stock_videos");
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<StockVideoFilters>({ min_quality: "hd" });
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<StockVideo[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);

  const { results, loading, search } = useStockVideoSearch();

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);

  // Load favorites
  useEffect(() => {
    if (!user) return;
    setFavoritesLoading(true);
    supabase
      .from("user_video_library")
      .select("*")
      .eq("user_id", user.id)
      .eq("asset_type", "stock_video")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) {
          setFavorites(
            data.map((r: any) => ({
              id: `${r.source}-${r.external_id}`,
              provider: r.source as "pexels" | "pixabay",
              external_id: r.external_id,
              title: r.title ?? "Stock Video",
              thumbnail: r.thumbnail_url ?? "",
              preview_url: r.preview_url ?? r.download_url,
              download_url: r.download_url,
              width: r.width ?? 0,
              height: r.height ?? 0,
              duration: Number(r.duration_sec) || 0,
              fps: Number(r.fps) || 30,
              orientation: (r.metadata?.orientation as any) ?? "landscape",
              tags: r.tags ?? [],
              photographer: r.metadata?.photographer ?? "",
              source_url: r.metadata?.source_url ?? "",
              video_files: [],
              is_4k: (r.width ?? 0) >= 3840,
              is_hd: (r.width ?? 0) >= 1920,
              is_vertical: (r.metadata?.orientation as any) === "portrait",
              is_slowmo: (Number(r.fps) || 0) >= 50,
              quality_score: 0,
            })),
          );
        }
        setFavoritesLoading(false);
      });
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveCollection(null);
    search(query, filters);
  };

  const handleFiltersChange = (next: StockVideoFilters) => {
    setFilters(next);
    setActiveCollection(null);
    search(query, next);
  };

  const handleCollectionSelect = (c: StockVideoCollection) => {
    setActiveCollection(c.id);
    setQuery(c.query);
    const merged = { ...filters, ...(c.filters ?? {}) };
    setFilters(merged);
    search(c.query, merged);
  };

  async function toggleFavorite(v: StockVideo) {
    if (!user) {
      toast({ title: "Login nötig", description: "Bitte einloggen, um Favoriten zu speichern." });
      return;
    }
    if (favoriteIds.has(v.id)) {
      await supabase
        .from("user_video_library")
        .delete()
        .eq("user_id", user.id)
        .eq("source", v.provider)
        .eq("external_id", v.external_id);
      setFavorites((prev) => prev.filter((f) => f.id !== v.id));
      toast({ title: "Aus Favoriten entfernt" });
    } else {
      await supabase.from("user_video_library").insert({
        user_id: user.id,
        asset_type: "stock_video",
        source: v.provider,
        external_id: v.external_id,
        title: v.title,
        thumbnail_url: v.thumbnail,
        preview_url: v.preview_url,
        download_url: v.download_url,
        width: v.width,
        height: v.height,
        duration_sec: v.duration,
        fps: v.fps,
        tags: v.tags,
        metadata: {
          orientation: v.orientation,
          photographer: v.photographer,
          source_url: v.source_url,
        },
      });
      setFavorites((prev) => [v, ...prev]);
      toast({ title: "Zu Favoriten hinzugefügt", description: v.title });
    }
  }

  function handoff(v: StockVideo, target: "composer" | "directors-cut") {
    const payload = {
      title: v.title,
      url: v.download_url,
      thumbnail: v.thumbnail,
      duration: v.duration,
      width: v.width,
      height: v.height,
      orientation: v.orientation,
      provider: v.provider,
      external_id: v.external_id,
      source_url: v.source_url,
      photographer: v.photographer,
      tags: v.tags,
      asset_type: "stock_video",
    };
    const key = target === "composer" ? "composer:incoming-stock-video" : "directors-cut:incoming-stock-video";
    sessionStorage.setItem(key, JSON.stringify(payload));
    toast({
      title: target === "composer" ? "Im Composer geladen" : "In Director's Cut geladen",
      description: "Clip wird automatisch hinzugefügt.",
    });
    navigate(target === "composer" ? "/video-composer" : "/universal-directors-cut");
  }

  const renderGrid = (items: StockVideo[], emptyMsg: string) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.length === 0 ? (
        <div className="col-span-full text-center py-16 text-muted-foreground text-sm">{emptyMsg}</div>
      ) : (
        items.map((v, i) => (
          <StockVideoCard
            key={v.id}
            video={v}
            index={i}
            isFavorite={favoriteIds.has(v.id)}
            onToggleFavorite={toggleFavorite}
            onUseInComposer={(x) => handoff(x, "composer")}
            onUseInDirectorsCut={(x) => handoff(x, "directors-cut")}
          />
        ))
      )}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Premium Stock Videos — 4K · HDR · Cinematic | useadtool</title>
        <meta
          name="description"
          content="Curated 4K and HD stock video library from Pexels and Pixabay. Search, preview, favorite and use directly in Composer or Director's Cut. Royalty-free, with auto-issued license certificates."
        />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-[#050816] via-[#080a1f] to-[#050816] text-foreground">
        {/* Hero */}
        <div className="relative border-b border-yellow-500/10 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,hsl(var(--primary)/0.12),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,hsl(var(--primary)/0.08),transparent_60%)]" />
          <div className="relative max-w-7xl mx-auto px-6 py-10 flex flex-col gap-6">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-yellow-400/30 to-yellow-600/10 border border-yellow-500/30 flex items-center justify-center backdrop-blur-sm">
                  <Film className="h-5 w-5 text-yellow-400" />
                </div>
                <span className="text-[10px] uppercase tracking-widest border border-yellow-500/40 text-yellow-300 px-2 py-0.5 rounded">
                  Premium Stock Tier
                </span>
              </div>
              <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-foreground via-yellow-300 to-foreground/80 bg-clip-text text-transparent">
                Stock Videos
              </h1>
              <p className="text-muted-foreground mt-2 max-w-2xl">
                Kuratierte 4K- und HD-Clips aus Pexels und Pixabay — mit Hover-Preview, automatischen Lizenz-Zertifikaten
                und direkter Übergabe an Composer oder Director's Cut.
              </p>
            </motion.div>

            <form onSubmit={handleSubmit} className="flex gap-2 max-w-2xl">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="z.B. drone sunset, neon city, slow-motion water, product hero..."
                  className="pl-10 bg-black/40 border-yellow-500/20 h-11"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="bg-yellow-500/90 text-black hover:bg-yellow-500 h-11 px-5"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span className="ml-2">Suchen</span>
              </Button>
            </form>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          <EditorialCollections activeId={activeCollection} onSelect={handleCollectionSelect} />
          <FiltersBar filters={filters} onChange={handleFiltersChange} />

          <Tabs defaultValue="results">
            <TabsList className="bg-black/40 border border-yellow-500/15">
              <TabsTrigger value="results">Ergebnisse ({results.length})</TabsTrigger>
              <TabsTrigger value="favorites">Favoriten ({favorites.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="results" className="mt-4">
              {loading && results.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-7 w-7 animate-spin text-yellow-400" />
                </div>
              ) : (
                renderGrid(results, "Keine Treffer — versuche eine andere Suche oder Collection.")
              )}
            </TabsContent>

            <TabsContent value="favorites" className="mt-4">
              {favoritesLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-7 w-7 animate-spin text-yellow-400" />
                </div>
              ) : (
                renderGrid(
                  favorites,
                  user
                    ? "Noch keine Favoriten — klicke das Herz auf einem Clip."
                    : "Bitte einloggen, um Favoriten zu speichern.",
                )
              )}
            </TabsContent>
          </Tabs>

          <p className="text-[10px] text-muted-foreground/70 mt-8 text-center max-w-2xl mx-auto">
            Clips stammen von Pexels (Pexels License) und Pixabay (Pixabay Content License). Beim Verwenden eines Clips
            kannst du jederzeit ein PDF-Lizenz-Zertifikat erzeugen, das die Original-Lizenz des jeweiligen Anbieters
            referenziert.
          </p>
        </div>
      </div>
    </>
  );
}
