import { useNewsHub, type NewsArticle } from "@/hooks/useNewsHub";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Newspaper, RefreshCw, ExternalLink, Clock, 
  Smartphone, Bot, BarChart3, DollarSign, Users, TrendingUp, Target,
  ChevronDown, Search, X, Play
} from "lucide-react";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

const CATEGORIES = [
  { key: null, label: "Alle", icon: Newspaper },
  { key: "platform", label: "Plattformen", icon: Smartphone },
  { key: "ai_tools", label: "KI-Tools", icon: Bot },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "monetization", label: "Monetarisierung", icon: DollarSign },
  { key: "community", label: "Community", icon: Users },
  { key: "business_finance", label: "Business & Finanzen", icon: TrendingUp },
  { key: "strategy", label: "Strategie", icon: Target },
];

const CATEGORY_COLORS: Record<string, string> = {
  platform: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  ai_tools: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  analytics: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  monetization: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  community: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  business_finance: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  strategy: "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  const diffD = Math.floor(diffH / 24);
  return `vor ${diffD} Tag${diffD > 1 ? "en" : ""}`;
}

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    let videoId: string | null = null;
    if (u.hostname.includes("youtube.com")) {
      videoId = u.searchParams.get("v");
    } else if (u.hostname === "youtu.be") {
      videoId = u.pathname.slice(1);
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  } catch {
    return null;
  }
}

