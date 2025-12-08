import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useAICall } from "@/hooks/useAICall";
import { FEATURE_COSTS } from "@/lib/featureCosts";
import { getProductInfo } from "@/config/pricing";
import { supabase } from "@/integrations/supabase/client";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";
import { Loader2, Copy, Sparkles, RefreshCw, Zap, Calendar as CalendarIcon, CheckCircle2, Check, Crown } from "lucide-react";
import { AddPostModal } from "@/components/calendar/AddPostModal";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { getNextSuggestedTime, getSuggestedDate } from "@/lib/suggestedTimes";
import { HookGeneratorHeroHeader } from "@/components/hook-generator/HookGeneratorHeroHeader";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const HookGenerator = () => {
  const { t } = useTranslation();
  const { user, subscribed, productId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { emit } = useEventEmitter();
  const { executeAICall, loading: aiLoading } = useAICall();
  const aiQueueWorkerV2 = useFeatureFlag("enable_ai_queue_worker_v2");

  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState<string>("");
  const [tone, setTone] = useState<string>("");
  const [audience, setAudience] = useState("");
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [usageCount, setUsageCount] = useState(0);

  const [selectedStyles, setSelectedStyles] = useState({
    curiosity: true,
    humor: true,
    provocation: true,
    authority: true,
    relatable: true,
  });

  const [hooks, setHooks] = useState<Array<{ style: string; text: string }>>([]);
  const [notes, setNotes] = useState("");
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedHookForSchedule, setSelectedHookForSchedule] = useState<string>("");
  const [suggestedTime, setSuggestedTime] = useState<string>("");
  const [suggestedDate, setSuggestedDate] = useState<Date>(new Date());

  const planInfo = getProductInfo(productId);
  const isPro = subscribed && productId === 'prod_TDoYdYP1nOOWsN';
  const isBasic = subscribed && productId === 'prod_TDoWFAZjKKUnA2';
  const maxUsage = isPro ? Infinity : (isBasic ? 10 : 3);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
    } else {
      fetchUsage();
    }
  }, [user, navigate]);

  const fetchUsage = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('hooks_history')
      .select('id')
      .eq('user_id', user?.id)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`);
    
    setUsageCount(data?.length || 0);
  };

  const handleGenerate = async (isRegenerate = false) => {
    if (!topic.trim() || !platform || !tone) {
      toast({
        title: t("hooks.fillFields"),
        variant: "destructive",
      });
      return;
    }

    if (usageCount >= maxUsage) {
      trackEvent(ANALYTICS_EVENTS.USAGE_LIMIT_REACHED, {
        feature: 'hook_generator',
        limit: maxUsage,
        current_usage: usageCount,
        user_id: user?.id
      });
      setShowLimitModal(true);
      return;
    }

    try {
      const styles = Object.keys(selectedStyles)
        .filter(key => selectedStyles[key as keyof typeof selectedStyles])
        .map(key => key.charAt(0).toUpperCase() + key.slice(1));

      if (styles.length === 0) {
        toast({
          title: t("hooks.selectStyle"),
          variant: "destructive",
        });
        return;
      }

      const data = await executeAICall({
        featureCode: FEATURE_COSTS.CAPTION_GENERATE,
        estimatedCost: 1,
        apiCall: async () => {
          const { data, error } = await supabase.functions.invoke("generate-hooks", {
            body: {
              topic,
              platform,
              tone,
              audience: audience || null,
              styles,
              language: t("common.language"),
              useV2Worker: aiQueueWorkerV2 ?? false,
            },
          });
          
          if (error) throw error;
          return data;
        }
      });

      setHooks(data.hooks || []);
      setNotes(data.notes || "");
      
      await fetchUsage();

      const suggested = getNextSuggestedTime(platform);
      setSuggestedTime(suggested.time);
      setSuggestedDate(getSuggestedDate(suggested.time));

      trackEvent(ANALYTICS_EVENTS.POST_GENERATED, {
        platform,
        tone,
        audience: audience || 'none',
        styles: styles.join(', '),
        hook_count: data.hooks?.length || 0,
      });

      await emit({
        event_type: 'hook.generated',
        source: 'hook_generator',
        payload: {
          platform,
          tone,
          topic: topic.substring(0, 50),
          styles: styles,
          hook_count: data.hooks?.length || 0,
        },
      }, { silent: true });

      toast({
        title: isRegenerate ? t("hooks.regenerated") : t("hooks.success"),
      });
    } catch (error: any) {
      console.error("Error generating hooks:", error);
      if (error.code !== 'INSUFFICIENT_CREDITS') {
        toast({
          title: t("common.error"),
          description: error.message,
          variant: "destructive",
        });
      }
    }
  };

  const handleCopyHook = async (hookText: string) => {
    await navigator.clipboard.writeText(hookText);
    
    trackEvent(ANALYTICS_EVENTS.HOOK_COPIED, {
      hook_length: hookText.length,
      platform,
      user_id: user?.id
    });
    
    toast({
      title: t("hooks.copied"),
    });
  };

  const handleCopyAll = async () => {
    const allHooks = hooks.map(h => `${h.style}: ${h.text}`).join('\n\n');
    await navigator.clipboard.writeText(allHooks);
    toast({
      title: t("hooks.copiedAll"),
    });
  };

  const handleScheduleHook = (hookText: string) => {
    setSelectedHookForSchedule(hookText);
    setShowScheduleModal(true);
  };

  const toggleStyle = (style: string) => {
    setSelectedStyles(prev => ({
      ...prev,
      [style]: !prev[style as keyof typeof prev]
    }));
  };

  const getCharColor = (length: number) => {
    if (length <= 110) return 'text-green-400';
    return 'text-orange-400';
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Hero Header */}
          <HookGeneratorHeroHeader 
            usageCount={usageCount} 
            maxUsage={maxUsage} 
            isPro={isPro}
            isBasic={isBasic}
          />

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Input Card - Glassmorphism */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                         shadow-[0_0_40px_hsla(43,90%,68%,0.08)]"
            >
              {/* Card Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 
                                flex items-center justify-center shadow-[0_0_20px_hsla(43,90%,68%,0.2)]">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">{t("hooks.inputTitle")}</h2>
                  <p className="text-sm text-muted-foreground">{t("hooks.inputDescription")}</p>
                </div>
              </div>

              <div className="space-y-5">
                {/* Topic Input */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="topic">{t("hooks.topic")}</Label>
                    <span className="text-xs text-muted-foreground">{topic.length}/200</span>
                  </div>
                  <Textarea
                    id="topic"
                    placeholder={t("hooks.topicPlaceholder")}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value.slice(0, 200))}
                    rows={3}
                    className="bg-muted/20 border-white/10 focus:border-primary/60 
                               focus:ring-2 focus:ring-primary/20 resize-none"
                  />
                </div>

                {/* Platform & Tone Selects */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="platform">{t("hooks.platform")}</Label>
                    <Select value={platform} onValueChange={setPlatform}>
                      <SelectTrigger 
                        id="platform"
                        className="bg-muted/20 border-white/10 focus:border-primary/60 
                                   focus:ring-2 focus:ring-primary/20 h-12"
                      >
                        <SelectValue placeholder={t("hooks.selectPlatform")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="linkedin">LinkedIn</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="x">X (Twitter)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tone">{t("hooks.tone")}</Label>
                    <Select value={tone} onValueChange={setTone}>
                      <SelectTrigger 
                        id="tone"
                        className="bg-muted/20 border-white/10 focus:border-primary/60 
                                   focus:ring-2 focus:ring-primary/20 h-12"
                      >
                        <SelectValue placeholder={t("hooks.selectTone")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="friendly">{t("common.friendly")}</SelectItem>
                        <SelectItem value="professional">{t("common.professional")}</SelectItem>
                        <SelectItem value="funny">{t("common.funny")}</SelectItem>
                        <SelectItem value="inspirational">{t("common.inspirational")}</SelectItem>
                        <SelectItem value="bold">{t("common.bold")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Audience Input */}
                <div className="space-y-2">
                  <Label htmlFor="audience">{t("hooks.audience")}</Label>
                  <Input
                    id="audience"
                    placeholder={t("hooks.audiencePlaceholder")}
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    className="bg-muted/20 border-white/10 focus:border-primary/60 
                               focus:ring-2 focus:ring-primary/20 h-12"
                  />
                </div>

                {/* Style Chips */}
                <div className="space-y-3">
                  <Label>{t("hooks.styles")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(selectedStyles).map((style, index) => (
                      <motion.div
                        key={style}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => toggleStyle(style)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2.5 rounded-xl cursor-pointer transition-all duration-300",
                          selectedStyles[style as keyof typeof selectedStyles]
                            ? "bg-primary/20 border border-primary/40 shadow-[0_0_15px_hsla(43,90%,68%,0.2)]"
                            : "bg-muted/20 border border-white/10 hover:border-white/20"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded-md flex items-center justify-center transition-all",
                          selectedStyles[style as keyof typeof selectedStyles] 
                            ? "bg-primary text-primary-foreground" 
                            : "bg-muted/40"
                        )}>
                          {selectedStyles[style as keyof typeof selectedStyles] && (
                            <Check className="h-3 w-3" />
                          )}
                        </div>
                        <span className="text-sm font-medium">
                          {t(`hooks.style${style.charAt(0).toUpperCase() + style.slice(1)}`)}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Generate Button */}
                <div className="flex gap-3 pt-2">
                  <motion.div 
                    whileHover={{ scale: 1.01 }} 
                    whileTap={{ scale: 0.99 }} 
                    className="flex-1"
                  >
                    <Button
                      onClick={() => handleGenerate(false)}
                      disabled={aiLoading || !topic.trim() || !platform || !tone}
                      className="w-full h-14 text-base font-semibold relative overflow-hidden group
                                 bg-gradient-to-r from-primary to-primary/80
                                 hover:shadow-[0_0_30px_hsla(43,90%,68%,0.4)]
                                 transition-all duration-300"
                    >
                      {/* Shimmer Effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent 
                                      translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                      {aiLoading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          {t("hooks.generating")}
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-5 w-5" />
                          {t("hooks.generate")}
                        </>
                      )}
                    </Button>
                  </motion.div>
                  {hooks.length > 0 && (
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        onClick={() => handleGenerate(true)}
                        disabled={aiLoading}
                        variant="outline"
                        className="h-14 w-14 border-white/20 hover:bg-white/5 hover:border-primary/40"
                      >
                        <RefreshCw className="h-5 w-5" />
                      </Button>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Results Section */}
            <div className="space-y-4">
              {hooks.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.5 }}
                  className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl overflow-hidden
                             shadow-[0_0_40px_hsla(43,90%,68%,0.08)]"
                >
                  {/* Success Header */}
                  <div className="px-6 py-4 border-b border-white/10 bg-gradient-to-r from-green-500/10 to-transparent">
                    <div className="flex items-center gap-3">
                      <motion.div 
                        initial={{ scale: 0 }}
                        animate={{ scale: [0, 1.2, 1] }}
                        transition={{ duration: 0.5 }}
                        className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center
                                   shadow-[0_0_15px_hsla(142,76%,36%,0.3)]"
                      >
                        <CheckCircle2 className="h-5 w-5 text-green-400" />
                      </motion.div>
                      <div>
                        <h3 className="text-lg font-semibold">{t("hooks.results")}</h3>
                        <p className="text-sm text-muted-foreground">{notes}</p>
                      </div>
                    </div>
                  </div>

                  {/* Hooks List */}
                  <div className="p-6 space-y-4">
                    {hooks.map((hook, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="p-4 rounded-xl bg-muted/20 border border-white/10 
                                   hover:border-primary/30 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.1)]
                                   transition-all duration-300 space-y-3"
                      >
                        {/* Style Badge & Char Count */}
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium 
                                           bg-primary/20 text-primary border border-primary/30
                                           shadow-[0_0_10px_hsla(43,90%,68%,0.15)]">
                            {hook.style}
                          </span>
                          <span className={cn("text-xs font-medium", getCharColor(hook.text.length))}>
                            {hook.text.length} {t("hooks.chars")}
                          </span>
                        </div>

                        {/* Hook Text */}
                        <p className="text-sm leading-relaxed">{hook.text}</p>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleCopyHook(hook.text)}
                            variant="outline"
                            size="sm"
                            className="flex-1 h-9 border-white/20 hover:bg-white/5 hover:border-primary/40"
                          >
                            <Copy className="mr-2 h-3 w-3" />
                            {t("hooks.copy")}
                          </Button>
                          <Button
                            onClick={() => handleScheduleHook(hook.text)}
                            variant="outline"
                            size="sm"
                            className="flex-1 h-9 border-white/20 hover:bg-white/5 hover:border-primary/40"
                          >
                            <CalendarIcon className="mr-2 h-3 w-3" />
                            Schedule
                          </Button>
                        </div>
                      </motion.div>
                    ))}

                    {/* Copy All Button */}
                    <Button 
                      onClick={handleCopyAll} 
                      variant="outline" 
                      className="w-full h-11 border-white/20 hover:bg-white/5 hover:border-primary/40"
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      {t("hooks.copyAll")}
                    </Button>

                    <p className="text-xs text-muted-foreground text-center">
                      {t("hooks.helperText")}
                    </p>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Limit Modal - Premium Styling */}
      <Dialog open={showLimitModal} onOpenChange={setShowLimitModal}>
        <DialogContent className="backdrop-blur-xl bg-card/90 border border-white/10">
          <DialogHeader className="text-center space-y-4">
            {/* Crown Icon with Glow */}
            <div className="flex justify-center">
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 
                            flex items-center justify-center shadow-[0_0_30px_hsla(43,90%,68%,0.3)]"
              >
                <Crown className="h-8 w-8 text-primary" />
              </motion.div>
            </div>
            <DialogTitle className="text-xl">{t("hooks.limitTitle")}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("hooks.limitMessage")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowLimitModal(false)}
              className="flex-1 border-white/20 hover:bg-white/5"
            >
              {t("common.close")}
            </Button>
            <Button 
              onClick={() => navigate("/#pricing")}
              className="flex-1 bg-gradient-to-r from-primary to-primary/80
                         hover:shadow-[0_0_20px_hsla(43,90%,68%,0.3)]"
            >
              {t("generator.btn_upgrade")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddPostModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onSave={() => {
          setShowScheduleModal(false);
          toast({ title: "Hook scheduled successfully!" });
        }}
        prefillCaption={selectedHookForSchedule}
        prefillPlatform={platform}
        prefillDate={suggestedDate}
        suggestedTime={suggestedTime}
      />

      <Footer />
    </div>
  );
};

export default HookGenerator;
