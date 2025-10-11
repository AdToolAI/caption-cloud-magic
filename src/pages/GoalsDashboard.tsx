import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Target, TrendingUp, Calendar, Sparkles, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

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

const GoalsDashboard = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { emit } = useEventEmitter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [userPlan, setUserPlan] = useState<string>("free");
  const [aiInsights, setAiInsights] = useState<Record<string, AIInsight>>({});
  
  // Form state
  const [platform, setPlatform] = useState("Instagram");
  const [goalType, setGoalType] = useState("posts_per_month");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("posts");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    checkAuthAndLoadData();
  }, []);

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
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2 flex items-center gap-2">
            <Target className="h-8 w-8 text-primary" />
            {t('goals.title')}
          </h1>
          <p className="text-muted-foreground">{t('goals.subtitle')}</p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('goals.activeGoals')}</p>
                <p className="text-3xl font-bold text-primary">{activeGoals.length}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-primary" />
            </div>
          </Card>
          
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('goals.completed')}</p>
                <p className="text-3xl font-bold text-green-600">{completedGoals.length}</p>
              </div>
              <Sparkles className="h-8 w-8 text-green-600" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('goals.avgProgress')}</p>
                <p className="text-3xl font-bold text-foreground">
                  {activeGoals.length > 0 
                    ? Math.round(activeGoals.reduce((sum, g) => sum + g.progress_percent, 0) / activeGoals.length)
                    : 0}%
                </p>
              </div>
              <Calendar className="h-8 w-8 text-foreground" />
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

        {/* Goals Tabs */}
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="active">{t('goals.active')}</TabsTrigger>
            <TabsTrigger value="completed">{t('goals.completed')}</TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {activeGoals.length === 0 ? (
              <Card className="p-8 text-center">
                <Target className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">{t('goals.noActiveGoals')}</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {activeGoals.map((goal) => (
                  <Card key={goal.id} className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">{getGoalTypeLabel(goal.goal_type)}</h3>
                        <p className="text-sm text-muted-foreground">{goal.platform}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteGoal(goal.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-2">
                        <span>{goal.current_value} / {goal.target_value} {goal.unit}</span>
                        <span className="font-semibold">{Math.round(goal.progress_percent)}%</span>
                      </div>
                      <Progress value={goal.progress_percent} className="h-3" />
                    </div>

                    {goal.end_date && (
                      <p className="text-xs text-muted-foreground mb-3">
                        {t('goals.deadline')}: {new Date(goal.end_date).toLocaleDateString()}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder={t('goals.updateValue')}
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
                      <div className="mt-4 p-3 bg-primary/10 rounded-lg">
                        <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          {t('goals.aiInsight')}
                        </p>
                        <p className="text-xs text-foreground mb-2">{aiInsights[goal.id].estimate}</p>
                        <p className="text-xs text-muted-foreground">{aiInsights[goal.id].tip}</p>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed">
            {completedGoals.length === 0 ? (
              <Card className="p-8 text-center">
                <Sparkles className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">{t('goals.noCompletedGoals')}</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {completedGoals.map((goal) => (
                  <Card key={goal.id} className="p-6 border-green-500">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">{getGoalTypeLabel(goal.goal_type)}</h3>
                        <p className="text-sm text-muted-foreground">{goal.platform}</p>
                      </div>
                      <div className="text-2xl">🎉</div>
                    </div>
                    <div className="mb-2">
                      <p className="text-sm text-green-600 font-semibold">{t('goals.completed')}</p>
                      <p className="text-xs text-muted-foreground">
                        {goal.current_value} / {goal.target_value} {goal.unit}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Motivation Banner */}
        <Card className="mt-8 p-6 bg-gradient-to-r from-primary/10 to-primary/5">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <p className="text-foreground font-medium">{t('goals.motivationBanner')}</p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default GoalsDashboard;
