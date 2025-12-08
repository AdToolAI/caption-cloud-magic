import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { cn } from "@/lib/utils";

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
    
    const localizedContent = getLocalizedContent();
    const hooks = localizedContent?.hooks || draft.hooks;
    const caption = localizedContent?.caption || draft.caption;
    const hashtags = localizedContent?.hashtags || draft.hashtags;
    
    const cleanHook = (hooks?.A || '').replace(/\*\*/g, '');
    const cleanCaption = (caption || '').replace(/\*\*/g, '');
    
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
    
    if (!user) {
      localStorage.setItem('composer_import', JSON.stringify(composerData));
      toast.info('🔐 Bitte melde dich an, um den Post zu veröffentlichen');
      navigate('/auth');
      return;
    }
    
    sessionStorage.setItem('composer_import', JSON.stringify(composerData));
    navigate('/composer');
    toast.success('📤 Post an Composer gesendet!');
  };

  const availableLanguages = draft?.languages || ['de'];
  
  const getLocalizedContent = () => {
    if (!draft) return null;
    
    const aiOutput = draft.ai_output_json || draft;
    if (aiOutput?.languages?.[selectedLanguage]) {
      return aiOutput.languages[selectedLanguage];
    }
    
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
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center text-muted-foreground p-12">
          <motion.div 
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 3 }}
            className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20
                       flex items-center justify-center shadow-[0_0_30px_hsla(43,90%,68%,0.15)]"
          >
            <Sparkles className="h-10 w-10 text-primary/60" />
          </motion.div>
          <p className="text-sm">Lade ein Bild hoch und generiere deinen Post, um die Vorschau zu sehen</p>
        </div>
      </div>
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
    <div className="h-full p-6">
      {/* Language Selector for Multi-Language - Premium Styling */}
      {availableLanguages.length > 1 && (
        <div className="flex gap-2 mb-4 p-2 bg-muted/20 rounded-xl border border-white/10">
          {availableLanguages.map((lang: string) => (
            <Button
              key={lang}
              variant={selectedLanguage === lang ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedLanguage(lang)}
              className={cn(
                "uppercase flex-1 transition-all",
                selectedLanguage === lang 
                  ? "bg-primary/90 shadow-[0_0_15px_hsla(43,90%,68%,0.3)]" 
                  : "border-white/20 hover:bg-white/5"
              )}
            >
              {lang}
            </Button>
          ))}
        </div>
      )}
      
      <Tabs defaultValue="preview" className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-muted/20 border border-white/10 rounded-xl p-1">
          <TabsTrigger 
            value="preview"
            className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary
                       data-[state=active]:shadow-[0_0_10px_hsla(43,90%,68%,0.2)] rounded-lg"
          >
            Vorschau
          </TabsTrigger>
          <TabsTrigger 
            value="variants"
            className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary
                       data-[state=active]:shadow-[0_0_10px_hsla(43,90%,68%,0.2)] rounded-lg"
          >
            Varianten
          </TabsTrigger>
          <TabsTrigger 
            value="platform"
            className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary
                       data-[state=active]:shadow-[0_0_10px_hsla(43,90%,68%,0.2)] rounded-lg"
          >
            Plattform
          </TabsTrigger>
          <TabsTrigger 
            value="image"
            className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary
                       data-[state=active]:shadow-[0_0_10px_hsla(43,90%,68%,0.2)] rounded-lg"
          >
            Bild
          </TabsTrigger>
          <TabsTrigger 
            value="scores"
            className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary
                       data-[state=active]:shadow-[0_0_10px_hsla(43,90%,68%,0.2)] rounded-lg"
          >
            Scores
          </TabsTrigger>
        </TabsList>

        {/* Tab 0: Social Media Previews */}
        <TabsContent value="preview" className="space-y-4 mt-6">
          {/* Platform Selector - Premium Styling */}
          <div className="flex gap-2 mb-6 justify-center flex-wrap">
            {(['facebook', 'instagram', 'linkedin', 'x'] as const).map((platform) => (
              <Button 
                key={platform}
                variant={previewPlatform === platform ? 'default' : 'outline'}
                onClick={() => setPreviewPlatform(platform)}
                size="sm"
                className={cn(
                  "transition-all",
                  previewPlatform === platform 
                    ? "bg-primary/90 shadow-[0_0_15px_hsla(43,90%,68%,0.3)]" 
                    : "border-white/20 hover:bg-white/5 hover:border-primary/40"
                )}
              >
                {platform === 'x' ? 'X (Twitter)' : platform.charAt(0).toUpperCase() + platform.slice(1)}
              </Button>
            ))}
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
              {["A", "B", "C"].map((variant, index) => (
                <motion.div 
                  key={variant} 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="p-3 bg-muted/20 border border-white/10 rounded-xl
                             hover:border-primary/30 hover:shadow-[0_0_15px_hsla(43,90%,68%,0.1)]
                             transition-all duration-300"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary">
                      Hook {variant}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {hooks?.[variant]?.length || 0} Zeichen
                    </span>
                  </div>
                  <p className="text-sm">{hooks?.[variant] || "-"}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Hauptcaption */}
          <div>
            <Label className="text-sm font-semibold">Hauptcaption</Label>
            <div className="p-4 bg-muted/20 border border-white/10 rounded-xl mt-2">
              <p className="whitespace-pre-wrap text-sm">{caption}</p>
            </div>
          </div>

          {/* A/B Variante */}
          {caption_b && (
            <div>
              <Label className="text-sm font-semibold">Caption B (A/B-Test)</Label>
              <div className="p-4 bg-muted/20 border border-white/10 rounded-xl mt-2">
                <p className="whitespace-pre-wrap text-sm">{caption_b}</p>
              </div>
            </div>
          )}

          {/* Hashtag-Sets */}
          <div>
            <Label className="text-sm font-semibold">Hashtag-Sets</Label>
            <div className="space-y-2 mt-2">
              {["reach", "niche", "brand"].map((setName, index) => (
                <motion.div 
                  key={setName} 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="p-3 bg-muted/20 border border-white/10 rounded-xl"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="capitalize bg-primary/10 border border-primary/20">
                      {setName}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {hashtags?.[setName]?.length || 0} Tags
                    </span>
                  </div>
                  <p className="text-sm text-primary">
                    {hashtags?.[setName]?.join(" ") || "-"}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Alt-Text */}
          {alt_text && (
            <div>
              <Label className="text-sm font-semibold">Alt-Text (Barrierefreiheit)</Label>
              <div className="p-3 bg-muted/20 border border-white/10 rounded-xl mt-2">
                <p className="text-sm">{alt_text}</p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Plattform-Vorschau */}
        <TabsContent value="platform" className="space-y-4 mt-6">
          <Label className="text-sm font-semibold">Plattform-Limits</Label>
          {platforms?.map((platform: string, index: number) => {
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
              <motion.div 
                key={platform} 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-4 border border-white/10 rounded-xl bg-muted/10
                           hover:border-primary/30 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold capitalize">{platform}</span>
                  <Badge variant={isOverLimit ? "destructive" : "secondary"} 
                         className={!isOverLimit ? "bg-primary/10 border border-primary/20" : ""}>
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
              </motion.div>
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
                  className="w-full rounded-xl border border-white/10"
                  style={{ maxHeight: '500px' }}
                />
                <Alert className="bg-muted/20 border-white/10">
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
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-muted/20 border border-white/10
                              flex items-center justify-center">
                <ImageIcon className="h-8 w-8 opacity-50" />
              </div>
              <p className="text-sm">Kein Bild/Video hochgeladen</p>
            </div>
          )}
        </TabsContent>

        {/* Tab 4: Scores */}
        <TabsContent value="scores" className="space-y-6 mt-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl bg-muted/10 border border-white/10"
          >
            <Label className="text-sm font-semibold">Hook-Score</Label>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex-1">
                <Progress value={scores?.hook || 0} className="h-3" />
              </div>
              <Badge variant="secondary" className="text-lg font-bold bg-primary/10 border border-primary/20">
                {scores?.hook || 0}/100
              </Badge>
            </div>
            {scores?.hookTip && (
              <p className="text-sm text-muted-foreground mt-2">💡 {scores.hookTip}</p>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-4 rounded-xl bg-muted/10 border border-white/10"
          >
            <Label className="text-sm font-semibold">CTA-Score</Label>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex-1">
                <Progress value={scores?.cta || 0} className="h-3" />
              </div>
              <Badge variant="secondary" className="text-lg font-bold bg-primary/10 border border-primary/20">
                {scores?.cta || 0}/100
              </Badge>
            </div>
            {scores?.ctaTip && (
              <p className="text-sm text-muted-foreground mt-2">💡 {scores.ctaTip}</p>
            )}
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* Aktionen - Premium Styling */}
      <div className="flex gap-2 flex-wrap mt-6 pt-6 border-t border-white/10">
        <Button 
          onClick={handleSendToComposer} 
          className="flex-1 h-12 bg-gradient-to-r from-primary to-primary/80
                     hover:shadow-[0_0_20px_hsla(43,90%,68%,0.3)] transition-all"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          An Composer
        </Button>
        <Button 
          onClick={onCopyCaption} 
          variant="outline" 
          size="sm"
          className="h-12 border-white/20 hover:bg-white/5 hover:border-primary/40"
        >
          <Copy className="h-4 w-4 mr-2" />
          Kopieren
        </Button>
        <Button 
          onClick={onExportZip} 
          variant="outline" 
          size="sm"
          className="h-12 border-white/20 hover:bg-white/5 hover:border-primary/40"
        >
          <Download className="h-4 w-4 mr-2" />
          ZIP
        </Button>
        <Button 
          onClick={onSendToCalendar} 
          variant="outline" 
          size="sm"
          className="h-12 border-white/20 hover:bg-white/5 hover:border-primary/40"
        >
          <Calendar className="h-4 w-4 mr-2" />
          Kalender
        </Button>
        <Button 
          onClick={onSendToReview} 
          variant="outline" 
          size="sm"
          className="h-12 border-white/20 hover:bg-white/5 hover:border-primary/40"
        >
          <Send className="h-4 w-4 mr-2" />
          Freigabe
        </Button>
      </div>
    </div>
  );
}
