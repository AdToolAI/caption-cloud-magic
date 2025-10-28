import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sparkles, Copy, Download, Calendar, Send, Image as ImageIcon, ExternalLink } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ImageAnalysisPanel } from "./ImageAnalysisPanel";
import { FacebookPostPreview } from "./FacebookPostPreview";
import { InstagramPostPreview } from "./InstagramPostPreview";
import { LinkedInPostPreview } from "./LinkedInPostPreview";
import { XPostPreview } from "./XPostPreview";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import React from "react";
import { useAuth } from "@/hooks/useAuth";

interface PreviewTabsProps {
  draft: any | null;
  mediaPreview: string;
  mediaType: 'image' | 'video' | null;
  onCopyCaption: () => void;
  onExportZip: () => void;
  onSendToCalendar: () => void;
  onSendToReview: () => void;
}

export function PreviewTabs({
  draft,
  mediaPreview,
  mediaType,
  onCopyCaption,
  onExportZip,
  onSendToCalendar,
  onSendToReview,
}: PreviewTabsProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedLanguage, setSelectedLanguage] = React.useState<string>('de');
  const [previewPlatform, setPreviewPlatform] = React.useState<'facebook' | 'instagram' | 'linkedin' | 'x'>('facebook');

  const handleSendToComposer = () => {
    if (!draft) return;
    
    // Get localized content
    const localizedContent = getLocalizedContent();
    const hooks = localizedContent?.hooks || draft.hooks;
    const caption = localizedContent?.caption || draft.caption;
    const hashtags = localizedContent?.hashtags || draft.hashtags;
    
    // Clean Markdown formatting (** for bold) for social media platforms
    const cleanHook = (hooks?.A || '').replace(/\*\*/g, '');
    const cleanCaption = (caption || '').replace(/\*\*/g, '');
    
    // Prepare structured data for composer
    const composerData = {
      hook: cleanHook,
      caption: cleanCaption,
      hashtags: hashtags?.reach || [],
      text: `${cleanHook}\n\n${cleanCaption}\n\n${hashtags?.reach?.join(' ') || ''}`,
      mediaUrl: draft.media_url || mediaPreview,
      mediaType: draft.media_type || mediaType || 'image',
      platforms: draft.platforms || ['instagram', 'facebook'],
      timestamp: Date.now()
    };
    
    // Check auth status
    if (!user) {
      // User not logged in - persist to localStorage and redirect to auth
      localStorage.setItem('composer_import', JSON.stringify(composerData));
      toast.info('🔐 Bitte melde dich an, um den Post zu veröffentlichen');
      navigate('/auth');
      return;
    }
    
    // User is logged in - use sessionStorage for direct flow
    sessionStorage.setItem('composer_import', JSON.stringify(composerData));
    
    // Navigate to composer
    navigate('/composer');
    
    // Show success toast
    toast.success('📤 Post an Composer gesendet!');
  };

  // Extract available languages
  const availableLanguages = draft?.languages || ['de'];
  
  // Get localized content for selected language
  const getLocalizedContent = () => {
    if (!draft) return null;
    
    // Check if multi-language output exists in ai_output_json
    const aiOutput = draft.ai_output_json || draft;
    if (aiOutput?.languages?.[selectedLanguage]) {
      return aiOutput.languages[selectedLanguage];
    }
    
    // Fallback to main output
    return {
      hooks: draft.hooks,
      caption: draft.caption,
      caption_b: draft.caption_b,
      hashtags: draft.hashtags,
      alt_text: draft.alt_text,
      scores: draft.scores,
      compliance: draft.compliance
    };
  };

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

  const localizedContent = getLocalizedContent();
  const hooks = localizedContent?.hooks || draft.hooks;
  const caption = localizedContent?.caption || draft.caption;
  const caption_b = localizedContent?.caption_b || draft.caption_b;
  const hashtags = localizedContent?.hashtags || draft.hashtags;
  const alt_text = localizedContent?.alt_text || draft.alt_text;
  const scores = localizedContent?.scores || draft.scores;
  const compliance = localizedContent?.compliance || draft.compliance;
  const platforms = draft.platforms;
  const warnings = compliance?.warnings || [];

  return (
    <Card className="h-full">
      <CardContent className="p-6">
        {/* Language Selector for Multi-Language */}
        {availableLanguages.length > 1 && (
          <div className="flex gap-2 mb-4 p-2 bg-muted rounded-lg">
            {availableLanguages.map((lang) => (
              <Button
                key={lang}
                variant={selectedLanguage === lang ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedLanguage(lang)}
                className="uppercase flex-1"
              >
                {lang}
              </Button>
            ))}
          </div>
        )}
        
        <Tabs defaultValue="preview" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="preview">Vorschau</TabsTrigger>
            <TabsTrigger value="variants">Varianten</TabsTrigger>
            <TabsTrigger value="platform">Plattform</TabsTrigger>
            <TabsTrigger value="image">Bild & Crops</TabsTrigger>
            <TabsTrigger value="scores">Scores</TabsTrigger>
          </TabsList>

          {/* Tab 0: Social Media Previews */}
          <TabsContent value="preview" className="space-y-4 mt-6">
            {/* Platform Selector */}
            <div className="flex gap-2 mb-6 justify-center flex-wrap">
              <Button 
                variant={previewPlatform === 'facebook' ? 'default' : 'outline'}
                onClick={() => setPreviewPlatform('facebook')}
                size="sm"
              >
                Facebook
              </Button>
              <Button 
                variant={previewPlatform === 'instagram' ? 'default' : 'outline'}
                onClick={() => setPreviewPlatform('instagram')}
                size="sm"
              >
                Instagram
              </Button>
              <Button 
                variant={previewPlatform === 'linkedin' ? 'default' : 'outline'}
                onClick={() => setPreviewPlatform('linkedin')}
                size="sm"
              >
                LinkedIn
              </Button>
              <Button 
                variant={previewPlatform === 'x' ? 'default' : 'outline'}
                onClick={() => setPreviewPlatform('x')}
                size="sm"
              >
                X (Twitter)
              </Button>
            </div>

            {/* Conditional Platform Previews */}
            {previewPlatform === 'facebook' && (
              <FacebookPostPreview
                mediaUrl={draft.media_url || mediaPreview || ''}
                mediaType={draft.media_type || mediaType || 'image'}
                caption={caption}
                hook={hooks?.A}
                hashtags={hashtags?.reach || []}
                profileName={draft.brand_name || "Ihr Profil"}
                profileImage={undefined}
              />
            )}

            {previewPlatform === 'instagram' && (
              <InstagramPostPreview
                mediaUrl={draft.media_url || mediaPreview || ''}
                mediaType={draft.media_type || mediaType || 'image'}
                caption={caption}
                hook={hooks?.A}
                hashtags={hashtags?.reach || []}
                username={draft.brand_name?.toLowerCase().replace(/\s+/g, '_') || "ihr_profil"}
                profileImage={undefined}
              />
            )}

            {previewPlatform === 'linkedin' && (
              <LinkedInPostPreview
                mediaUrl={draft.media_url || mediaPreview || ''}
                mediaType={draft.media_type || mediaType || 'image'}
                caption={caption}
                hook={hooks?.A}
                hashtags={hashtags?.niche?.slice(0, 5) || []}
                profileName={draft.brand_name || "Ihr Name"}
                jobTitle="Marketing Manager"
                profileImage={undefined}
              />
            )}

            {previewPlatform === 'x' && (
              <XPostPreview
                mediaUrl={draft.media_url || mediaPreview || ''}
                mediaType={draft.media_type || mediaType || 'image'}
                caption={caption.slice(0, 280)}
                hashtags={hashtags?.reach?.slice(0, 3) || []}
                displayName={draft.brand_name || "Ihr Name"}
                handle={`@${draft.brand_name?.toLowerCase().replace(/\s+/g, '_') || 'ihr_handle'}`}
                profileImage={undefined}
                verified={false}
              />
            )}
          </TabsContent>

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
              // Count ALL hashtag sets correctly
              const totalHashtags = (hashtags?.reach?.length || 0) + 
                                   (hashtags?.niche?.length || 0) + 
                                   (hashtags?.brand?.length || 0);
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
            {(draft?.media_url || mediaPreview) ? (
              mediaType === 'video' || draft.media_type === 'video' ? (
                <div className="space-y-4">
                  <video 
                    src={draft.media_url || mediaPreview} 
                    controls 
                    className="w-full rounded-lg"
                    style={{ maxHeight: '500px' }}
                  />
                  <Alert>
                    <AlertDescription>
                      📹 <strong>Video hochgeladen</strong> - Wird automatisch für alle Plattformen optimiert.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <ImageAnalysisPanel 
                  imageUrl={draft.media_url || mediaPreview} 
                  brandKitId={draft.brand_kit_id}
                />
              )
            ) : (
              <div className="text-center text-muted-foreground p-8">
                <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Kein Bild/Video hochgeladen</p>
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
          <Button onClick={handleSendToComposer} variant="default" size="sm">
            <ExternalLink className="h-4 w-4 mr-2" />
            An Composer senden
          </Button>
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
