import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Rocket, Calendar as CalendarIcon, FileText } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface CampaignTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  brandKitId?: string;
  onGenerated?: (campaignId: string) => void;
}

interface Template {
  id: string;
  name: string;
  template_type: string;
  duration_days: number;
  description: string;
  events_json: any;
}

export function CampaignTemplateDialog({
  open,
  onClose,
  workspaceId,
  brandKitId,
  onGenerated
}: CampaignTemplateDialogProps) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (open) {
      fetchTemplates();
    }
  }, [open, workspaceId]);

  const fetchTemplates = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("calendar_campaign_templates")
      .select("*")
      .or(`workspace_id.eq.${workspaceId},is_public.eq.true`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch templates:", error);
      toast.error("Failed to load templates");
    } else {
      setTemplates((data as any[]) || []);
    }
    setLoading(false);
  };

  const handleGenerate = async () => {
    if (!selectedTemplate) {
      toast.error("Please select a template");
      return;
    }

    if (!campaignName.trim()) {
      toast.error("Please enter a campaign name");
      return;
    }

    if (!startDate) {
      toast.error("Please select a start date");
      return;
    }

    setGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke("calendar-campaign-generate", {
        body: {
          template_id: selectedTemplate.id,
          campaign_name: campaignName,
          start_date: startDate.toISOString().split('T')[0],
          workspace_id: workspaceId,
          brand_kit_id: brandKitId
        }
      });

      if (error) throw error;

      toast.success(t("calendar.api.success.CAMPAIGN_CREATED", { count: data.count || data.events?.length || 0 }));
      onGenerated?.(data.campaign_id);
      handleClose();
    } catch (error: any) {
      console.error("Failed to generate campaign:", error);
      const errorCode = error.code || "INTERNAL_ERROR";
      toast.error(t(`calendar.api.errors.${errorCode}`));
    } finally {
      setGenerating(false);
    }
  };

  const handleClose = () => {
    setSelectedTemplate(null);
    setCampaignName("");
    setStartDate(undefined);
    onClose();
  };

  const getTemplateTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      launch: "bg-blue-100 text-blue-800",
      sale: "bg-green-100 text-green-800",
      season: "bg-orange-100 text-orange-800",
      always_on: "bg-purple-100 text-purple-800"
    };
    return colors[type] || "bg-gray-100 text-gray-800";
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl h-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            Launch Campaign from Template
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 h-full">
          {/* Template Selection */}
          <div className="space-y-4">
            <Label>Select Template</Label>
            <ScrollArea className="h-[400px] pr-4">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-32 bg-muted rounded-lg animate-pulse"></div>
                  ))}
                </div>
              ) : templates.length === 0 ? (
                <Card>
                  <CardContent className="py-12">
                    <p className="text-sm text-muted-foreground text-center">
                      No templates available
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {templates.map((template) => (
                    <Card
                      key={template.id}
                      className={`cursor-pointer transition-colors hover:bg-accent ${
                        selectedTemplate?.id === template.id ? "ring-2 ring-primary" : ""
                      }`}
                      onClick={() => setSelectedTemplate(template)}
                    >
                      <CardHeader className="p-4">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          <Badge className={getTemplateTypeColor(template.template_type)}>
                            {template.template_type}
                          </Badge>
                        </div>
                        <CardDescription className="text-xs">
                          {template.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-0 flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="w-3 h-3" />
                          {template.duration_days} days
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {Array.isArray(template.events_json) ? template.events_json.length : 0} posts
                        </span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Configuration */}
          <div className="space-y-4">
            <Label>Campaign Configuration</Label>
            
            {selectedTemplate ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="campaign-name">Campaign Name *</Label>
                  <Input
                    id="campaign-name"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder={`${selectedTemplate.name} ${new Date().getFullYear()}`}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Start Date *</Label>
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    disabled={(date) => date < new Date()}
                    className="rounded-md border"
                  />
                </div>

                {startDate && (
                  <Card>
                    <CardHeader className="p-4">
                      <CardTitle className="text-sm">Preview</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 text-xs space-y-1">
                      <p>
                        <span className="text-muted-foreground">Start:</span>{" "}
                        {startDate.toLocaleDateString()}
                      </p>
                      <p>
                        <span className="text-muted-foreground">End:</span>{" "}
                        {new Date(
                          startDate.getTime() + selectedTemplate.duration_days * 24 * 60 * 60 * 1000
                        ).toLocaleDateString()}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Posts:</span>{" "}
                        {Array.isArray(selectedTemplate.events_json) ? selectedTemplate.events_json.length : 0}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12">
                  <p className="text-sm text-muted-foreground text-center">
                    Select a template to configure your campaign
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!selectedTemplate || !campaignName || !startDate || generating}
          >
            {generating ? "Generating..." : "Generate Campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
