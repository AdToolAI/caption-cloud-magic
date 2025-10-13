import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sparkles, Copy, Download, Calendar, Send, Image as ImageIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PreviewTabsProps {
  draft: any | null;
  imagePreview: string;
  onCopyCaption: () => void;
  onExportZip: () => void;
  onSendToCalendar: () => void;
  onSendToReview: () => void;
}

export function PreviewTabs({
  draft,
  imagePreview,
  onCopyCaption,
  onExportZip,
  onSendToCalendar,
  onSendToReview,
}: PreviewTabsProps) {
  if (!draft) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="text-center text-muted-foreground p-12">
          <Sparkles className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p>Lade ein Bild hoch und generiere deinen Post, um die Vorschau zu sehen</p>
        </CardContent>
      </Card>
    );
  }

  const { hooks, caption, caption_b, hashtags, alt_text, scores, compliance, platforms } = draft;
  const warnings = compliance?.warnings || [];

  return (
    <Card className="h-full">
      <CardContent className="p-6">
        <Tabs defaultValue="variants" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="variants">Varianten</TabsTrigger>
            <TabsTrigger value="platform">Plattform</TabsTrigger>
            <TabsTrigger value="image">Bild & Crops</TabsTrigger>
            <TabsTrigger value="scores">Scores</TabsTrigger>
          </TabsList>

          {/* Tab 1: Varianten */}
          <TabsContent value="variants" className="space-y-6 mt-6">
            {/* Hooks */}
            <div>
              <Label className="text-sm font-semibold">Hook-Varianten</Label>
              <div className="space-y-2 mt-2">
                {["A", "B", "C"].map((variant) => (
                  <div key={variant} className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">Hook {variant}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {hooks?.[variant]?.length || 0} Zeichen
                      </span>
                    </div>
                    <p className="text-sm">{hooks?.[variant] || "-"}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Hauptcaption */}
            <div>
              <Label className="text-sm font-semibold">Hauptcaption</Label>
              <div className="p-4 bg-muted rounded-lg mt-2">
                <p className="whitespace-pre-wrap text-sm">{caption}</p>
              </div>
            </div>

            {/* A/B Variante */}
            {caption_b && (
              <div>
                <Label className="text-sm font-semibold">Caption B (A/B-Test)</Label>
                <div className="p-4 bg-muted rounded-lg mt-2">
                  <p className="whitespace-pre-wrap text-sm">{caption_b}</p>
                </div>
              </div>
            )}

            {/* Hashtag-Sets */}
            <div>
              <Label className="text-sm font-semibold">Hashtag-Sets</Label>
              <div className="space-y-2 mt-2">
                {["reach", "niche", "brand"].map((setName) => (
                  <div key={setName} className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="capitalize">
                        {setName}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {hashtags?.[setName]?.length || 0} Tags
                      </span>
                    </div>
                    <p className="text-sm text-primary">
                      {hashtags?.[setName]?.join(" ") || "-"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Alt-Text */}
            {alt_text && (
              <div>
                <Label className="text-sm font-semibold">Alt-Text (Barrierefreiheit)</Label>
                <div className="p-3 bg-muted rounded-lg mt-2">
                  <p className="text-sm">{alt_text}</p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Tab 2: Plattform-Vorschau */}
          <TabsContent value="platform" className="space-y-4 mt-6">
            <Label className="text-sm font-semibold">Plattform-Limits</Label>
            {platforms?.map((platform: string) => {
              const totalHashtags = hashtags?.reach?.length || 0;
              const captionLength = caption?.length || 0;
              const isIG = platform === "instagram";
              const isFB = platform === "facebook";
              const isLI = platform === "linkedin";

              let limit = 2200;
              let hashtagLimit = 30;
              let hashtagWarning = "";

              if (isIG) {
                limit = 2200;
                hashtagLimit = 30;
                if (totalHashtags > 30) hashtagWarning = "IG: max 30 Hashtags – bitte reduzieren.";
              } else if (isFB) {
                limit = 5000;
                hashtagLimit = 10;
                if (totalHashtags > 10) hashtagWarning = "FB: max 10 Hashtags empfohlen.";
              } else if (isLI) {
                limit = 3000;
                hashtagLimit = 5;
                if (totalHashtags > 5) hashtagWarning = "LI: 3-5 Hashtags empfohlen.";
              }

              const remaining = limit - captionLength;
              const isOverLimit = remaining < 0;

              return (
                <div key={platform} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold capitalize">{platform}</span>
                    <Badge variant={isOverLimit ? "destructive" : "secondary"}>
                      {remaining} Zeichen übrig
                    </Badge>
                  </div>
                  <Progress value={(captionLength / limit) * 100} className="h-2 mb-2" />
                  {hashtagWarning && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertDescription className="text-xs">{hashtagWarning}</AlertDescription>
                    </Alert>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Caption: {captionLength}/{limit} | Hashtags: {totalHashtags}/{hashtagLimit}
                  </p>
                </div>
              );
            })}

            {/* Compliance-Warnungen */}
            {warnings.length > 0 && (
              <div>
                <Label className="text-sm font-semibold">Compliance-Hinweise</Label>
                <div className="space-y-2 mt-2">
                  {warnings.map((warning: string, idx: number) => (
                    <Alert key={idx} variant="destructive">
                      <AlertDescription className="text-sm">{warning}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Tab 3: Bild & Crops */}
          <TabsContent value="image" className="space-y-4 mt-6">
            {imagePreview ? (
              <>
                <div>
                  <Label className="text-sm font-semibold">Original-Bild</Label>
                  <img src={imagePreview} alt="Original" className="w-full rounded-lg mt-2" />
                </div>
                <div>
                  <Label className="text-sm font-semibold">Auto-Crops (Coming Soon)</Label>
                  <div className="grid grid-cols-3 gap-4 mt-2">
                    {["1:1 (Square)", "4:5 (Portrait)", "9:16 (Story)"].map((format) => (
                      <div key={format} className="p-4 border rounded-lg text-center">
                        <ImageIcon className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">{format}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground p-8">
                <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Kein Bild hochgeladen</p>
              </div>
            )}
          </TabsContent>

          {/* Tab 4: Scores */}
          <TabsContent value="scores" className="space-y-6 mt-6">
            <div>
              <Label className="text-sm font-semibold">Hook-Score</Label>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex-1">
                  <Progress value={scores?.hook || 0} className="h-3" />
                </div>
                <Badge variant="secondary" className="text-lg font-bold">
                  {scores?.hook || 0}/100
                </Badge>
              </div>
              {scores?.hookTip && (
                <p className="text-sm text-muted-foreground mt-2">💡 {scores.hookTip}</p>
              )}
            </div>

            <div>
              <Label className="text-sm font-semibold">CTA-Score</Label>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex-1">
                  <Progress value={scores?.cta || 0} className="h-3" />
                </div>
                <Badge variant="secondary" className="text-lg font-bold">
                  {scores?.cta || 0}/100
                </Badge>
              </div>
              {scores?.ctaTip && (
                <p className="text-sm text-muted-foreground mt-2">💡 {scores.ctaTip}</p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Aktionen (Top-Right) */}
        <div className="flex gap-2 flex-wrap mt-6 pt-6 border-t">
          <Button onClick={onCopyCaption} variant="outline" size="sm">
            <Copy className="h-4 w-4 mr-2" />
            Caption kopieren
          </Button>
          <Button onClick={onExportZip} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export ZIP
          </Button>
          <Button onClick={onSendToCalendar} variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-2" />
            Zum Kalender
          </Button>
          <Button onClick={onSendToReview} variant="outline" size="sm">
            <Send className="h-4 w-4 mr-2" />
            Zur Freigabe
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
