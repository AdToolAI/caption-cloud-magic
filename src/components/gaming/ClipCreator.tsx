import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Scissors, Share2, Film, Clock, Eye, Loader2, ExternalLink } from "lucide-react";
import { useTwitch } from "@/hooks/useTwitch";

export function ClipCreator() {
  const { clips, twitchUser, isConnected, loading } = useTwitch();

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

  return (
    <div className="space-y-6 mt-4">
      {/* Clips Grid */}
      {clips.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Scissors className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-semibold">Noch keine Clips</p>
            <p className="text-sm">Clips erscheinen hier, sobald welche auf deinem Kanal erstellt werden.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clips.map((clip) => (
            <Card key={clip.id} className="group cursor-pointer hover:border-purple-500/50 transition-colors overflow-hidden">
              <div className="aspect-video relative">
                <img
                  src={clip.thumbnail_url}
                  alt={clip.title}
                  className="w-full h-full object-cover"
                />
                <Badge className="absolute top-2 right-2 bg-black/60 text-white text-xs">
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs h-7"
                    onClick={() => window.open(clip.url, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Öffnen
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  von {clip.creator_name} · {new Date(clip.created_at).toLocaleDateString('de-DE')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Export Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Share2 className="h-5 w-5 text-purple-400" />
            Stream-to-Short Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 overflow-x-auto pb-2">
            {["Stream aufnehmen", "Highlights erkennen", "Clips schneiden", "Als Short exportieren"].map((step, i) => (
              <div key={i} className="flex items-center gap-2 shrink-0">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-purple-500/20 text-purple-400 text-sm font-bold">
                  {i + 1}
                </div>
                <span className="text-sm whitespace-nowrap">{step}</span>
                {i < 3 && <span className="text-muted-foreground">→</span>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
