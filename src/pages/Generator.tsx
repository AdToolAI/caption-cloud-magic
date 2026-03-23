import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Footer } from "@/components/Footer";
import { GeneratorHeroHeader } from "@/components/generator/GeneratorHeroHeader";
import { PromptAssistantDialog } from "@/components/generator/PromptAssistantDialog";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { useAICall } from "@/hooks/useAICall";
import { supabase } from "@/integrations/supabase/client";

import { Slider } from "@/components/ui/slider";
import { Copy, Sparkles, RefreshCw, Loader2, Calendar, CheckCircle2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";

const Generator = () => {
  const { t, language } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { emit } = useEventEmitter();
  const { executeAICall, loading: aiCallLoading, status } = useAICall();
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("friendly");
  const [platform, setPlatform] = useState("instagram");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [contentLength, setContentLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [hashtagCount, setHashtagCount] = useState(5);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  const lengthMap: Record<string, number> = {
    short: 120,
    medium: 250,
    long: 400
  };

  useEffect(() => {
    const wizardPrompt = localStorage.getItem("wizardPrompt");
    if (wizardPrompt) {
      setTopic(wizardPrompt);
      localStorage.removeItem("wizardPrompt");
      toast.success("Prompt loaded from Wizard!");
    }

    // Generator Prefill von ImageCaptionPairing
    const generatorPrefill = localStorage.getItem('generator_prefill');
    if (generatorPrefill) {
      try {
        const data = JSON.parse(generatorPrefill);
        if (data.topic) setTopic(data.topic);
        if (data.caption) setCaption(data.caption);
        if (data.hashtags) setHashtags(data.hashtags);
        if (data.platform) setPlatform(data.platform);
        localStorage.removeItem('generator_prefill');
        toast.success("Caption vom Bild-Caption Pairing geladen!");
      } catch (e) {
        console.error('Error parsing generator_prefill:', e);
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    const prefill = urlParams.get('prefill');
    const urlPlatform = urlParams.get('platform');
    
    if (prefill) {
      setTopic(decodeURIComponent(prefill));
      toast.success("Content loaded!");
    }
    
    if (urlPlatform) {
      setPlatform(urlPlatform);
    }
    
    if (prefill || urlPlatform) {
      navigate('/generator', { replace: true });
    }
  }, []);


  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error(t('generator_error_empty_topic'));
      return;
    }

    setIsGenerating(true);
    
    try {
      const data = await executeAICall({
        featureCode: 'caption_generate',
        estimatedCost: 1,
        apiCall: async () => {
          const { data, error } = await supabase.functions.invoke('generate-caption', {
            body: {
              topic: topic.trim(),
              tone,
              platform,
              language,
              maxLength: lengthMap[contentLength],
              hashtagCount: hashtagCount,
            }
          });

          if (error) {
            const enhancedError: any = new Error(error.message);
            enhancedError.status = error.context?.status;
            enhancedError.code = error.context?.code;
            throw enhancedError;
          }

          return data;
        }
      });

      setCaption(data.caption);
      setHashtags(data.hashtags);
      
      trackEvent(ANALYTICS_EVENTS.POST_GENERATED, {
        platform,
        tone,
        has_hashtags: data.hashtags?.length > 0,
      });
      
      await emit({
        event_type: 'caption.created',
        source: 'generator',
        payload: {
          platform,
          tone,
          topic: topic.substring(0, 50),
          has_hashtags: data.hashtags?.length > 0,
        },
      }, { silent: true });
      
      toast.success("Caption generated!");
    } catch (error: any) {
      if (error.code !== 'INSUFFICIENT_CREDITS') {
        let errorMessage = t('generator_error_unexpected');
        
        switch (error.status) {
          case 401:
          case 403:
            errorMessage = t('generator_error_auth_required');
            break;
          case 400:
          case 422:
            errorMessage = t('generator_error_invalid_input');
            break;
          case 503:
            errorMessage = t('generator_error_service_unavailable');
            break;
        }
        
        if (errorMessage !== t('generator_error_unexpected')) {
          toast.error(errorMessage);
        }
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    const fullText = `${caption}\n\n${hashtags.join(' ')}`;
    navigator.clipboard.writeText(fullText);
    
    trackEvent(ANALYTICS_EVENTS.CAPTION_COPIED, {
      caption_length: caption.length,
      hashtags_count: hashtags.length,
      platform,
      user_id: user?.id
    });
    
    toast.success("Copied to clipboard!");
  };

  const handleNew = async () => {
    setCaption("");
    setHashtags([]);
    await handleGenerate();
  };

  const handleSendToCalendar = () => {
    if (!caption) {
      toast.error("Generiere zuerst eine Caption");
      return;
    }
    
    const fullCaption = `${caption}\n\n${hashtags.join(' ')}`.trim();
    
    const prefillData = {
      title: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Post`,
      caption: fullCaption,
      platforms: [platform],
      hashtags: hashtags,
      timestamp: Date.now()
    };
    
    sessionStorage.setItem('calendar_prefill', JSON.stringify(prefillData));
    navigate('/calendar?prefill=true');
    toast.success('📅 Post an Kalender gesendet - Jetzt Zeit & Details festlegen!');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="container mx-auto px-6 py-4">
        <Breadcrumbs category="create" feature={t("nav.textStudio")} />
      </div>
      
      <main className="flex-1 py-8 px-4">
        <div className="container max-w-4xl mx-auto">
          <GeneratorHeroHeader status={status} />

          {/* Main Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="relative backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6 
                       shadow-[0_0_40px_hsla(43,90%,68%,0.05)]"
          >
            {/* Card Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 rounded-2xl pointer-events-none" />
            
            <div className="relative space-y-6">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center
                                shadow-[0_0_20px_hsla(43,90%,68%,0.2)]">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{t('generator_card_title')}</h3>
                  <p className="text-sm text-muted-foreground">{t('generator_card_description')}</p>
                </div>
              </div>

              {/* Topic Input */}
              <div className="space-y-2">
                <Label htmlFor="topic" className="text-sm font-medium text-muted-foreground">
                  {t('input_topic')}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="topic"
                    placeholder={t('input_topic_placeholder')}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    disabled={isGenerating}
                    className="h-12 bg-muted/20 border-white/10 focus:border-primary/60 
                               focus:ring-2 focus:ring-primary/20 transition-all flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => setIsAssistantOpen(true)}
                    className="h-12 px-4 border-white/20 hover:border-primary/60 hover:bg-primary/10 shrink-0"
                    title="Prompt-Assistent öffnen"
                  >
                    <Wand2 className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Prompt-Assistent</span>
                  </Button>
                </div>
              </div>

              {/* Tone & Platform */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tone" className="text-sm font-medium text-muted-foreground">
                    {t('input_tone')}
                  </Label>
                  <Select value={tone} onValueChange={setTone} disabled={isGenerating}>
                    <SelectTrigger id="tone" className="h-12 bg-muted/20 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover/95 backdrop-blur-xl border-white/10 z-50">
                      <SelectItem value="friendly">{t('tone_friendly')}</SelectItem>
                      <SelectItem value="professional">{t('tone_professional')}</SelectItem>
                      <SelectItem value="humorous">{t('tone_funny')}</SelectItem>
                      <SelectItem value="inspirational">{t('tone_emotional')}</SelectItem>
                      <SelectItem value="casual">{t('tone_casual')}</SelectItem>
                      <SelectItem value="formal">{t('tone_formal')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="platform" className="text-sm font-medium text-muted-foreground">
                    {t('input_platform')}
                  </Label>
                  <Select value={platform} onValueChange={setPlatform} disabled={isGenerating}>
                    <SelectTrigger id="platform" className="h-12 bg-muted/20 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover/95 backdrop-blur-xl border-white/10 z-50">
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="twitter">X (Twitter)</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                      <SelectItem value="youtube">YouTube</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Content Length & Hashtag Count */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">
                    Content-Länge
                  </Label>
                  <Select 
                    value={contentLength} 
                    onValueChange={(v) => setContentLength(v as 'short' | 'medium' | 'long')}
                    disabled={isGenerating}
                  >
                    <SelectTrigger className="h-12 bg-muted/20 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover/95 backdrop-blur-xl border-white/10 z-50">
                      <SelectItem value="short">Kurz (~120 Zeichen)</SelectItem>
                      <SelectItem value="medium">Mittel (~250 Zeichen)</SelectItem>
                      <SelectItem value="long">Lang (~400 Zeichen)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-muted-foreground">
                      Anzahl Hashtags
                    </Label>
                    <span className="text-sm font-medium text-primary">{hashtagCount}</span>
                  </div>
                  <div className="pt-2">
                    <Slider 
                      value={[hashtagCount]} 
                      onValueChange={([v]) => setHashtagCount(v)}
                      min={3} 
                      max={10} 
                      step={1}
                      disabled={isGenerating}
                    />
                  </div>
                </div>
              </div>

              {/* Generate Button */}
              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Button 
                  type="button"
                  onClick={handleGenerate} 
                  disabled={isGenerating}
                  className="w-full h-14 text-base font-semibold relative overflow-hidden group
                             bg-gradient-to-r from-primary to-primary/80
                             hover:shadow-[0_0_30px_hsla(43,90%,68%,0.4)]
                             disabled:opacity-50 disabled:hover:shadow-none
                             transition-all duration-300"
                  size="lg"
                >
                  {/* Shimmer Effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent 
                                  translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  <span className="relative flex items-center gap-2">
                    {isGenerating ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Sparkles className="h-5 w-5" />
                    )}
                    {isGenerating ? 'Generating...' : t('btn_generate')}
                  </span>
                </Button>
              </motion.div>

              {/* Result Section */}
              {caption && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4 pt-6 border-t border-white/10"
                >
                  {/* Caption - Editable */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                      <Label className="text-sm font-medium">Caption</Label>
                      <span className="text-xs text-muted-foreground">(editierbar)</span>
                    </div>
                    <Textarea
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      className="min-h-[120px] bg-muted/20 border-white/10 focus:border-primary/60 
                                 focus:ring-2 focus:ring-primary/20 resize-y text-foreground"
                      placeholder="Caption bearbeiten..."
                    />
                  </div>

                  {/* Hashtags - Editable */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium text-muted-foreground">Hashtags</Label>
                      <span className="text-xs text-muted-foreground">(editierbar)</span>
                    </div>
                    <Input
                      value={hashtags.join(' ')}
                      onChange={(e) => setHashtags(e.target.value.split(/\s+/).filter(Boolean))}
                      className="h-12 bg-muted/20 border-white/10 focus:border-primary/60 
                                 focus:ring-2 focus:ring-primary/20"
                      placeholder="#Hashtag1 #Hashtag2 ..."
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-2 pt-2">
                    <div className="flex gap-2">
                      <Button 
                        onClick={handleCopy} 
                        variant="outline" 
                        className="flex-1 h-11 border-white/20 hover:border-primary/60 hover:bg-primary/10"
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        {t('btn_copy')}
                      </Button>
                      <Button 
                        onClick={handleNew} 
                        variant="outline" 
                        className="flex-1 h-11 border-white/20 hover:border-primary/60 hover:bg-primary/10"
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {t('btn_new')}
                      </Button>
                    </div>
                    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                      <Button 
                        onClick={handleSendToCalendar} 
                        className="w-full h-11 bg-gradient-to-r from-green-600 to-green-500
                                   hover:shadow-[0_0_20px_hsla(142,70%,45%,0.3)]"
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        Zum Kalender hinzufügen
                      </Button>
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Generator;
