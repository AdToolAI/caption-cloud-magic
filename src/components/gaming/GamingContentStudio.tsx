import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Image, Send, Calendar, Sparkles } from "lucide-react";

export function GamingContentStudio() {
  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Thumbnail Generator */}
        <Card className="hover:border-purple-500/30 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Image className="h-5 w-5 text-purple-400" />
              KI Thumbnail Generator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Erstelle professionelle Gaming-Thumbnails mit KI — optimiert für YouTube und Twitch.
            </p>
            <div className="aspect-video bg-gradient-to-br from-purple-900/30 to-blue-900/30 rounded-lg flex items-center justify-center border border-dashed border-purple-500/30">
              <div className="text-center">
                <Sparkles className="h-8 w-8 text-purple-400/50 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Thumbnail-Vorschau</p>
              </div>
            </div>
            <Button className="w-full gap-2">
              <Sparkles className="h-4 w-4" />
              Thumbnail generieren
            </Button>
          </CardContent>
        </Card>

        {/* Going Live Auto-Post */}
        <Card className="hover:border-green-500/30 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Send className="h-5 w-5 text-green-400" />
              "Going Live" Auto-Posts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sobald dein Stream startet, werden automatisch Ankündigungen auf allen verbundenen Kanälen gepostet.
            </p>
            <div className="space-y-3">
              {["Instagram", "TikTok", "X (Twitter)", "Discord"].map((platform) => (
                <div key={platform} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium">{platform}</span>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    Einrichten
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Stream Schedule */}
        <Card className="md:col-span-2 hover:border-blue-500/30 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-400" />
              Stream-Kalender
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Plane deine Streams und lass automatisch Ankündigungen erstellen.
            </p>
            <div className="text-center py-8 text-sm text-muted-foreground">
              Verbinde Twitch, um deinen Stream-Kalender zu synchronisieren.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