function ArticleCard({ article, index, highlighted, onPlayVideo }: { 
  article: NewsArticle; 
  index: number; 
  highlighted?: boolean;
  onPlayVideo: (article: NewsArticle) => void;
}) {
  const colorClass = CATEGORY_COLORS[article.category] || "bg-muted text-muted-foreground";
  const catLabel = CATEGORIES.find((c) => c.key === article.category)?.label || article.category;
  const [imgError, setImgError] = useState(false);
  const hasImage = article.image_url && !imgError;
  const hasVideo = !!article.video_url;

  return (
    <motion.div
      id={`article-${article.id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Card className={`overflow-hidden bg-card/60 backdrop-blur-sm border-border/50 hover:border-primary/30 transition-all group ${
        highlighted ? "ring-2 ring-primary/60 border-primary/40 shadow-[0_0_20px_hsl(var(--primary)/0.2)] animate-pulse" : ""
      }`}>
        {/* Image / Video thumbnail */}
        {hasImage && (
          <div className="relative aspect-video overflow-hidden bg-muted">
            <img
              src={article.image_url!}
              alt={article.headline}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={() => setImgError(true)}
              loading="lazy"
            />
            {hasVideo && (
              <button
                onClick={() => onPlayVideo(article)}
                className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
                  <Play className="w-6 h-6 text-primary-foreground ml-0.5" />
                </div>
              </button>
            )}
          </div>
        )}

        {/* If no image but has video, show video play button */}
        {!hasImage && hasVideo && (
          <button
            onClick={() => onPlayVideo(article)}
            className="w-full aspect-video bg-muted/50 flex items-center justify-center group/play hover:bg-muted transition-colors"
          >
            <div className="w-14 h-14 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center group-hover/play:bg-primary/30 transition-colors">
              <Play className="w-6 h-6 text-primary ml-0.5" />
            </div>
          </button>
        )}

        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <Badge className={`text-[10px] font-medium border ${colorClass}`}>
              {catLabel}
            </Badge>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3" />
              {timeAgo(article.published_at)}
            </span>
          </div>

          <h3 className="font-semibold text-sm leading-snug mb-2 text-foreground group-hover:text-primary transition-colors">
            {article.headline}
          </h3>

          {article.summary && (
            <p className="text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-3">
              {article.summary}
            </p>
          )}

          <div className="flex items-center justify-between">
            {article.source && (
              <span className="text-[10px] text-muted-foreground font-medium">
                📰 {article.source}
              </span>
            )}
            <div className="flex items-center gap-3">
              {hasVideo && (
                <button
                  onClick={() => onPlayVideo(article)}
                  className="text-[10px] text-primary hover:underline flex items-center gap-1"
                >
                  <Play className="w-3 h-3" /> Video
                </button>
              )}
              {article.source_url && (
                <a
                  href={article.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-primary hover:underline flex items-center gap-1"
                >
                  Quelle <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default function NewsHub() {
  const { articles, loading, refreshing, category, setCategory, loadMore, hasMore, refreshNews, searchQuery, setSearchQuery } = useNewsHub();
  const [searchParams, setSearchParams] = useSearchParams();
  const targetHeadline = searchParams.get("headline");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const scrolledRef = useRef(false);
  const [videoArticle, setVideoArticle] = useState<NewsArticle | null>(null);

  // Find and scroll to the target article
  useEffect(() => {
    if (!targetHeadline || articles.length === 0 || scrolledRef.current) return;

    const match = articles.find((a) =>
      a.headline.toLowerCase().includes(targetHeadline.toLowerCase()) ||
      targetHeadline.toLowerCase().includes(a.headline.toLowerCase())
    );

    if (match) {
      scrolledRef.current = true;
      setHighlightedId(match.id);

      setTimeout(() => {
        const el = document.getElementById(`article-${match.id}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);

      setTimeout(() => setHighlightedId(null), 3500);

      searchParams.delete("headline");
      setSearchParams(searchParams, { replace: true });
    }
  }, [targetHeadline, articles]);

  const handlePlayVideo = (article: NewsArticle) => {
    setVideoArticle(article);
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Hero Header */}
      <div className="relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-cyan-500/5" />
        <div className="relative max-w-6xl mx-auto px-4 py-10 sm:py-14">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 mb-3"
          >
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
              <Newspaper className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                News Hub
              </h1>
              <p className="text-sm text-muted-foreground">
                Tagesaktuelle Nachrichten für Social Media Professionals
              </p>
            </div>
          </motion.div>

          {/* Search + Refresh */}
          <div className="flex items-center gap-3 mt-5">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="News durchsuchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9 bg-card/60 border-border/50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshNews}
              disabled={refreshing}
              className="gap-2 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Lädt..." : "Aktualisieren"}
            </Button>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="max-w-6xl mx-auto px-4 py-4 border-b border-border/30">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = category === cat.key;
            return (
              <button
                key={cat.key ?? "all"}
                onClick={() => setCategory(cat.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                  isActive
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Articles Grid */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {loading && articles.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-video w-full" />
                <div className="p-5">
                  <Skeleton className="h-4 w-20 mb-3" />
                  <Skeleton className="h-5 w-full mb-2" />
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </Card>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-16">
            <Newspaper className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              {searchQuery ? "Keine News für diese Suche gefunden." : "Noch keine News vorhanden."}
            </p>
            {!searchQuery && (
              <Button onClick={refreshNews} disabled={refreshing} className="gap-2">
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                Jetzt News laden
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {articles.map((article, i) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  index={i}
                  highlighted={highlightedId === article.id}
                  onPlayVideo={handlePlayVideo}
                />
              ))}
            </div>

            {hasMore && (
              <div className="text-center mt-6">
                <Button variant="outline" onClick={loadMore} className="gap-2">
                  <ChevronDown className="w-4 h-4" />
                  Mehr laden
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Video Dialog */}
      <Dialog open={!!videoArticle} onOpenChange={(open) => !open && setVideoArticle(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-sm font-semibold line-clamp-2">
              {videoArticle?.headline}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {videoArticle?.video_url && (() => {
              const embedUrl = getYouTubeEmbedUrl(videoArticle.video_url);
              if (embedUrl) {
                return (
                  <div className="aspect-video rounded-lg overflow-hidden bg-black">
                    <iframe
                      src={embedUrl}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title={videoArticle.headline}
                    />
                  </div>
                );
              }
              return (
                <div className="text-center py-8">
                  <a
                    href={videoArticle.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:underline"
                  >
                    <Play className="w-5 h-5" />
                    Video extern öffnen
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
