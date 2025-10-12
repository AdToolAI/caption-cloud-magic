import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { useGoalCompletionListener } from "@/hooks/useGoalCompletionListener";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Target, TrendingUp, Calendar, Sparkles, Trash2, Eye, Heart, MessageCircle, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GoalPerformanceCharts } from "@/components/goals/GoalPerformanceCharts";
import { ContentMetricsTable } from "@/components/goals/ContentMetricsTable";
import { AIRecommendationsPanel } from "@/components/goals/AIRecommendationsPanel";
import { AchievementBadges } from "@/components/goals/AchievementBadges";

interface Goal {
  id: string;
  platform: string;
  goal_type: string;
  target_value: number;
  unit: string;
  start_date: string;
  end_date: string | null;
  current_value: number;
  progress_percent: number;
  ai_estimate: string | null;
  status: string;
}

interface AIInsight {
  estimate: string;
  motivation: string;
  tip: string;
}

interface DashboardSummary {
  progress: {
    active: number;
    completed: number;
    avgProgress: number;
    status: string;
  };
  metrics: {
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalEngagement: number;
    avgEngagementRate: number;
    postsCount: number;
  };
  trends: {
    engagementTrend: number;
    bestHours: string[];
  };
  topPerformers: any[];
  recommendations: any[];
  achievements: any;
}

