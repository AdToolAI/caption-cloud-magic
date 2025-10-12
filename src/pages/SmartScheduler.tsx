import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, Repeat, Plus, Trash2, List } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { QueueManagement } from "@/components/scheduler/QueueManagement";

export default function SmartScheduler() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [recurringPosts, setRecurringPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    caption: "",
    platform: "instagram",
    frequency: "weekly",
    nextScheduledTime: "",
  });

  useEffect(() => {
    if (user) {
      loadRecurringPosts();
    }
  }, [user]);

  const loadRecurringPosts = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('recurring_posts')
      .select('*')
      .order('created_at', { ascending: false });
    
    setRecurringPosts(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('recurring_posts')
        .insert([{
          user_id: user.id,
          title: formData.title,
          caption: formData.caption,
          platform: formData.platform,
          frequency: formData.frequency,
          next_scheduled_time: formData.nextScheduledTime,
        }]);

      if (error) throw error;

      toast({
        title: t('scheduler.postCreated'),
        description: t('scheduler.postCreatedDescription'),
      });

      setShowForm(false);
      setFormData({
        title: "",
        caption: "",
        platform: "instagram",
        frequency: "weekly",
        nextScheduledTime: "",
      });
      loadRecurringPosts();
    } catch (error) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('recurring_posts')
        .update({ is_active: !isActive })
        .eq('id', id);

      if (error) throw error;

      loadRecurringPosts();
      toast({
        title: t('scheduler.updated'),
        description: t('scheduler.statusUpdated'),
      });
    } catch (error) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const deletePost = async (id: string) => {
    try {
      const { error } = await supabase
        .from('recurring_posts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      loadRecurringPosts();
      toast({
        title: t('scheduler.deleted'),
        description: t('scheduler.postDeleted'),
      });
    } catch (error) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">{t('scheduler.title')}</h1>
          <p className="text-muted-foreground">{t('scheduler.subtitle')}</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('scheduler.createRecurring')}
        </Button>
      </div>

      <Tabs defaultValue="recurring" className="space-y-6">
        <TabsList>
          <TabsTrigger value="recurring">
            <Repeat className="h-4 w-4 mr-2" />
            {t('scheduler.recurringPosts')}
          </TabsTrigger>
          <TabsTrigger value="queue">
            <List className="h-4 w-4 mr-2" />
            {t('scheduler.postQueue')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recurring" className="space-y-4">

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{t('scheduler.newRecurringPost')}</CardTitle>
            <CardDescription>{t('scheduler.formDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>{t('scheduler.title')}</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t('scheduler.titlePlaceholder')}
                  required
                />
              </div>

              <div>
                <Label>{t('scheduler.caption')}</Label>
                <Textarea
                  value={formData.caption}
                  onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                  placeholder={t('scheduler.captionPlaceholder')}
                  rows={4}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('scheduler.platform')}</Label>
                  <Select value={formData.platform} onValueChange={(value) => setFormData({ ...formData, platform: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>{t('scheduler.frequency')}</Label>
                  <Select value={formData.frequency} onValueChange={(value) => setFormData({ ...formData, frequency: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">{t('scheduler.daily')}</SelectItem>
                      <SelectItem value="weekly">{t('scheduler.weekly')}</SelectItem>
                      <SelectItem value="biweekly">{t('scheduler.biweekly')}</SelectItem>
                      <SelectItem value="monthly">{t('scheduler.monthly')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>{t('scheduler.firstPostTime')}</Label>
                <Input
                  type="datetime-local"
                  value={formData.nextScheduledTime}
                  onChange={(e) => setFormData({ ...formData, nextScheduledTime: e.target.value })}
                  required
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {t('scheduler.create')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  {t('cancel')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {recurringPosts.map((post) => (
          <Card key={post.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2">
                    {post.title}
                    {post.is_active ? (
                      <Badge>{t('scheduler.active')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('scheduler.paused')}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-1">
                      <Repeat className="h-4 w-4" />
                      {t(`scheduler.${post.frequency}`)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {new Date(post.next_scheduled_time).toLocaleString()}
                    </span>
                    <span className="capitalize">{post.platform}</span>
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={post.is_active}
                    onCheckedChange={() => toggleActive(post.id, post.is_active)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deletePost(post.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-2">{post.caption}</p>
              {post.last_posted_at && (
                <p className="text-xs text-muted-foreground mt-2">
                  {t('scheduler.lastPosted')}: {new Date(post.last_posted_at).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
        </div>
        </TabsContent>

        <TabsContent value="queue">
          <QueueManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
