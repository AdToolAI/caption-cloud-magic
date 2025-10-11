import { useState } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Loader2, Copy, Sparkles, RefreshCw, ArrowRight, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const Rewriter = () => {
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [originalText, setOriginalText] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [selectedLanguage, setSelectedLanguage] = useState<string>(language);
  const [rewriteGoal, setRewriteGoal] = useState<string>("viral");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    rewritten: string;
    explanation: string;
    suggestions: string[];
  } | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const [userPlan, setUserPlan] = useState<string>("free");

  const maxChars = 1000;
  const freeLimit = 3;

  const checkUsage = async () => {
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    if (profile) {
      setUserPlan(profile.plan || 'free');
    }

    if (profile?.plan === 'free') {
      const today = new Date().toISOString().split('T')[0];
      const { data: rewrites } = await supabase
        .from('rewrites_history')
        .select('id')
        .eq('user_id', user.id)
        .gte('created_at', `${today}T00:00:00.000Z`)
        .lte('created_at', `${today}T23:59:59.999Z`);

      setUsageCount(rewrites?.length || 0);
    }
  };

  const handleRewrite = async () => {
    if (!user) {
      toast({
        title: t('error_auth'),
        description: t('error_login_required'),
        variant: "destructive",
      });
      navigate('/auth');
      return;
    }

    if (!originalText.trim()) {
      toast({
        title: t('error_title'),
        description: t('rewriter_error_empty'),
        variant: "destructive",
      });
      return;
    }

    await checkUsage();

    if (userPlan === 'free' && usageCount >= freeLimit) {
      toast({
        title: t('rewriter_limit_title'),
        description: t('rewriter_limit_message'),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('rewrite-caption', {
        body: {
          text: originalText,
          platform,
          language: selectedLanguage,
          rewriteGoal
        }
      });

      if (error) throw error;

      if (data.limit_reached) {
        toast({
          title: t('rewriter_limit_title'),
          description: t('rewriter_limit_message'),
          variant: "destructive",
        });
        return;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setResult(data);
      setUsageCount(prev => prev + 1);
      
      toast({
        title: t('success_title'),
        description: t('rewriter_success'),
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: t('error_title'),
        description: error instanceof Error ? error.message : t('rewriter_error_generic'),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('success_title'),
      description: t('copied_to_clipboard'),
    });
  };

  const useInGenerator = () => {
    if (result?.rewritten) {
      navigate(`/generator?prefill=${encodeURIComponent(result.rewritten)}`);
    }
  };

  const rewriteGoals = [
    { value: "viral", label: t('rewriter_goal_viral'), icon: "🚀" },
    { value: "emotional", label: t('rewriter_goal_emotional'), icon: "❤️" },
    { value: "professional", label: t('rewriter_goal_professional'), icon: "💼", isPro: userPlan === 'free' },
    { value: "simplify", label: t('rewriter_goal_simplify'), icon: "✨", isPro: userPlan === 'free' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              {t('rewriter_title')}
            </h1>
            <p className="text-muted-foreground text-lg">
              {t('rewriter_subtitle')}
            </p>
            {userPlan === 'free' && (
              <p className="text-sm text-muted-foreground mt-2">
                {t('rewriter_usage_counter', { count: usageCount, limit: freeLimit })}
              </p>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Left Panel - Input */}
            <Card className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  {t('rewriter_original_caption')}
                </label>
                <div className="relative">
                  <Textarea
                    value={originalText}
                    onChange={(e) => setOriginalText(e.target.value.slice(0, maxChars))}
                    placeholder={t('rewriter_placeholder')}
                    className="min-h-[200px] resize-none"
                    maxLength={maxChars}
                  />
                  <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
                    {originalText.length}/{maxChars}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {t('platform')}
                  </label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger>
                      <SelectValue />
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

                <div>
                  <label className="block text-sm font-medium mb-2">
                    {t('language')}
                  </label>
                  <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <TooltipProvider>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-sm font-medium">
                      {t('rewriter_goal_label')}
                    </label>
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="text-xs text-muted-foreground cursor-help">ℹ️</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('rewriter_goal_tooltip')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>

                <div className="grid grid-cols-2 gap-2">
                  {rewriteGoals.map((goal) => (
                    <TooltipProvider key={goal.value}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={rewriteGoal === goal.value ? "default" : "outline"}
                            className="justify-start"
                            onClick={() => !goal.isPro && setRewriteGoal(goal.value)}
                            disabled={goal.isPro}
                          >
                            <span className="mr-2">{goal.icon}</span>
                            {goal.label}
                            {goal.isPro && <Lock className="ml-auto h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        {goal.isPro && (
                          <TooltipContent>
                            <p>{t('rewriter_pro_feature')}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleRewrite}
                disabled={isLoading || !originalText.trim()}
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('generating')}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {t('rewriter_button')}
                  </>
                )}
              </Button>
            </Card>

            {/* Right Panel - Output */}
            <Card className="p-6">
              {!result && !isLoading && (
                <div className="h-full flex items-center justify-center text-center text-muted-foreground">
                  <div>
                    <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>{t('rewriter_empty_state')}</p>
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium">{t('rewriter_result_title')}</h3>
                      <span className="text-xs text-muted-foreground">
                        {result.rewritten.length} {t('characters')}
                      </span>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap">
                      {result.rewritten}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(result.rewritten)}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        {t('copy')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={useInGenerator}
                      >
                        <ArrowRight className="h-4 w-4 mr-2" />
                        {t('rewriter_use_in_generator')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRewrite}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t('regenerate')}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium mb-2">{t('rewriter_why_works')}</h3>
                    <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap">
                      {result.explanation}
                    </div>
                  </div>

                  {result.suggestions && result.suggestions.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium mb-2">{t('rewriter_suggestions')}</h3>
                      <ul className="space-y-2">
                        {result.suggestions.map((suggestion, index) => (
                          <li key={index} className="text-sm text-muted-foreground flex items-start">
                            <span className="mr-2">•</span>
                            {suggestion}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Rewriter;