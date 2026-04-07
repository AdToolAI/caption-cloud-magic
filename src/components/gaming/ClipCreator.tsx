import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Scissors, Eye, Clock, Loader2, ExternalLink, Film, ArrowUpDown, Plus } from "lucide-react";
import { useTwitch } from "@/hooks/useTwitch";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const cardClass = "backdrop-blur-xl bg-card/60 border border-white/10 shadow-[0_0_20px_rgba(145,70,255,0.08)]";

export function ClipCreator() {
  const { clips, twitchUser, isConnected, isLive, loading, createClip, fetchClips } = useTwitch();
  const [clipping, setClipping] = useState(false);
  const [sortBy, setSortBy] = useState<string>("date");
  const navigate = useNavigate();

  const handleCreateClip = async () => {
    setClipping(true);
    try {
      await createClip();
      toast.success("Clip wird erstellt...");
      setTimeout(() => fetchClips(), 5000);
    } catch (e: any) {
      toast.error(e.message || "Clip konnte nicht erstellt werden");
    } finally {
      setClipping(false);
    }
  };

  const handleExportToVideoStudio = (clipUrl: string, clipTitle: string) => {
    navigate(`/ai-video-studio?ref=${encodeURIComponent(clipUrl)}&title=${encodeURIComponent(clipTitle)}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Verbinde zuerst deinen Twitch-Kanal im "Stream"-Tab.
      </div>
    );
  }

  const sortedClips = [...clips].sort((a, b) => {
    if (sortBy === "views") return b.view_count - a.view_count;
    if (sortBy === "duration") return b.duration - a.duration;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 mt-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent">
            Clips ({clips.length})
          </h2>
          {isLive && (
            <Button
              size="sm"
              className="gap-2 bg-[#9146FF] hover:bg-[#7B2FFF] text-white shadow-[0_0_15px_rgba(145,70,255,0.2)]"
              onClick={handleCreateClip}
              disabled={clipping}
            >
              {clipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Clip erstellen
            </Button>
          )}
        </div>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-40 border-white/10 backdrop-blur">
            <ArrowUpDown className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="backdrop-blur-xl bg-popover/95 border-white/10">
            <SelectItem value="date">Neueste</SelectItem>
            <SelectItem value="views">Meiste Views</SelectItem>
            <SelectItem value="duration">Längste</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Clips Grid */}
      {sortedClips.length === 0 ? (
        <Card className={cardClass}>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Scissors className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-semibold">Noch keine Clips</p>
            <p className="text-sm">
              {isLive
                ? 'Erstelle jetzt einen Clip mit dem Button oben!'
                : 'Clips erscheinen hier, sobald welche auf deinem Kanal erstellt werden.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedClips.map((clip, i) => (
            <motion.div
              key={clip.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -4, scale: 1.02 }}
            >
              <Card className={`${cardClass} group overflow-hidden`}>
                <div className="aspect-video relative">
                  <img src={clip.thumbnail_url} alt={clip.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Badge className="absolute top-2 right-2 bg-black/60 text-white text-xs border-white/10">
                    {Math.floor(clip.duration)}s
                  </Badge>
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-sm mb-2 line-clamp-2">{clip.title}</h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" /> {clip.view_count.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {Math.floor(clip.duration)}s
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline" size="sm" className="gap-1 text-xs h-7 flex-1 border-white/10"
                      onClick={() => window.open(clip.url, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Öffnen
                    </Button>
                    <Button
                      variant="outline" size="sm" className="gap-1 text-xs h-7 flex-1 border-white/10"
                      onClick={() => handleExportToVideoStudio(clip.url, clip.title)}
                    >
                      <Film className="h-3 w-3" />
                      Als Short
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    von {clip.creator_name} · {new Date(clip.created_at).toLocaleDateString('de-DE')}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
