import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bookmark, 
  BookmarkCheck,
  ExternalLink, 
  Loader2, 
  Sparkles, 
  Tag, 
  TrendingUp,
  Lightbulb,
  Hash,
  Target,
  Link2,
  Calendar
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface Trend {
  id: string;
  platform: string;
  trend_type: string;
  name: string;
  description: string;
  popularity_index: number;
  language: string;
  category: string;
  region: string;
  data_json: any;
}

interface RelatedArticle {
  title: string;
  url: string;
  description: string;
}

interface TrendDetailModalProps {
  trend: Trend | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isBookmarked: boolean;
  onToggleBookmark: (trendId: string) => void;
  bookmarkDate?: string;
}

export function TrendDetailModal({
  trend,
  open,
  onOpenChange,
  isBookmarked,
  onToggleBookmark,
  bookmarkDate,
}: TrendDetailModalProps) {
  const { toast } = useToast();
  const [articles, setArticles] = useState<RelatedArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);

  useEffect(() => {
    if (open && trend) {
      fetchRelatedArticles();
    }
  }, [open, trend?.id]);

  const fetchRelatedArticles = async () => {
    if (!trend) return;
    
    setLoadingArticles(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-trend-articles', {
        body: {
          trend_name: trend.name,
          trend_description: trend.description,
          platform: trend.platform,
          category: trend.category,
        }
      });

      if (error) throw error;
      setArticles(data.articles || []);
    } catch (error) {
      console.error('Error fetching articles:', error);
      // Don't show error toast - articles are supplementary
    } finally {
      setLoadingArticles(false);
    }
  };

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'tiktok': return 'bg-gradient-to-r from-pink-500/80 to-cyan-500/80 text-white';
      case 'instagram': return 'bg-gradient-to-r from-purple-500/80 to-pink-500/80 text-white';
      case 'linkedin': return 'bg-blue-600/80 text-white';
      case 'youtube': return 'bg-red-600/80 text-white';
      case 'pinterest': return 'bg-red-500/80 text-white';
      case 'twitter': return 'bg-sky-500/80 text-white';
      default: return 'bg-primary/80 text-primary-foreground';
    }
  };

  if (!trend) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 overflow-hidden backdrop-blur-xl bg-card/95 border-white/10">
        {/* Header with gradient */}
        <div className="relative p-6 pb-4 bg-gradient-to-b from-primary/10 to-transparent border-b border-white/5">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={getPlatformColor(trend.platform)}>
                    {trend.platform}
                  </Badge>
                  <Badge variant="outline" className="border-white/20">
                    {trend.trend_type}
                  </Badge>
                  {trend.category && (
                    <Badge variant="outline" className="border-white/20">
                      <Tag className="w-3 h-3 mr-1" />
                      {trend.category}
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-2xl font-bold pr-12">
                  {trend.name}
                </DialogTitle>
              </div>
            </div>
          </DialogHeader>

          {/* Popularity Bar */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Popularität
              </span>
              <span className="font-bold text-primary">{trend.popularity_index}/100</span>
            </div>
            <div className="w-full bg-muted/30 rounded-full h-2 overflow-hidden">
              <motion.div 
                className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${trend.popularity_index}%` }}
                transition={{ duration: 0.8 }}
              />
            </div>
          </div>
        </div>

        <ScrollArea className="max-h-[60vh]">
          <div className="p-6 space-y-6">
            {/* Description */}
            <div className="space-y-2">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Beschreibung
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {trend.description}
              </p>
            </div>

            {/* Content Ideas */}
            {trend.data_json?.content_ideas && trend.data_json.content_ideas.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-yellow-500" />
                  Content-Ideen
                </h3>
                <div className="space-y-2">
                  {trend.data_json.content_ideas.map((idea: string, idx: number) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg border border-white/5"
                    >
                      <span className="text-primary font-bold">{idx + 1}.</span>
                      <span className="text-sm">{idea}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Hashtags */}
            {trend.data_json?.hashtags && trend.data_json.hashtags.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Hash className="w-5 h-5 text-cyan-500" />
                  Empfohlene Hashtags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {trend.data_json.hashtags.map((tag: string, idx: number) => (
                    <motion.span
                      key={idx}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className="px-3 py-1 bg-cyan-500/10 text-cyan-400 rounded-full text-sm border border-cyan-500/20"
                    >
                      #{tag}
                    </motion.span>
                  ))}
                </div>
              </div>
            )}

            {/* Audience Fit */}
            {trend.data_json?.audience_fit && (
              <div className="space-y-3">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Target className="w-5 h-5 text-purple-500" />
                  Zielgruppe
                </h3>
                <p className="text-muted-foreground p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                  {trend.data_json.audience_fit}
                </p>
              </div>
            )}

            {/* Related Articles */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Link2 className="w-5 h-5 text-blue-500" />
                Verwandte Artikel
              </h3>
              
              {loadingArticles ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Suche Artikel...</span>
                </div>
              ) : articles.length > 0 ? (
                <div className="space-y-3">
                  {articles.map((article, idx) => (
                    <motion.a
                      key={idx}
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="block p-4 bg-muted/20 rounded-lg border border-white/5 hover:border-primary/50 hover:bg-muted/30 transition-all group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <h4 className="font-medium group-hover:text-primary transition-colors line-clamp-2">
                            {article.title}
                          </h4>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {article.description}
                          </p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      </div>
                    </motion.a>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  Keine verwandten Artikel gefunden
                </p>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Footer with Actions */}
        <div className="p-4 border-t border-white/5 bg-muted/20 flex items-center justify-between gap-4">
          {/* Bookmark Date if saved */}
          {isBookmarked && bookmarkDate && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              <span>Gespeichert am {format(new Date(bookmarkDate), 'dd. MMM yyyy', { locale: de })}</span>
            </div>
          )}
          
          <div className="flex items-center gap-3 ml-auto">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-white/10"
            >
              Schließen
            </Button>
            
            <Button
              onClick={() => {
                onToggleBookmark(trend.id);
                toast({
                  title: isBookmarked ? "Trend entfernt" : "Trend gespeichert",
                  description: isBookmarked 
                    ? "Der Trend wurde aus deinen Gespeicherten entfernt" 
                    : "Der Trend wurde zu deinen Gespeicherten hinzugefügt",
                });
              }}
              className={`gap-2 ${
                isBookmarked 
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                  : 'bg-gradient-to-r from-primary to-primary/80 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.3)]'
              }`}
            >
              <AnimatePresence mode="wait">
                {isBookmarked ? (
                  <motion.div
                    key="saved"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="flex items-center gap-2"
                  >
                    <BookmarkCheck className="w-4 h-4" />
                    Gespeichert
                  </motion.div>
                ) : (
                  <motion.div
                    key="save"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="flex items-center gap-2"
                  >
                    <Bookmark className="w-4 h-4" />
                    Trend speichern
                  </motion.div>
                )}
              </AnimatePresence>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
