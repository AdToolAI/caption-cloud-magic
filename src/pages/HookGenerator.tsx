import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useAICall } from "@/hooks/useAICall";
import { FEATURE_COSTS } from "@/lib/featureCosts";
import { getProductInfo } from "@/config/pricing";
import { supabase } from "@/integrations/supabase/client";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";
import { Loader2, Copy, Sparkles, RefreshCw, ArrowRight, Zap, Calendar as CalendarIcon } from "lucide-react";
import { AddPostModal } from "@/components/calendar/AddPostModal";
import { getNextSuggestedTime, getSuggestedDate } from "@/lib/suggestedTimes";
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

    // Check usage limits
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
            },
          });
          
          if (error) throw error;
          return data;
        }
      });

      setHooks(data.hooks || []);
      setNotes(data.notes || "");
      
      await fetchUsage();

      // Get suggested posting time
      const suggested = getNextSuggestedTime(platform);
      setSuggestedTime(suggested.time);
      setSuggestedDate(getSuggestedDate(suggested.time));

      // Track hook generation
      trackEvent(ANALYTICS_EVENTS.POST_GENERATED, {
        platform,
        tone,
        audience: audience || 'none',
        styles: styles.join(', '),
        hook_count: data.hooks?.length || 0,
      });

      // Emit event for hooks generation
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

  const handleUseInGenerator = (hookText: string) => {
    navigate(`/generator?prefill=${encodeURIComponent('HOOK: ' + hookText)}`);
  };

  const handleScheduleHook = (hookText: string) => {
    setSelectedHookForSchedule(hookText);
    setShowScheduleModal(true);
  };

  const getCharColor = (length: number) => {
    if (length <= 110) return 'text-green-600';
    return 'text-orange-600';
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-secondary/20">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              {t("hooks.title")}
            </h1>
            <p className="text-muted-foreground">
              {t("hooks.subtitle")}
            </p>
            <p className="text-sm text-muted-foreground">
              {isPro ? "Unlimited" : isBasic ? `${usageCount}/${maxUsage} used` : t("hooks.usageCounter", { used: usageCount, total: maxUsage })}
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="border-primary/20 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  {t("hooks.inputTitle")}
                </CardTitle>
                <CardDescription>
                  {t("hooks.inputDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="platform">{t("hooks.platform")}</Label>
                    <Select value={platform} onValueChange={setPlatform}>
                      <SelectTrigger id="platform">
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
                      <SelectTrigger id="tone">
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

                <div className="space-y-2">
                  <Label htmlFor="audience">{t("hooks.audience")}</Label>
                  <Input
                    id="audience"
                    placeholder={t("hooks.audiencePlaceholder")}
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                  />
                </div>

                <div className="space-y-3">
                  <Label>{t("hooks.styles")}</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.keys(selectedStyles).map((style) => (
                      <div key={style} className="flex items-center space-x-2">
                        <Checkbox
                          id={style}
                          checked={selectedStyles[style as keyof typeof selectedStyles]}
                          onCheckedChange={(checked) =>
                            setSelectedStyles({ ...selectedStyles, [style]: checked })
                          }
                        />
                        <label
                          htmlFor={style}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {t(`hooks.style${style.charAt(0).toUpperCase() + style.slice(1)}`)}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleGenerate(false)}
                    disabled={aiLoading || !topic.trim() || !platform || !tone}
                    className="flex-1"
                    size="lg"
                  >
                    {aiLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("hooks.generating")}
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {t("hooks.generate")}
                      </>
                    )}
                  </Button>
                  {hooks.length > 0 && (
                    <Button
                      onClick={() => handleGenerate(true)}
                      disabled={aiLoading}
                      variant="outline"
                      size="lg"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {hooks.length > 0 && (
                <>
                  <Card className="border-primary/20 shadow-lg">
                    <CardHeader>
                      <CardTitle>{t("hooks.results")}</CardTitle>
                      <CardDescription>{notes}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {hooks.map((hook, index) => (
                        <div key={index} className="p-4 bg-secondary/50 rounded-lg border border-border space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                              {hook.style}
                            </span>
                            <span className={`text-xs font-medium ${getCharColor(hook.text.length)}`}>
                              {hook.text.length} {t("hooks.chars")}
                            </span>
                          </div>
                          <p className="text-sm">{hook.text}</p>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleCopyHook(hook.text)}
                              variant="outline"
                              size="sm"
                              className="flex-1"
                            >
                              <Copy className="mr-2 h-3 w-3" />
                              {t("hooks.copy")}
                            </Button>
                            <Button
                              onClick={() => handleScheduleHook(hook.text)}
                              variant="outline"
                              size="sm"
                              className="flex-1"
                            >
                              <CalendarIcon className="mr-2 h-3 w-3" />
                              Schedule
                            </Button>
                          </div>
                        </div>
                      ))}
                      <Button onClick={handleCopyAll} variant="outline" className="w-full">
                        <Copy className="mr-2 h-4 w-4" />
                        {t("hooks.copyAll")}
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        {t("hooks.helperText")}
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      <Dialog open={showLimitModal} onOpenChange={setShowLimitModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("hooks.limitTitle")}</DialogTitle>
            <DialogDescription>
              {t("hooks.limitMessage")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLimitModal(false)}>
              {t("common.close")}
            </Button>
            <Button onClick={() => navigate("/#pricing")}>
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