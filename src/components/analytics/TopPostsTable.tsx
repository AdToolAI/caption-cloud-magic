import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Download, TrendingUp, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface TopPost {
  provider: string;
  external_id: string;
  caption_text: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagement_rate: number;
  permalink: string;
  posted_at: string;
}

interface TopPostsTableProps {
  data: TopPost[];
  loading: boolean;
}

const AnimatedCounter = ({ value }: { value: number }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 800;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{count.toLocaleString("de-DE")}</span>;
};

const getPlatformStyles = (provider: string) => {
  const styles: Record<string, string> = {
    instagram: "bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-400 border-pink-500/30",
    facebook: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    tiktok: "bg-gradient-to-r from-cyan-500/20 to-pink-500/20 text-cyan-400 border-cyan-500/30",
    x: "bg-muted/30 text-foreground border-white/20",
    linkedin: "bg-blue-600/20 text-blue-400 border-blue-600/30",
    youtube: "bg-red-500/20 text-red-400 border-red-500/30"
  };
  return styles[provider.toLowerCase()] || "bg-muted/20 text-muted-foreground border-white/20";
};

export const TopPostsTable = ({ data, loading }: TopPostsTableProps) => {
  const [selectedPost, setSelectedPost] = useState<TopPost | null>(null);

  const exportToCSV = () => {
    if (!data || data.length === 0) {
      toast.error("Keine Daten zum Exportieren");
      return;
    }

    const headers = ["Platform", "Caption", "Likes", "Comments", "Shares", "Views", "Engagement Rate", "Permalink"];
    const rows = data.map(post => [
      post.provider,
      `"${(post.caption_text || "").replace(/"/g, '""')}"`,
      post.likes,
      post.comments,
      post.shares,
      post.views,
      `${post.engagement_rate.toFixed(2)}%`,
      post.permalink
    ]);

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `top-posts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV erfolgreich exportiert");
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-6 rounded-2xl backdrop-blur-xl bg-card/60 border border-white/10"
      >
        <div className="h-6 bg-muted/30 rounded w-1/3 mb-2 animate-pulse"></div>
        <div className="h-4 bg-muted/30 rounded w-1/2 mb-6 animate-pulse"></div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-muted/20 rounded-xl animate-pulse" />
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 rounded-2xl backdrop-blur-xl bg-card/60 border border-white/10
                   shadow-[0_0_30px_hsla(43,90%,68%,0.08)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="w-12 h-12 rounded-xl flex items-center justify-center
                          bg-gradient-to-br from-primary/20 to-cyan-500/20
                          shadow-[0_0_20px_hsla(43,90%,68%,0.2)]"
            >
              <Trophy className="h-6 w-6 text-primary" />
            </motion.div>
            <div>
              <h3 className="text-xl font-bold text-foreground">Top Performing Posts</h3>
              <p className="text-sm text-muted-foreground">Deine besten Posts nach Engagement-Rate</p>
            </div>
          </div>
          <Button 
            onClick={exportToCSV} 
            variant="outline"
            className="bg-muted/20 border-white/10 hover:bg-primary/20 hover:border-primary/40
                       hover:shadow-[0_0_15px_hsla(43,90%,68%,0.2)] transition-all duration-300"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-muted-foreground">Platform</TableHead>
                <TableHead className="text-muted-foreground">Caption</TableHead>
                <TableHead className="text-right text-muted-foreground">Likes</TableHead>
                <TableHead className="text-right text-muted-foreground">Comments</TableHead>
                <TableHead className="text-right text-muted-foreground">Shares</TableHead>
                <TableHead className="text-right text-muted-foreground">Views</TableHead>
                <TableHead className="text-right text-muted-foreground">ER %</TableHead>
                <TableHead className="text-right text-muted-foreground">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center gap-4"
                    >
                      <motion.div
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="w-16 h-16 rounded-2xl flex items-center justify-center
                                    bg-gradient-to-br from-primary/20 to-cyan-500/20
                                    shadow-[0_0_25px_hsla(43,90%,68%,0.15)]"
                      >
                        <TrendingUp className="h-8 w-8 text-primary/60" />
                      </motion.div>
                      <p className="text-muted-foreground">
                        Noch keine Posts. Verbinde deine Social Accounts und veröffentliche Content!
                      </p>
                    </motion.div>
                  </TableCell>
                </TableRow>
              ) : (
                data.map((post, index) => {
                  const isTrending = post.engagement_rate > 5;
                  const truncatedCaption = post.caption_text?.length > 50 
                    ? post.caption_text.substring(0, 50) + "..." 
                    : post.caption_text || "Keine Caption";

                  return (
                    <motion.tr
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-white/5 hover:bg-primary/5 transition-colors group"
                    >
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={`capitalize ${getPlatformStyles(post.provider)}`}
                        >
                          {post.provider}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground/80">{truncatedCaption}</span>
                          {isTrending && (
                            <motion.div
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            >
                              <Badge className="bg-gradient-to-r from-orange-500/20 to-red-500/20 
                                                text-orange-400 border border-orange-500/30
                                                shadow-[0_0_10px_hsla(30,100%,50%,0.2)]">
                                🔥 Trending
                              </Badge>
                            </motion.div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium text-foreground">
                        {post.likes.toLocaleString("de-DE")}
                      </TableCell>
                      <TableCell className="text-right font-medium text-foreground">
                        {post.comments.toLocaleString("de-DE")}
                      </TableCell>
                      <TableCell className="text-right font-medium text-foreground">
                        {post.shares.toLocaleString("de-DE")}
                      </TableCell>
                      <TableCell className="text-right font-medium text-foreground">
                        {post.views.toLocaleString("de-DE")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge 
                          className={isTrending 
                            ? "bg-primary/20 text-primary border border-primary/30 shadow-[0_0_10px_hsla(43,90%,68%,0.2)]"
                            : "bg-muted/30 text-muted-foreground border-white/10"
                          }
                        >
                          {post.engagement_rate.toFixed(2)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedPost(post)}
                            className="hover:bg-primary/20 hover:text-primary"
                          >
                            <TrendingUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="hover:bg-cyan-500/20 hover:text-cyan-400"
                          >
                            <a href={post.permalink} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </motion.div>

      {/* Details Dialog */}
      <Dialog open={!!selectedPost} onOpenChange={() => setSelectedPost(null)}>
        <DialogContent className="max-w-2xl backdrop-blur-xl bg-card/95 border border-white/10
                                   shadow-[0_0_50px_hsla(43,90%,68%,0.1)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center
                              bg-gradient-to-br from-primary/20 to-cyan-500/20
                              shadow-[0_0_15px_hsla(43,90%,68%,0.2)]">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              Post Details
            </DialogTitle>
          </DialogHeader>
          {selectedPost && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-muted/20 border border-white/10">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Platform</h4>
                <Badge 
                  variant="outline" 
                  className={`capitalize ${getPlatformStyles(selectedPost.provider)}`}
                >
                  {selectedPost.provider}
                </Badge>
              </div>
              
              <div className="p-4 rounded-xl bg-muted/20 border border-white/10">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Caption</h4>
                <p className="text-sm text-foreground/80">{selectedPost.caption_text || "Keine Caption"}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-muted/20 border border-white/10">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">Engagement Metrics</h4>
                  <div className="space-y-3">
                    {[
                      { label: "Likes", value: selectedPost.likes },
                      { label: "Comments", value: selectedPost.comments },
                      { label: "Shares", value: selectedPost.shares },
                      { label: "Views", value: selectedPost.views }
                    ].map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center">
                        <span className="text-muted-foreground text-sm">{item.label}:</span>
                        <span className="font-semibold text-foreground">
                          <AnimatedCounter value={item.value} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="p-4 rounded-xl bg-muted/20 border border-white/10">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">Performance</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-sm">Engagement Rate:</span>
                      <Badge className="bg-primary/20 text-primary border border-primary/30">
                        {selectedPost.engagement_rate.toFixed(2)}%
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-sm">Posted:</span>
                      <span className="font-medium text-foreground">
                        {new Date(selectedPost.posted_at).toLocaleDateString("de-DE")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <Button 
                asChild 
                className="w-full bg-gradient-to-r from-primary to-primary/80
                           hover:shadow-[0_0_30px_hsla(43,90%,68%,0.3)] transition-all"
              >
                <a href={selectedPost.permalink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Original Post ansehen
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
