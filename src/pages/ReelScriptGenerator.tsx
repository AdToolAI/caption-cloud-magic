import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
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

interface Scene {
  scene_number: number;
  description: string;
  text_overlay: string;
  emotion: string;
  camera_tip: string;
}

interface ReelScript {
  title: string;
  hook: string;
  scenes: Scene[];
  cta: string;
  music_tone: string;
  caption: string;
}

export default function ReelScriptGenerator() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [idea, setIdea] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [tone, setTone] = useState("friendly");
  const [duration, setDuration] = useState("medium");
  const [brandKitId, setBrandKitId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState<ReelScript | null>(null);
  const [scriptId, setScriptId] = useState<string>("");
  const [brandKits, setBrandKits] = useState<any[]>([]);
  const [userPlan, setUserPlan] = useState<string>("free");

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
    if (!idea.trim()) {
      toast({
        title: "Idea required",
        description: "Please enter your video idea or caption",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please log in to generate scripts",
          variant: "destructive",
        });
        navigate('/auth');
        return;
      }

      const { data, error } = await supabase.functions.invoke('generate-reel-script', {
        body: {
          idea,
          platform,
          tone,
          duration,
          language: 'en',
          brand_kit_id: brandKitId || null,
        }
      });

      if (error) {
        if (error.message?.includes('Daily limit')) {
          toast({
            title: t('reelScript.limit_reached'),
            description: t('reelScript.upgrade_message'),
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      setScript(data.script);
      setScriptId(data.id);
      toast({
        title: "Script generated!",
        description: `Created ${data.script.scenes.length} scenes`,
      });
    } catch (error) {
      console.error('Error generating script:', error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyCaption = () => {
    if (script?.caption) {
      navigator.clipboard.writeText(script.caption);
      toast({ title: "Caption copied to clipboard" });
    }
  };

  const sendToCalendar = () => {
    if (script) {
      navigate('/calendar', { state: { scriptTitle: script.title } });
    }
  };

  const sendToGenerator = () => {
    if (script) {
      navigate('/generator', { state: { caption: script.caption } });
    }
  };

  const sendToPostGenerator = () => {
    if (script) {
      navigate('/ai-post-generator', { state: { description: idea } });
    }
  };

  const getEmotionColor = (emotion: string) => {
    const lower = emotion.toLowerCase();
    if (lower.includes('energetic') || lower.includes('excited')) return 'bg-orange-500';
    if (lower.includes('calm') || lower.includes('peaceful')) return 'bg-blue-500';
    if (lower.includes('funny') || lower.includes('playful')) return 'bg-yellow-500';
    if (lower.includes('emotional')) return 'bg-purple-500';
    return 'bg-primary';
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
                  maxLength={500}
                  rows={4}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {idea.length}/500 characters
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
                      <SelectItem value="short">15s (Short)</SelectItem>
                      <SelectItem value="medium">30s (Medium)</SelectItem>
                      <SelectItem value="long">60s (Long)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>{t('reelScript.tone')}</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">{t('campaign_tone_friendly')}</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="funny">Funny</SelectItem>
                    <SelectItem value="emotional">{t('campaign_tone_emotional')}</SelectItem>
                    <SelectItem value="motivational">Motivational</SelectItem>
                  </SelectContent>
                </Select>
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
                  <p className="text-muted-foreground">{t('reelScript.no_script')}</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Title & Hook */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl">{script.title}</CardTitle>
                    <CardDescription className="text-lg font-medium">
                      🎬 {script.hook}
                    </CardDescription>
                  </CardHeader>
                </Card>

                {/* Scenes */}
                <div className="space-y-4">
                  {script.scenes.map((scene) => (
                    <Card key={scene.scene_number}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg flex items-center gap-2">
                              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                                {scene.scene_number}
                              </span>
                              Scene {scene.scene_number}
                            </CardTitle>
                            <CardDescription className="mt-2">
                              {scene.description}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-sm font-medium mb-1">Text Overlay:</p>
                          <p className="text-lg font-semibold">{scene.text_overlay}</p>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                          <Badge className={`${getEmotionColor(scene.emotion)} text-white border-0`}>
                            {scene.emotion}
                          </Badge>
                        </div>

                        <div className="border-t pt-3">
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            📷 Camera Tip:
                          </p>
                          <p className="text-sm">{scene.camera_tip}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* CTA & Music */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Ending & Music</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">
                        Call-to-Action:
                      </p>
                      <p className="text-lg font-semibold">{script.cta}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">
                        Music Tone:
                      </p>
                      <Badge variant="outline">{script.music_tone}</Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Caption */}
                {script.caption && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t('reelScript.caption')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm mb-3">{script.caption}</p>
                      <Button size="sm" variant="outline" onClick={copyCaption}>
                        <Copy className="h-4 w-4 mr-2" />
                        {t('reelScript.copy_caption')}
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Action Buttons */}
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
                    {userPlan === 'pro' && (
                      <Button size="sm" variant="outline" className="col-span-2">
                        <Download className="h-4 w-4 mr-2" />
                        {t('reelScript.export_pdf')}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
