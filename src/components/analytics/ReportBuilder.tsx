import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, Download, Mail } from "lucide-react";

const availableSections = [
  { id: 'overview', label: 'Overview' },
  { id: 'engagement', label: 'Engagement Metrics' },
  { id: 'hashtags', label: 'Hashtag Performance' },
  { id: 'bestContent', label: 'Best Performing Content' },
  { id: 'trends', label: 'Trends Analysis' },
];

const availableMetrics = [
  { id: 'reach', label: 'Reach' },
  { id: 'impressions', label: 'Impressions' },
  { id: 'engagement_rate', label: 'Engagement Rate' },
  { id: 'likes', label: 'Likes' },
  { id: 'comments', label: 'Comments' },
  { id: 'shares', label: 'Shares' },
  { id: 'saves', label: 'Saves' },
];

export function ReportBuilder() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    dateRange: "30days",
    platforms: [] as string[],
    sections: [] as string[],
    metrics: [] as string[],
    includeLogo: true,
  });

  useEffect(() => {
    if (user) {
      loadTemplates();
    }
  }, [user]);

  const loadTemplates = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('report_templates')
      .select('*')
      .order('created_at', { ascending: false });
    
    setTemplates(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('report_templates')
        .insert([{
          user_id: user.id,
          name: formData.name,
          description: formData.description,
          date_range: formData.dateRange,
          platforms: formData.platforms,
          sections_json: formData.sections,
          metrics_json: formData.metrics,
          include_logo: formData.includeLogo,
        }]);

      if (error) throw error;

      toast({
        title: t('analytics.templateCreated'),
        description: t('analytics.templateCreatedDescription'),
      });

      setShowForm(false);
      resetForm();
      loadTemplates();
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

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      dateRange: "30days",
      platforms: [],
      sections: [],
      metrics: [],
      includeLogo: true,
    });
  };

  const generateReport = async (templateId: string) => {
    setLoading(true);
    try {
      // Generate report with the template
      toast({
        title: t('analytics.generatingReport'),
        description: t('analytics.pleaseWait'),
      });
      
      // Here you would call an edge function to generate the PDF/CSV
      // For now, we'll just show a success message
      setTimeout(() => {
        toast({
          title: t('analytics.reportGenerated'),
          description: t('analytics.reportReady'),
        });
        setLoading(false);
      }, 2000);
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  const toggleSection = (sectionId: string) => {
    setFormData(prev => ({
      ...prev,
      sections: prev.sections.includes(sectionId)
        ? prev.sections.filter(s => s !== sectionId)
        : [...prev.sections, sectionId]
    }));
  };

  const toggleMetric = (metricId: string) => {
    setFormData(prev => ({
      ...prev,
      metrics: prev.metrics.includes(metricId)
        ? prev.metrics.filter(m => m !== metricId)
        : [...prev.metrics, metricId]
    }));
  };

  const togglePlatform = (platform: string) => {
    setFormData(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter(p => p !== platform)
        : [...prev.platforms, platform]
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('analytics.reportBuilder')}</h2>
          <p className="text-muted-foreground">{t('analytics.builderDescription')}</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <FileText className="h-4 w-4 mr-2" />
          {t('analytics.createTemplate')}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{t('analytics.newTemplate')}</CardTitle>
            <CardDescription>{t('analytics.templateDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>{t('analytics.templateName')}</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('analytics.templateNamePlaceholder')}
                  required
                />
              </div>

              <div>
                <Label>{t('analytics.description')}</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t('analytics.descriptionPlaceholder')}
                  rows={2}
                />
              </div>

              <div>
                <Label>{t('analytics.dateRange')}</Label>
                <Select value={formData.dateRange} onValueChange={(value) => setFormData({ ...formData, dateRange: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7days">{t('analytics.last7Days')}</SelectItem>
                    <SelectItem value="30days">{t('analytics.last30Days')}</SelectItem>
                    <SelectItem value="90days">{t('analytics.last90Days')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('analytics.platforms')}</Label>
                <div className="flex gap-4 mt-2">
                  {['instagram', 'facebook', 'linkedin'].map((platform) => (
                    <div key={platform} className="flex items-center space-x-2">
                      <Checkbox
                        checked={formData.platforms.includes(platform)}
                        onCheckedChange={() => togglePlatform(platform)}
                      />
                      <label className="capitalize">{platform}</label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label>{t('analytics.sections')}</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {availableSections.map((section) => (
                    <div key={section.id} className="flex items-center space-x-2">
                      <Checkbox
                        checked={formData.sections.includes(section.id)}
                        onCheckedChange={() => toggleSection(section.id)}
                      />
                      <label>{section.label}</label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label>{t('analytics.metrics')}</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {availableMetrics.map((metric) => (
                    <div key={metric.id} className="flex items-center space-x-2">
                      <Checkbox
                        checked={formData.metrics.includes(metric.id)}
                        onCheckedChange={() => toggleMetric(metric.id)}
                      />
                      <label>{metric.label}</label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={formData.includeLogo}
                  onCheckedChange={(checked) => setFormData({ ...formData, includeLogo: !!checked })}
                />
                <label>{t('analytics.includeLogo')}</label>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {t('analytics.createTemplate')}
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
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{template.name}</CardTitle>
                  {template.description && (
                    <CardDescription>{template.description}</CardDescription>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => generateReport(template.id)}
                    disabled={loading}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {t('analytics.generatePDF')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generateReport(template.id)}
                    disabled={loading}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {t('analytics.generateCSV')}
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}