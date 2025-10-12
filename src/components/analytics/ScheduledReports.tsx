import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Mail, Plus, Trash2, Clock } from "lucide-react";

export function ScheduledReports() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [scheduledReports, setScheduledReports] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    templateId: "",
    frequency: "weekly",
    recipients: "",
    nextSendDate: "",
  });

  useEffect(() => {
    if (user) {
      loadScheduledReports();
      loadTemplates();
    }
  }, [user]);

  const loadScheduledReports = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('scheduled_reports')
      .select('*, report_templates(*)')
      .order('created_at', { ascending: false });
    
    setScheduledReports(data || []);
  };

  const loadTemplates = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('report_templates')
      .select('*');
    
    setTemplates(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const recipients = formData.recipients.split(',').map(email => email.trim());

      const { error } = await supabase
        .from('scheduled_reports')
        .insert([{
          user_id: user.id,
          template_id: formData.templateId || null,
          name: formData.name,
          frequency: formData.frequency,
          recipients_json: recipients,
          next_send_date: formData.nextSendDate,
        }]);

      if (error) throw error;

      toast({
        title: t('analytics.scheduleCreated'),
        description: t('analytics.scheduleCreatedDescription'),
      });

      setShowForm(false);
      setFormData({
        name: "",
        templateId: "",
        frequency: "weekly",
        recipients: "",
        nextSendDate: "",
      });
      loadScheduledReports();
    } catch (error: any) {
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
        .from('scheduled_reports')
        .update({ is_active: !isActive })
        .eq('id', id);

      if (error) throw error;

      loadScheduledReports();
      toast({
        title: t('analytics.scheduleUpdated'),
        description: t('analytics.statusUpdated'),
      });
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const deleteSchedule = async (id: string) => {
    try {
      const { error } = await supabase
        .from('scheduled_reports')
        .delete()
        .eq('id', id);

      if (error) throw error;

      loadScheduledReports();
      toast({
        title: t('analytics.scheduleDeleted'),
        description: t('analytics.scheduleDeletedDescription'),
      });
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('analytics.scheduledReports')}</h2>
          <p className="text-muted-foreground">{t('analytics.scheduledDescription')}</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('analytics.scheduleNew')}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{t('analytics.newSchedule')}</CardTitle>
            <CardDescription>{t('analytics.scheduleFormDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>{t('analytics.scheduleName')}</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('analytics.scheduleNamePlaceholder')}
                  required
                />
              </div>

              <div>
                <Label>{t('analytics.template')}</Label>
                <Select value={formData.templateId} onValueChange={(value) => setFormData({ ...formData, templateId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('analytics.selectTemplate')} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('analytics.frequency')}</Label>
                <Select value={formData.frequency} onValueChange={(value) => setFormData({ ...formData, frequency: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{t('analytics.daily')}</SelectItem>
                    <SelectItem value="weekly">{t('analytics.weekly')}</SelectItem>
                    <SelectItem value="monthly">{t('analytics.monthly')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('analytics.recipients')}</Label>
                <Input
                  value={formData.recipients}
                  onChange={(e) => setFormData({ ...formData, recipients: e.target.value })}
                  placeholder="email1@example.com, email2@example.com"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('analytics.recipientsHelp')}
                </p>
              </div>

              <div>
                <Label>{t('analytics.firstSendDate')}</Label>
                <Input
                  type="datetime-local"
                  value={formData.nextSendDate}
                  onChange={(e) => setFormData({ ...formData, nextSendDate: e.target.value })}
                  required
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {t('analytics.schedule')}
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
        {scheduledReports.map((schedule) => (
          <Card key={schedule.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2">
                    {schedule.name}
                    {schedule.is_active ? (
                      <Badge>{t('analytics.active')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('analytics.paused')}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {t(`analytics.${schedule.frequency}`)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Mail className="h-4 w-4" />
                      {schedule.recipients_json?.length || 0} {t('analytics.recipients')}
                    </span>
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={schedule.is_active}
                    onCheckedChange={() => toggleActive(schedule.id, schedule.is_active)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteSchedule(schedule.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('analytics.nextSend')}: {new Date(schedule.next_send_date).toLocaleString()}
              </p>
              {schedule.last_sent_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('analytics.lastSent')}: {new Date(schedule.last_sent_at).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}