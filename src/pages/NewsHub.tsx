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
  ChevronDown, Search, X, Play, ArrowUpRight, Video
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
    if (u.hostname.includes("youtube.com") && u.pathname === "/watch") {
      videoId = u.searchParams.get("v");
    } else if (u.hostname === "youtu.be") {
      videoId = u.pathname.slice(1);
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  } catch {
    return null;
  }
}

/* ─── Hero Featured Card ─── */
function FeaturedArticle({ article, onPlayVideo }: { article: NewsArticle; onPlayVideo: (a: NewsArticle) => void }) {
  const [imgError, setImgError] = useState(false);
  const hasImage = article.image_url && !imgError;
  const colorClass = CATEGORY_COLORS[article.category] || "bg-muted text-muted-foreground";
  const catLabel = CATEGORIES.find((c) => c.key === article.category)?.label || article.category;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative rounded-2xl overflow-hidden group cursor-pointer mb-8"
      style={{ minHeight: 360 }}
    >
      {/* Background image */}
      {hasImage ? (
        <img
          src={article.image_url!}
          alt={article.headline}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-cyan-900/20" />
      )}

      {/* Cinematic gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
      
      {/* Scanline effect */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)"
      }} />

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-end h-full p-6 sm:p-8" style={{ minHeight: 360 }}>
        <div className="flex items-center gap-3 mb-3">
          <Badge className={`text-[10px] font-semibold border ${colorClass}`}>
            {catLabel}
          </Badge>
          <span className="text-[10px] text-white/60 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {timeAgo(article.published_at)}
          </span>
          {article.video_url && (
            <button
              onClick={(e) => { e.stopPropagation(); onPlayVideo(article); }}
              className="flex items-center gap-1 text-[10px] text-primary bg-primary/20 border border-primary/30 px-2 py-0.5 rounded-full hover:bg-primary/30 transition-colors"
            >
              <Video className="w-3 h-3" /> Video
            </button>
          )}
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight mb-2 max-w-2xl">
          {article.headline}
        </h2>

        {article.summary && (
          <p className="text-sm text-white/70 leading-relaxed mb-4 max-w-2xl line-clamp-2">
            {article.summary}
          </p>
        )}

        <div className="flex items-center gap-4">
          {article.source && (
            <span className="text-xs text-white/50 font-medium">
              📰 {article.source}
            </span>
          )}
          {article.source_url && (
            <a
              href={article.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Artikel lesen <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Glow border */}
      <div className="absolute inset-0 rounded-2xl border border-white/10 group-hover:border-primary/30 transition-colors pointer-events-none" />
    </motion.div>
  );
}