const GoalsDashboard = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { emit } = useEventEmitter();
  
  // Listen for goal completion events
  useGoalCompletionListener();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [userPlan, setUserPlan] = useState<string>("free");
  const [aiInsights, setAiInsights] = useState<Record<string, AIInsight>>({});
  const [dashboardData, setDashboardData] = useState<DashboardSummary | null>(null);
  const [timeframe, setTimeframe] = useState('30');
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  
  // Form state
  const [platform, setPlatform] = useState("Instagram");
  const [goalType, setGoalType] = useState("posts_per_month");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("posts");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    checkAuthAndLoadData();
  }, []);

  useEffect(() => {
    if (userPlan) {
      loadDashboardSummary();
    }
  }, [timeframe, platformFilter, userPlan]);

  const checkAuthAndLoadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate('/auth');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();
    
    if (profile) {
      setUserPlan(profile.plan || 'free');
    }

    loadGoals();
  };

  const loadGoals = async () => {
    try {
      const { data, error } = await supabase
        .from('social_goals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGoals(data || []);
      
      // Load AI insights for Pro users
      if (userPlan === 'pro') {
        data?.forEach(goal => {
          if (goal.status === 'active') {
            fetchAIInsight(goal);
          }
        });
      }
    } catch (error) {
      console.error('Error loading goals:', error);
      toast({
        title: t('goals.error'),
        description: t('goals.loadError'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDashboardSummary = async () => {
    try {
      let url = `dashboard-goals-summary?timeframe=${timeframe}`;
      if (platformFilter) {
        url += `&platform=${platformFilter}`;
      }

      const { data, error } = await supabase.functions.invoke(url);

      if (error) throw error;
      setDashboardData(data);
    } catch (error) {
      console.error('Error loading dashboard summary:', error);
    }
  };

  const fetchAIInsight = async (goal: Goal) => {
    try {
      const { data, error } = await supabase.functions.invoke('analyze-goal-progress', {
        body: {
          goalType: goal.goal_type,
          platform: goal.platform,
          targetValue: goal.target_value,
          currentValue: goal.current_value,
          postingFrequency: goal.goal_type === 'posts_per_month' ? goal.target_value : null,
          language: 'en'
        }
      });

      if (error) throw error;
      
      setAiInsights(prev => ({
        ...prev,
        [goal.id]: data
      }));
    } catch (error) {
      console.error('Error fetching AI insight:', error);
    }
  };

  const createGoal = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check limits for free users
    if (userPlan === 'free' && goals.filter(g => g.status === 'active').length >= 2) {
      toast({
        title: t('goals.limitReached'),
        description: t('goals.upgradeForMore'),
        variant: "destructive",
      });
      return;
    }

    if (!targetValue) {
      toast({
        title: t('goals.error'),
        description: t('goals.fillAllFields'),
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.from('social_goals').insert([{
        user_id: user.id,
        platform,
        goal_type: goalType as any,
        target_value: parseFloat(targetValue),
        unit,
        end_date: endDate || null,
        current_value: 0,
        progress_percent: 0
      }]);

      if (error) throw error;

      // Emit event for goal creation
      await emit({
        event_type: 'goal.created',
        source: 'goals_dashboard',
        payload: {
          platform,
          goal_type: goalType,
          target_value: parseFloat(targetValue),
        },
      }, { silent: true });

      toast({
        title: t('goals.success'),
        description: t('goals.goalCreated'),
      });

      setDialogOpen(false);
      resetForm();
      loadGoals();
    } catch (error) {
      console.error('Error creating goal:', error);
      toast({
        title: t('goals.error'),
        description: t('goals.createError'),
        variant: "destructive",
      });
    }
  };

  const deleteGoal = async (goalId: string) => {
    try {
      const { error } = await supabase
        .from('social_goals')
        .delete()
        .eq('id', goalId);

      if (error) throw error;

      toast({
        title: t('goals.success'),
        description: t('goals.goalDeleted'),
      });

      loadGoals();
    } catch (error) {
      console.error('Error deleting goal:', error);
      toast({
        title: t('goals.error'),
        description: t('goals.deleteError'),
        variant: "destructive",
      });
    }
  };

  const updateProgress = async (goalId: string, newValue: number) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    const progressPercent = Math.min((newValue / goal.target_value) * 100, 100);
    const newStatus = progressPercent >= 100 ? 'completed' : 'active';

    try {
      const { error } = await supabase
        .from('social_goals')
        .update({
          current_value: newValue,
          progress_percent: progressPercent,
          status: newStatus
        })
        .eq('id', goalId);

      if (error) throw error;

      if (newStatus === 'completed') {
        toast({
          title: "🎉 " + t('goals.goalCompleted'),
          description: t('goals.congratulations'),
        });
      }

      loadGoals();
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };

  const resetForm = () => {
    setPlatform("Instagram");
    setGoalType("posts_per_month");
    setTargetValue("");
    setUnit("posts");
    setEndDate("");
  };

  const getGoalTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      followers: t('goals.types.followers'),
      posts_per_month: t('goals.types.postsPerMonth'),
      engagement_rate: t('goals.types.engagementRate'),
      content_created: t('goals.types.contentCreated'),
      revenue: t('goals.types.revenue')
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const activeGoals = goals.filter(g => g.status === 'active');
  const completedGoals = goals.filter(g => g.status === 'completed');

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header with improved typography */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-foreground mb-3 flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
              <Target className="h-6 w-6 text-primary" />
            </div>
            {t('goals.title')}
          </h1>
          <p className="text-lg text-muted-foreground">{t('goals.subtitle')}</p>
        </div>

        {/* Professional Filters Card */}
        <Card className="p-6 mb-6 bg-gradient-to-br from-card to-card/50 border-border/50 shadow-sm">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <Filter className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">{t('goals.filters.timeframe')}</span>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger className="w-36 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">{t('goals.filters.7days')}</SelectItem>
                  <SelectItem value="30">{t('goals.filters.30days')}</SelectItem>
                  <SelectItem value="90">{t('goals.filters.90days')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-foreground">{t('goals.filters.platform')}</span>
              <Select value={platformFilter || 'all'} onValueChange={(v) => setPlatformFilter(v === 'all' ? null : v)}>
                <SelectTrigger className="w-40 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('goals.filters.all')}</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Professional KPI Cards with Gradient Backgrounds */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="p-6 bg-gradient-to-br from-blue-500/5 to-blue-500/10 border-blue-500/20 hover:shadow-lg transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t('goals.kpi.totalViews')}</p>
                <p className="text-3xl font-bold text-foreground">
                  {dashboardData?.metrics.totalViews.toLocaleString() || 0}
                </p>
              </div>
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-blue-500/10">
                <Eye className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-red-500/5 to-red-500/10 border-red-500/20 hover:shadow-lg transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t('goals.kpi.totalLikes')}</p>
                <p className="text-3xl font-bold text-foreground">
                  {dashboardData?.metrics.totalLikes.toLocaleString() || 0}
                </p>
              </div>
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-red-500/10">
                <Heart className="h-6 w-6 text-red-500" />
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-purple-500/5 to-purple-500/10 border-purple-500/20 hover:shadow-lg transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t('goals.kpi.totalComments')}</p>
                <p className="text-3xl font-bold text-foreground">
                  {dashboardData?.metrics.totalComments.toLocaleString() || 0}
                </p>
              </div>
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-purple-500/10">
                <MessageCircle className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/20 hover:shadow-lg transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t('goals.kpi.avgEngagement')}</p>
                <p className="text-3xl font-bold text-primary">
                  {dashboardData?.metrics.avgEngagementRate.toFixed(2) || 0}%
                </p>
              </div>
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-green-500/10">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </Card>
        </div>

        {/* Achievements */}
        {dashboardData?.achievements && (
          <div className="mb-8">
            <AchievementBadges achievements={dashboardData.achievements} />
          </div>
        )}

        {/* Performance Charts */}
        {dashboardData?.topPerformers && dashboardData.topPerformers.length > 0 && (
          <div className="mb-8">
            <GoalPerformanceCharts 
              metrics={dashboardData.topPerformers} 
              timeframe={parseInt(timeframe)}
            />
          </div>
        )}

        {/* Two-Column Layout: Metrics Table + AI Recommendations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <ContentMetricsTable 
              metrics={dashboardData?.topPerformers || []}
              onMetricsSaved={loadDashboardSummary}
            />
          </div>
          
          <div>
            {dashboardData?.recommendations && dashboardData?.trends && (
              <AIRecommendationsPanel
                recommendations={dashboardData.recommendations}
                trends={dashboardData.trends}
              />
            )}
          </div>
        </div>

        {/* Goals Summary Stats with Professional Design */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20 hover:shadow-lg transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t('goals.activeGoals')}</p>
                <p className="text-4xl font-bold text-primary">{activeGoals.length}</p>
              </div>
              <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10">
                <TrendingUp className="h-7 w-7 text-primary" />
              </div>
            </div>
          </Card>
          
          <Card className="p-6 bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/20 hover:shadow-lg transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t('goals.completed')}</p>
                <p className="text-4xl font-bold text-green-600">{completedGoals.length}</p>
              </div>
              <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-green-500/10">
                <Sparkles className="h-7 w-7 text-green-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-border/50 hover:shadow-lg transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t('goals.avgProgress')}</p>
                <p className="text-4xl font-bold text-foreground">
                  {activeGoals.length > 0 
                    ? Math.round(activeGoals.reduce((sum, g) => sum + g.progress_percent, 0) / activeGoals.length)
                    : 0}%
                </p>
              </div>
              <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-muted">
                <Calendar className="h-7 w-7 text-foreground" />
              </div>
            </div>
          </Card>
        </div>

        {/* Add Goal Button */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="mb-6">
              <Plus className="mr-2 h-4 w-4" />
              {t('goals.addGoal')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('goals.createNewGoal')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>{t('goals.platform')}</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Instagram">Instagram</SelectItem>
                    <SelectItem value="TikTok">TikTok</SelectItem>
                    <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                    <SelectItem value="Facebook">Facebook</SelectItem>
                    <SelectItem value="X">X (Twitter)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('goals.goalType')}</Label>
                <Select value={goalType} onValueChange={(val) => {
                  setGoalType(val);
                  const units: Record<string, string> = {
                    followers: 'followers',
                    posts_per_month: 'posts',
                    engagement_rate: '%',
                    content_created: 'pieces',
                    revenue: '€'
                  };
                  setUnit(units[val] || 'units');
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="followers">{t('goals.types.followers')}</SelectItem>
                    <SelectItem value="posts_per_month">{t('goals.types.postsPerMonth')}</SelectItem>
                    <SelectItem value="engagement_rate">{t('goals.types.engagementRate')}</SelectItem>
                    <SelectItem value="content_created">{t('goals.types.contentCreated')}</SelectItem>
                    <SelectItem value="revenue">{t('goals.types.revenue')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('goals.targetValue')}</Label>
                <Input
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder="100"
                />
              </div>

              <div>
                <Label>{t('goals.endDate')} ({t('goals.optional')})</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <Button onClick={createGoal} className="w-full">
                {t('goals.createGoal')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Professional Tabs Design */}
        <Tabs defaultValue="active" className="w-full">
          <div className="flex items-center justify-between mb-6">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="active" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                {t('goals.active')}
              </TabsTrigger>
              <TabsTrigger value="completed" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                {t('goals.completedTab')}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="active">
            {activeGoals.length === 0 ? (
              <Card className="p-12 text-center bg-gradient-to-br from-muted/30 to-muted/10">
                <div className="flex items-center justify-center w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10">
                  <Target className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {t('goals.noActiveGoals')}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {t('goals.motivationBanner')}
                </p>
                <Button onClick={() => setDialogOpen(true)} size="lg" className="shadow-lg">
                  <Plus className="mr-2 h-5 w-5" />
                  {t('goals.addGoal')}
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {activeGoals.map((goal) => (
                  <Card key={goal.id} className="p-6 hover:shadow-lg transition-all bg-gradient-to-br from-card to-card/50">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-foreground mb-1">{getGoalTypeLabel(goal.goal_type)}</h3>
                        <p className="text-sm font-medium text-primary">{goal.platform}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteGoal(goal.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium text-foreground">
                          {goal.current_value} / {goal.target_value} {goal.unit}
                        </span>
                        <span className="font-bold text-primary">{Math.round(goal.progress_percent)}%</span>
                      </div>
                      <Progress value={goal.progress_percent} className="h-2.5" />
                    </div>

                    {goal.end_date && (
                      <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {t('goals.deadline')}: {new Date(goal.end_date).toLocaleDateString()}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder={t('goals.updateValue')}
                        className="bg-background"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.target as HTMLInputElement;
                            updateProgress(goal.id, parseFloat(input.value));
                            input.value = '';
                          }
                        }}
                      />
                    </div>

                    {userPlan === 'pro' && aiInsights[goal.id] && (
                      <div className="mt-4 p-4 bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg border border-primary/20">
                        <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5" />
                          {t('goals.aiInsight')}
                        </p>
                        <p className="text-xs text-foreground mb-2 leading-relaxed">{aiInsights[goal.id].estimate}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{aiInsights[goal.id].tip}</p>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed">
            {completedGoals.length === 0 ? (
              <Card className="p-12 text-center bg-gradient-to-br from-muted/30 to-muted/10">
                <div className="flex items-center justify-center w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/10">
                  <Sparkles className="h-10 w-10 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {t('goals.noCompletedGoals')}
                </h3>
                <p className="text-muted-foreground">
                  {t('goals.motivationBanner')}
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {completedGoals.map((goal) => (
                  <Card key={goal.id} className="p-6 bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/20">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-semibold text-foreground">{getGoalTypeLabel(goal.goal_type)}</h3>
                          <span className="text-xl">🎉</span>
                        </div>
                        <p className="text-sm font-medium text-green-600">{goal.platform}</p>
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium text-foreground">
                          {goal.current_value} / {goal.target_value} {goal.unit}
                        </span>
                        <span className="font-bold text-green-600">100%</span>
                      </div>
                      <Progress value={100} className="h-2.5 bg-green-500/20" />
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {t('goals.goalCompleted')}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Motivation Banner */}
        <Card className="mt-8 p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <p className="text-foreground font-semibold">{t('goals.motivationBanner')}</p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default GoalsDashboard;
