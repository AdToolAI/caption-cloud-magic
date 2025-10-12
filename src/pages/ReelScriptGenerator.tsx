import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Video, Sparkles, Calendar, Image, Loader2, Download, Copy } from "lucide-react";
import { AddPostModal } from "@/components/calendar/AddPostModal";
import { getNextSuggestedTime, getSuggestedDate } from "@/lib/suggestedTimes";

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
  const [brandKitId, setBrandKitId] = useState<string>("");
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

      // Fetch profile for plan
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .single();

      if (profile) {
        setUserPlan(profile.plan || 'free');
      }

      // Fetch brand kits
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

        // Nur hinzufügen wenn vorhanden
        if (brandKitId) {
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
        // Retry once on 429
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

      // Calculate suggested time and date
      const suggestedTimeObj = getNextSuggestedTime(platform);
      setSuggestedTime(suggestedTimeObj.time);
      
      const dateForTime = getSuggestedDate(suggestedTimeObj.time);
      setPrefillDate(dateForTime);

      // Emit event
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
Generated by CaptionGenie
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
        <div className="flex items-center gap-2 mb-2">
          <Video className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold">{t('reelScript.title')}</h1>
        </div>
        <p className="text-muted-foreground mb-8">{t('reelScript.subtitle')}</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <Card>
            <CardHeader>
              <CardTitle>{t('reelScript.input_section')}</CardTitle>
              <CardDescription>{t('reelScript.input_description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="idea">{t('reelScript.idea_label')}</Label>
                <Textarea
                  id="idea"
                  placeholder={t('reelScript.idea_placeholder')}
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  maxLength={1500}
                  rows={4}
                  className="mt-2"
                />
                <p className={`text-xs mt-1 ${idea.length > 1500 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {idea.length}/1500 characters
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('reelScript.platform')}</Label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instagram">Instagram Reels</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                      <SelectItem value="youtube">YouTube Shorts</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>{t('reelScript.duration')}</Label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger className="mt-2">
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('reelScript.tone')}</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger className="mt-2">
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

                <div>
                  <Label>{t('reelScript.language_label')}</Label>
                  <Select value={language} onValueChange={(val) => setLanguage(val as 'de' | 'en' | 'es')}>
                    <SelectTrigger className="mt-2">
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

              {brandKits.length > 0 && (
                <div>
                  <Label>{t('reelScript.brand_kit')}</Label>
                  <Select value={brandKitId} onValueChange={setBrandKitId}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Use default theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Default (no brand kit)</SelectItem>
                      {brandKits.map((kit) => (
                        <SelectItem key={kit.id} value={kit.id}>
                          {kit.mood || 'Brand Kit'} - {kit.primary_color}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button 
                onClick={generateScript} 
                disabled={loading || !idea.trim()}
                className="w-full"
                size="lg"
              >
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

              {userPlan === 'free' && (
                <p className="text-xs text-muted-foreground text-center">
                  {t('reelScript.free_limit')}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Output Section */}
          <div className="space-y-6">
            {!script ? (
              <Card className="h-full flex items-center justify-center">
                <CardContent className="text-center py-12">
                  <Video className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">{t('reelScript.no_script')}</p>
                  <p className="text-xs text-muted-foreground max-w-md">
                    {t('reelScript.empty_state_hint')}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Fallback Warning Banner */}
                {isFallback && (
                  <Card className="border-warning bg-warning/10">
                    <CardContent className="py-4">
                      <p className="text-sm font-medium text-warning-foreground">
                        ⚠️ {t('reelScript.fallback_banner')}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Header with Hook and Meta */}
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-2xl mb-2">🎬 {script.hook}</CardTitle>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{script.meta.platform}</Badge>
                          <Badge variant="secondary">{script.meta.durationSec}s</Badge>
                          <Badge variant="secondary">{script.meta.tone}</Badge>
                          <Badge variant="secondary">{script.meta.language.toUpperCase()}</Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                {/* Beats Timeline */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('reelScript.beats_timeline')}</CardTitle>
                    <CardDescription>{t('reelScript.beats_description')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {script.beats.map((beat, index) => (
                        <div key={index} className="border-l-4 border-primary pl-4 py-2">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="font-mono text-xs">
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

                            <div className="bg-muted/50 rounded p-2">
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                📱 {t('reelScript.onscreen')}:
                              </p>
                              <p className="text-base font-semibold">{beat.onScreen}</p>
                            </div>

                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                📷 {t('reelScript.shot')}:
                              </p>
                              <p className="text-xs italic">{beat.shot}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* CTA & B-Roll */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('reelScript.cta_broll')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">
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
                          <li key={i} className="text-sm">{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>

                {/* Hashtags */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('reelScript.hashtags')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {script.hashtags.map((tag, i) => (
                        <Badge key={i} variant="secondary">{tag}</Badge>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" onClick={copyHashtags}>
                      <Copy className="h-4 w-4 mr-2" />
                      {t('reelScript.copy_hashtags')}
                    </Button>
                  </CardContent>
                </Card>

                {/* Copy Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('reelScript.copy_sections')}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" onClick={copyVoiceOver}>
                      <Copy className="h-4 w-4 mr-2" />
                      {t('reelScript.copy_vo')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={copyOnScreen}>
                      <Copy className="h-4 w-4 mr-2" />
                      {t('reelScript.copy_onscreen')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={copyShots}>
                      <Copy className="h-4 w-4 mr-2" />
                      {t('reelScript.copy_shots')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={downloadScript}>
                      <Download className="h-4 w-4 mr-2" />
                      {t('reelScript.download_txt')}
                    </Button>
                  </CardContent>
                </Card>

                {/* Next Steps */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('reelScript.next_steps')}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" onClick={sendToCalendar}>
                      <Calendar className="h-4 w-4 mr-2" />
                      {t('reelScript.send_to_calendar')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={sendToPostGenerator}>
                      <Image className="h-4 w-4 mr-2" />
                      {t('reelScript.send_to_post')}
                    </Button>
                  </CardContent>
                </Card>
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
