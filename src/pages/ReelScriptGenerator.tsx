import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Video, Sparkles, Calendar, Image, Loader2, Download, Copy, CheckCircle2, AlertTriangle } from "lucide-react";
import { AddPostModal } from "@/components/calendar/AddPostModal";
import { getNextSuggestedTime, getSuggestedDate } from "@/lib/suggestedTimes";
import ReelScriptHeroHeader from "@/components/reel-script/ReelScriptHeroHeader";

interface Beat {
  tStart: number;
  tEnd: number;
  vo: string;
  onScreen: string;
  shot: string;
}

interface ReelScript {
  meta: {
    platform: string;
    durationSec: number;
    tone: string;
    language: string;
    fallback?: boolean;
  };
  hook: string;
  beats: Beat[];
  cta: string;
  brollSuggestions: string[];
  hashtags: string[];
  captions?: string;
}

export default function ReelScriptGenerator() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { emit } = useEventEmitter();

  const [idea, setIdea] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [tone, setTone] = useState("friendly");
  const [duration, setDuration] = useState("30");
  const [brandKitId, setBrandKitId] = useState<string>("none");
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState<ReelScript | null>(null);
  const [scriptId, setScriptId] = useState<string>("");
  const [brandKits, setBrandKits] = useState<any[]>([]);
  const [userPlan, setUserPlan] = useState<string>("free");
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [suggestedTime, setSuggestedTime] = useState<string>("");
  const [prefillDate, setPrefillDate] = useState<Date>(new Date());
  const [isFallback, setIsFallback] = useState(false);
  const [language, setLanguage] = useState<'de' | 'en' | 'es'>('de');

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .single();

      if (profile) {
        setUserPlan(profile.plan || 'free');
      }

      const { data: kits } = await supabase
        .from('brand_kits')
        .select('id, mood, primary_color')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (kits) {
        setBrandKits(kits);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const generateScript = async () => {
    if (!idea.trim() || idea.trim().length < 10) {
      toast({
        title: t('reelScript.error_empty_idea'),
        description: t('reelScript.error_idea_too_short'),
        variant: "destructive",
      });
      return;
    }

    if (idea.length > 1500) {
      toast({
        title: t('reelScript.error_idea_too_long'),
        description: t('reelScript.error_max_1500'),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setScript(null);
    setIsFallback(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: t('reelScript.error_auth_required'),
          description: t('reelScript.error_please_login'),
          variant: "destructive",
        });
        navigate('/auth');
        return;
      }

      const makeRequest = async (isRetry = false) => {
        console.log('[ReelScriptGenerator] Sending request:', {
          idea: idea.substring(0, 50) + '...',
          platform,
          tone,
          duration,
          language,
          brand_kit_id: brandKitId || null,
          isRetry
        });

        const requestBody: any = {
          idea,
          platform,
          tone,
          duration,
          language,
        };

        if (brandKitId && brandKitId !== 'none') {
          requestBody.brand_kit_id = brandKitId;
        }

        const { data, error } = await supabase.functions.invoke('generate-reel-script', {
          body: requestBody
        });

        if (error) {
          console.error('[ReelScriptGenerator] Invoke error:', {
            message: error.message,
            context: error.context,
            code: error.code,
            details: error
          });
          throw error;
        }

        return data;
      };

      let data;
      try {
        data = await makeRequest();
      } catch (error: any) {
        if (error.message?.includes('rate limit') || error.message?.includes('429')) {
          toast({
            title: t('reelScript.retrying'),
            description: t('reelScript.rate_limit_retry'),
          });
          await new Promise(resolve => setTimeout(resolve, 1500));
          data = await makeRequest(true);
        } else {
          throw error;
        }
      }

      setScript(data.script);
      setScriptId(data.id);
      setIsFallback(data.isFallback || false);

      const suggestedTimeObj = getNextSuggestedTime(platform);
      setSuggestedTime(suggestedTimeObj.time);
      
      const dateForTime = getSuggestedDate(suggestedTimeObj.time);
      setPrefillDate(dateForTime);

      await emit({
        event_type: 'reel.script.created',
        source: 'reel_script_generator',
        payload: {
          platform,
          tone,
          duration,
          beats_count: data.script.beats?.length || 0,
          is_fallback: data.isFallback,
        },
      }, { silent: true });

      if (data.isFallback) {
        toast({
          title: t('reelScript.fallback_used'),
          description: t('reelScript.fallback_description'),
          variant: "default",
        });
      } else {
        toast({
          title: t('reelScript.success'),
          description: t('reelScript.script_ready'),
        });
      }
    } catch (error: any) {
      console.error('[ReelScriptGenerator] Error:', {
        message: error.message,
        context: error.context,
        code: error.code,
      });

      let errorTitle = t('reelScript.error_failed');
      let errorDescription = t('reelScript.error_unexpected');

      if (error.message?.includes('Unauthorized') || error.message?.includes('401')) {
        errorTitle = t('reelScript.error_auth_required');
        errorDescription = t('reelScript.error_please_login');
      } else if (error.message?.includes('Invalid') || error.message?.includes('422')) {
        errorTitle = t('reelScript.error_validation');
        errorDescription = t('reelScript.error_check_inputs');
      } else if (error.message?.includes('limit') || error.message?.includes('429')) {
        errorTitle = t('reelScript.error_rate_limit');
        errorDescription = t('reelScript.error_wait_retry');
      } else if (error.message?.includes('payment') || error.message?.includes('402')) {
        errorTitle = t('reelScript.error_payment');
        errorDescription = t('reelScript.error_add_credits');
      }

      toast({
        title: errorTitle,
        description: `${errorDescription}${error.requestId ? ` (${t('reelScript.request_id')}: ${error.requestId})` : ''}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} ${t('reelScript.copied')}` });
  };

  const copyVoiceOver = () => {
    if (script) {
      const vo = script.beats.map(b => b.vo).join('\n\n');
      copyToClipboard(vo, t('reelScript.voiceover'));
    }
  };

  const copyOnScreen = () => {
    if (script) {
      const onScreen = script.beats.map((b, i) => `${i + 1}. ${b.onScreen}`).join('\n');
      copyToClipboard(onScreen, t('reelScript.onscreen_text'));
    }
  };

  const copyShots = () => {
    if (script) {
      const shots = script.beats.map((b, i) => `${i + 1}. ${b.shot}`).join('\n');
      copyToClipboard(shots, t('reelScript.shot_list'));
    }
  };

  const copyHashtags = () => {
    if (script) {
      const hashtags = script.hashtags.join(' ');
      copyToClipboard(hashtags, t('reelScript.hashtags'));
    }
  };

  const downloadScript = () => {
    if (!script) return;

    const content = `
# REEL SCRIPT - ${script.hook}

## Meta
Platform: ${script.meta.platform}
Duration: ${script.meta.durationSec}s
Tone: ${script.meta.tone}
Language: ${script.meta.language}

## Hook
${script.hook}

## Beats Timeline
${script.beats.map((b, i) => `
### Beat ${i + 1} (${b.tStart}s - ${b.tEnd}s)
**Voice-over:** ${b.vo}
**On-screen:** ${b.onScreen}
**Shot:** ${b.shot}
`).join('\n')}

## Call-to-Action
${script.cta}

## B-Roll Suggestions
${script.brollSuggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Hashtags
${script.hashtags.join(' ')}

${script.captions ? `\n## Captions\n${script.captions}` : ''}
---
Generated by AdTool AI
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reel-script-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ title: t('reelScript.downloaded') });
  };

  const sendToCalendar = () => {
    if (script) {
      setShowScheduleModal(true);
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleScheduleSuccess = async () => {
    await emit({
      event_type: 'calendar.post.scheduled',
      source: 'reel_script_generator',
      payload: {
        platform,
        from_reel_script: true,
        script_id: scriptId,
      },
    }, { silent: true });

    setShowScheduleModal(false);
    toast({
      title: "Scheduled!",
      description: "Reel script added to your calendar",
    });
  };

  const sendToGenerator = () => {
    if (script) {
      navigate('/generator', { state: { caption: script.captions || script.hook } });
    }
  };

  const sendToPostGenerator = () => {
    if (script) {
      navigate('/ai-post-generator', { state: { description: idea } });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        {/* Hero Header */}
        <ReelScriptHeroHeader />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section - Glassmorphism */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="relative backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                       shadow-[0_0_40px_hsla(var(--primary)/0.08)]"
          >
            {/* Internal Glow */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 pointer-events-none" />
            
            <div className="relative space-y-5">
              {/* Card Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 
                                flex items-center justify-center shadow-[0_0_15px_hsla(var(--primary)/0.2)]">
                  <Video className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{t('reelScript.input_section')}</h2>
                  <p className="text-sm text-muted-foreground">{t('reelScript.input_description')}</p>
                </div>
              </div>

              {/* Idea Input */}
              <div className="space-y-2">
                <Label htmlFor="idea" className="text-sm font-medium">{t('reelScript.idea_label')}</Label>
                <Textarea
                  id="idea"
                  placeholder={t('reelScript.idea_placeholder')}
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  maxLength={1500}
                  rows={4}
                  className="bg-muted/20 border-white/10 focus:border-primary/60 
                             focus:ring-2 focus:ring-primary/20 resize-none"
                />
                <p className={`text-xs ${idea.length > 1500 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {idea.length}/1500 characters
                </p>
              </div>

              {/* Platform & Duration */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('reelScript.platform')}</Label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger className="bg-muted/20 border-white/10 focus:border-primary/60 
                                               focus:ring-2 focus:ring-primary/20 h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instagram">Instagram Reels</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                      <SelectItem value="youtube">YouTube Shorts</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('reelScript.duration')}</Label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger className="bg-muted/20 border-white/10 focus:border-primary/60 
                                               focus:ring-2 focus:ring-primary/20 h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15s</SelectItem>
                      <SelectItem value="30">30s</SelectItem>
                      <SelectItem value="45">45s</SelectItem>
                      <SelectItem value="60">60s</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tone & Language */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('reelScript.tone')}</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger className="bg-muted/20 border-white/10 focus:border-primary/60 
                                               focus:ring-2 focus:ring-primary/20 h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="friendly">{t('campaign_tone_friendly')}</SelectItem>
                      <SelectItem value="funny">Funny</SelectItem>
                      <SelectItem value="informative">Informative</SelectItem>
                      <SelectItem value="edgy">Edgy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('reelScript.language_label')}</Label>
                  <Select value={language} onValueChange={(val) => setLanguage(val as 'de' | 'en' | 'es')}>
                    <SelectTrigger className="bg-muted/20 border-white/10 focus:border-primary/60 
                                               focus:ring-2 focus:ring-primary/20 h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="de">🇩🇪 Deutsch</SelectItem>
                      <SelectItem value="en">🇬🇧 English</SelectItem>
                      <SelectItem value="es">🇪🇸 Español</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Brand Kit */}
              {brandKits.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('reelScript.brand_kit')}</Label>
                  <Select value={brandKitId} onValueChange={setBrandKitId}>
                    <SelectTrigger className="bg-muted/20 border-white/10 focus:border-primary/60 
                                               focus:ring-2 focus:ring-primary/20 h-11">
                      <SelectValue placeholder="Use default theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default (no brand kit)</SelectItem>
                      {brandKits.map((kit) => (
                        <SelectItem key={kit.id} value={kit.id}>
                          {kit.mood || 'Brand Kit'} - {kit.primary_color}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Generate Button with Shimmer */}
              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Button 
                  onClick={generateScript} 
                  disabled={loading || !idea.trim()}
                  className="w-full h-14 text-base font-semibold relative overflow-hidden group
                             bg-gradient-to-r from-primary to-primary/80
                             hover:shadow-[0_0_30px_hsla(var(--primary)/0.4)]
                             transition-all duration-300 disabled:opacity-50"
                  size="lg"
                >
                  {/* Shimmer Effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent 
                                  translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      {t('reelScript.generating')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5 mr-2" />
                      {t('reelScript.generate_button')}
                    </>
                  )}
                </Button>
              </motion.div>

              {userPlan === 'free' && (
                <p className="text-xs text-muted-foreground text-center">
                  {t('reelScript.free_limit')}
                </p>
              )}
            </div>
          </motion.div>

          {/* Output Section */}
          <div className="space-y-6">
            {!script ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="h-full flex items-center justify-center backdrop-blur-xl bg-card/60 
                           border border-white/10 rounded-2xl p-8
                           shadow-[0_0_40px_hsla(var(--primary)/0.05)]"
              >
                <div className="text-center py-12">
                  <div className="w-20 h-20 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-6">
                    <Video className="h-10 w-10 text-muted-foreground/50" />
                  </div>
                  <p className="text-lg text-muted-foreground mb-3">{t('reelScript.no_script')}</p>
                  <p className="text-sm text-muted-foreground/70 max-w-sm mx-auto">
                    {t('reelScript.empty_state_hint')}
                  </p>
                </div>
              </motion.div>
            ) : (
              <>
                {/* Fallback Warning Banner */}
                {isFallback && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="backdrop-blur-xl bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                      <p className="text-sm font-medium text-yellow-500">
                        {t('reelScript.fallback_banner')}
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Header with Hook and Meta */}
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                             shadow-[0_0_40px_hsla(var(--primary)/0.08)]"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.2, 1] }}
                      transition={{ duration: 0.5 }}
                      className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center
                                 shadow-[0_0_15px_hsla(142,76%,36%,0.2)]"
                    >
                      <CheckCircle2 className="h-5 w-5 text-green-400" />
                    </motion.div>
                    <h2 className="text-2xl font-bold">🎬 {script.hook}</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-primary/20 text-primary border-primary/30">{script.meta.platform}</Badge>
                    <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">{script.meta.durationSec}s</Badge>
                    <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">{script.meta.tone}</Badge>
                    <Badge className="bg-muted/50 text-muted-foreground">{script.meta.language.toUpperCase()}</Badge>
                  </div>
                </motion.div>

                {/* Beats Timeline */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                             shadow-[0_0_40px_hsla(var(--primary)/0.05)]"
                >
                  <h3 className="text-lg font-semibold mb-2">{t('reelScript.beats_timeline')}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{t('reelScript.beats_description')}</p>
                  
                  <div className="space-y-4">
                    {script.beats.map((beat, index) => (
                      <motion.div 
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 * index }}
                        className="border-l-4 border-primary pl-4 py-2"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="font-mono text-xs bg-muted/30">
                            {formatTime(beat.tStart)} - {formatTime(beat.tEnd)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Beat {index + 1}
                          </span>
                        </div>
                        
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              🎙️ {t('reelScript.voiceover')}:
                            </p>
                            <p className="text-sm">{beat.vo}</p>
                          </div>

                          <div className="bg-muted/30 rounded-lg p-3 border border-white/5">
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              📱 {t('reelScript.onscreen')}:
                            </p>
                            <p className="text-base font-semibold">{beat.onScreen}</p>
                          </div>

                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              📷 {t('reelScript.shot')}:
                            </p>
                            <p className="text-xs italic text-muted-foreground">{beat.shot}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                {/* CTA & B-Roll */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                             shadow-[0_0_40px_hsla(var(--primary)/0.05)]"
                >
                  <h3 className="text-lg font-semibold mb-4">{t('reelScript.cta_broll')}</h3>
                  
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-muted/20 border border-white/10">
                      <p className="text-sm font-medium text-primary mb-2">
                        {t('reelScript.call_to_action')}:
                      </p>
                      <p className="text-lg font-semibold">{script.cta}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">
                        {t('reelScript.broll_suggestions')}:
                      </p>
                      <ul className="list-disc list-inside space-y-1">
                        {script.brollSuggestions.map((suggestion, i) => (
                          <li key={i} className="text-sm text-muted-foreground">{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </motion.div>

                {/* Hashtags */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                             shadow-[0_0_40px_hsla(var(--primary)/0.05)]"
                >
                  <h3 className="text-lg font-semibold mb-4">{t('reelScript.hashtags')}</h3>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {script.hashtags.map((tag, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.05 * i }}
                      >
                        <Badge className="bg-primary/10 text-primary border-primary/20">{tag}</Badge>
                      </motion.div>
                    ))}
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={copyHashtags}
                    className="border-white/20 hover:bg-white/5 hover:border-primary/40"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {t('reelScript.copy_hashtags')}
                  </Button>
                </motion.div>

                {/* Copy Actions */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                             shadow-[0_0_40px_hsla(var(--primary)/0.05)]"
                >
                  <h3 className="text-lg font-semibold mb-4">{t('reelScript.copy_sections')}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" onClick={copyVoiceOver}
                            className="border-white/20 hover:bg-white/5 hover:border-primary/40">
                      <Copy className="h-4 w-4 mr-2" />
                      {t('reelScript.copy_vo')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={copyOnScreen}
                            className="border-white/20 hover:bg-white/5 hover:border-primary/40">
                      <Copy className="h-4 w-4 mr-2" />
                      {t('reelScript.copy_onscreen')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={copyShots}
                            className="border-white/20 hover:bg-white/5 hover:border-primary/40">
                      <Copy className="h-4 w-4 mr-2" />
                      {t('reelScript.copy_shots')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={downloadScript}
                            className="border-white/20 hover:bg-white/5 hover:border-primary/40">
                      <Download className="h-4 w-4 mr-2" />
                      {t('reelScript.download_txt')}
                    </Button>
                  </div>
                </motion.div>

                {/* Next Steps */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                             shadow-[0_0_40px_hsla(var(--primary)/0.05)]"
                >
                  <h3 className="text-lg font-semibold mb-4">{t('reelScript.next_steps')}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button 
                        size="sm" 
                        onClick={sendToCalendar}
                        className="w-full bg-gradient-to-r from-primary to-primary/80
                                   hover:shadow-[0_0_20px_hsla(var(--primary)/0.3)]"
                      >
                        <Calendar className="h-4 w-4 mr-2" />
                        {t('reelScript.send_to_calendar')}
                      </Button>
                    </motion.div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={sendToPostGenerator}
                      className="border-white/20 hover:bg-white/5 hover:border-primary/40"
                    >
                      <Image className="h-4 w-4 mr-2" />
                      {t('reelScript.send_to_post')}
                    </Button>
                  </div>
                </motion.div>
              </>
            )}
          </div>
        </div>
      </main>

      <Footer />

      {/* Schedule Modal */}
      {script && (
        <AddPostModal
          open={showScheduleModal}
          onClose={() => setShowScheduleModal(false)}
          onSave={handleScheduleSuccess}
          prefillCaption={script.hashtags.join(' ')}
          prefillPlatform={platform}
          prefillDate={prefillDate}
          suggestedTime={suggestedTime}
        />
      )}
    </div>
  );
}