/* ─── Standard Card ─── */
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
      transition={{ duration: 0.3, delay: index * 0.04 }}
    >
      <Card className={`overflow-hidden bg-card/40 backdrop-blur-sm border-border/40 hover:border-primary/30 transition-all duration-300 group h-full ${
        highlighted ? "ring-2 ring-primary/60 border-primary/40 shadow-[0_0_24px_hsl(var(--primary)/0.25)]" : "hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
      }`}>
        {/* Image with gradient overlay */}
        {hasImage && (
          <div className="relative aspect-[16/9] overflow-hidden bg-muted">
            <img
              src={article.image_url!}
              alt={article.headline}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              onError={() => setImgError(true)}
              loading="lazy"
            />
            {/* Bottom gradient for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            
            {/* Video badge */}
            {hasVideo && (
              <button
                onClick={() => onPlayVideo(article)}
                className="absolute top-3 right-3 flex items-center gap-1.5 text-[10px] font-semibold text-white bg-black/60 backdrop-blur-sm border border-white/20 px-2.5 py-1 rounded-full hover:bg-primary/80 transition-all"
              >
                <Play className="w-3 h-3" fill="currentColor" /> Video
              </button>
            )}

            {/* Category on image */}
            <div className="absolute bottom-3 left-3">
              <Badge className={`text-[9px] font-semibold border backdrop-blur-sm ${colorClass}`}>
                {catLabel}
              </Badge>
            </div>
          </div>
        )}

        {/* No image header */}
        {!hasImage && (
          <div className="px-5 pt-5 flex items-center gap-2">
            <Badge className={`text-[9px] font-semibold border ${colorClass}`}>
              {catLabel}
            </Badge>
            {hasVideo && (
              <button
                onClick={() => onPlayVideo(article)}
                className="flex items-center gap-1 text-[9px] font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full hover:bg-primary/20 transition-colors"
              >
                <Play className="w-2.5 h-2.5" fill="currentColor" /> Video
              </button>
            )}
          </div>
        )}

        <div className="p-5">
          {hasImage && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeAgo(article.published_at)}
              </span>
            </div>
          )}

          {!hasImage && (
            <div className="flex items-center justify-between mt-2 mb-2">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeAgo(article.published_at)}
              </span>
            </div>
          )}

          <h3 className="font-semibold text-sm leading-snug mb-2 text-foreground group-hover:text-primary transition-colors line-clamp-2">
            {article.headline}
          </h3>

          {article.summary && (
            <p className="text-xs text-muted-foreground/80 leading-relaxed mb-4 line-clamp-3">
              {article.summary}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-border/30">
            {article.source && (
              <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[120px]">
                📰 {article.source}
              </span>
            )}
            <div className="flex items-center gap-2 ml-auto">
              {article.source_url && (
                <a
                  href={article.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  Lesen <ArrowUpRight className="w-3 h-3" />
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

  // Find and scroll to target article
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
        document.getElementById(`article-${match.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      setTimeout(() => setHighlightedId(null), 3500);
      searchParams.delete("headline");
      setSearchParams(searchParams, { replace: true });
    }
  }, [targetHeadline, articles]);

  const handlePlayVideo = (article: NewsArticle) => setVideoArticle(article);

  const featuredArticle = articles.length > 0 ? articles[0] : null;
  const gridArticles = articles.length > 1 ? articles.slice(1) : [];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Hero Header */}
      <div className="relative overflow-hidden border-b border-border/30">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-cyan-500/5" />
        {/* Subtle scanlines */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)"
        }} />

        <div className="relative max-w-6xl mx-auto px-4 py-8 sm:py-12">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 shadow-[0_0_15px_hsl(var(--primary)/0.15)]">
                <Newspaper className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                  News Hub
                </h1>
                <p className="text-sm text-muted-foreground">
                  Tagesaktuelle Nachrichten für Social Media Professionals
                </p>
              </div>
            </div>

            {/* Search + Refresh */}
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                <Input
                  placeholder="News durchsuchen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 bg-card/40 backdrop-blur-sm border-border/40 focus:border-primary/50"
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
                className="gap-2 shrink-0 bg-card/40 backdrop-blur-sm border-border/40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">{refreshing ? "Lädt..." : "Aktualisieren"}</span>
              </Button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="max-w-6xl mx-auto px-4 py-3 border-b border-border/20">
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
                    ? "bg-primary/15 text-primary border-primary/30 shadow-[0_0_10px_hsl(var(--primary)/0.1)]"
                    : "bg-card/30 text-muted-foreground border-transparent hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {loading && articles.length === 0 ? (
          <div className="space-y-6">
            {/* Featured skeleton */}
            <Skeleton className="h-[360px] w-full rounded-2xl" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-[16/9] w-full" />
                  <div className="p-5">
                    <Skeleton className="h-4 w-20 mb-3" />
                    <Skeleton className="h-5 w-full mb-2" />
                    <Skeleton className="h-4 w-full mb-1" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-20">
            <div className="p-4 rounded-2xl bg-muted/30 inline-block mb-4">
              <Newspaper className="w-12 h-12 text-muted-foreground/30" />
            </div>
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
            {/* Featured Article */}
            {featuredArticle && (
              <FeaturedArticle article={featuredArticle} onPlayVideo={handlePlayVideo} />
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {gridArticles.map((article, i) => (
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
              <div className="text-center mt-8">
                <Button variant="outline" onClick={loadMore} className="gap-2 bg-card/40 backdrop-blur-sm">
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
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-card/95 backdrop-blur-lg border-border/50">
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
              // YouTube search link — open externally
              return (
                <div className="text-center py-10">
                  <div className="p-3 rounded-full bg-primary/10 inline-block mb-4">
                    <Play className="w-8 h-8 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">Videos zu diesem Thema auf YouTube finden</p>
                  <a
                    href={videoArticle.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    Auf YouTube suchen
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
