import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Scissors, Upload, Share2, Film, Clock, Eye } from "lucide-react";

const mockClips = [
  { id: "1", title: "Insane 1v5 Clutch", duration: "0:32", views: 1240, status: "ready" },
  { id: "2", title: "Funny Fail Compilation", duration: "1:15", views: 890, status: "ready" },
  { id: "3", title: "Best Play of the Day", duration: "0:45", views: 2100, status: "exported" },
];

export function ClipCreator() {
  return (
    <div className="space-y-6 mt-4">
      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button className="gap-2 bg-purple-600 hover:bg-purple-700">
          <Scissors className="h-4 w-4" />
          Neuen Clip erstellen
        </Button>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Clip importieren
        </Button>
      </div>

      {/* Clips Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockClips.map((clip) => (
          <Card key={clip.id} className="group cursor-pointer hover:border-purple-500/50 transition-colors">
            <div className="aspect-video bg-gradient-to-br from-purple-900/40 to-violet-800/40 rounded-t-2xl flex items-center justify-center relative">
              <Film className="h-12 w-12 text-purple-400/50" />
              <Badge className="absolute top-2 right-2 bg-black/60 text-white text-xs">
                {clip.duration}
              </Badge>
            </div>
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-2">{clip.title}</h3>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" /> {clip.views}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {clip.duration}
                  </span>
                </div>
                <Button variant="ghost" size="sm" className="gap-1 text-xs h-7">
                  <Share2 className="h-3 w-3" />
                  Export
                </Button>
              </div>
              {clip.status === "exported" && (
                <Badge variant="secondary" className="mt-2 text-xs">
                  ✅ Exportiert
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

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
