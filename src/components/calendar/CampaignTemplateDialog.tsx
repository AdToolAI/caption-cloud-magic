import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Rocket, Calendar as CalendarIcon, FileText, Globe, User, Library } from "lucide-react";
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
  is_public: boolean;
  created_by: string | null;
  workspace_id: string | null;
}

export function CampaignTemplateDialog({
  open,
  onClose,
  workspaceId,
  brandKitId,
  onGenerated
}: CampaignTemplateDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [filterTab, setFilterTab] = useState<"all" | "my" | "public">("all");

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
    // Validation
    if (!workspaceId) {
      toast.error("Kein Workspace ausgewählt");
      console.error("❌ Missing workspace_id");
      return;
    }

    if (!selectedTemplate) {
      toast.error("Bitte wähle ein Template aus");
      return;
    }

    if (!campaignName.trim()) {
      toast.error("Bitte gib einen Kampagnennamen ein");
      return;
    }

    if (!startDate) {
      toast.error("Bitte wähle ein Startdatum");
      return;
    }

    setGenerating(true);

    try {
      const requestBody = {
        template_id: selectedTemplate.id,
        campaign_name: campaignName,
        start_date: startDate.toISOString().split('T')[0],
        workspace_id: workspaceId,
        brand_kit_id: brandKitId
      };

      console.log("🚀 Invoking calendar-campaign-generate with:", requestBody);

      const { data, error } = await supabase.functions.invoke("calendar-campaign-generate", {
        body: requestBody
      });

      console.log("📦 Response received:", { data, error });

      if (error) {
        console.error("❌ Edge Function Error:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          fullError: error
        });
        throw error;
      }

      if (!data) {
        console.error("❌ No response data received");
        throw new Error("NO_RESPONSE");
      }

      console.log("✅ Campaign created successfully:", data);

      const eventCount = data.count || data.events?.length || 0;
      toast.success(`Kampagne "${campaignName}" mit ${eventCount} Events erstellt`);
      
      onGenerated?.(data.campaign_id);
      handleClose();
    } catch (error: any) {
      console.error("💥 Campaign generation failed:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        stack: error.stack,
        fullError: error
      });
      
      // Show detailed error message
      const errorMessage = error.message || error.code || "Unbekannter Fehler";
      toast.error(`Fehler beim Erstellen der Kampagne: ${errorMessage}`);
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
      product_launch: "bg-purple-100 text-purple-800",
      social_sale: "bg-orange-100 text-orange-800",
      seasonal: "bg-green-100 text-green-800",
      educational: "bg-blue-100 text-blue-800",
      event: "bg-pink-100 text-pink-800",
    };
    return colors[type] || "bg-gray-100 text-gray-800";
  };

  const getTemplateTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      product_launch: "Produktlaunch",
      social_sale: "Sale",
      seasonal: "Saison",
      educational: "Bildung",
      event: "Event",
    };
    return labels[type] || type;
  };

  const isMyTemplate = (template: Template) => template.created_by === user?.id;
  const isPublicTemplate = (template: Template) => template.is_public && template.created_by !== user?.id;

  const filteredTemplates = templates.filter(template => {
    if (filterTab === "my") return isMyTemplate(template);
    if (filterTab === "public") return isPublicTemplate(template);
    return true; // "all"
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            Kampagne aus Template starten
          </DialogTitle>
          <DialogDescription className="flex items-center justify-between">
            <span>Wähle ein Template und konfiguriere deine Kampagne</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                handleClose();
                navigate("/calendar/templates");
              }}
            >
              <Library className="w-4 h-4 mr-2" />
              Templates verwalten
            </Button>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[400px]">
          {/* Template Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Template auswählen</Label>
              <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as any)} className="w-auto">
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs">
                    Alle ({templates.length})
                  </TabsTrigger>
                  <TabsTrigger value="my" className="text-xs">
                    Meine ({templates.filter(isMyTemplate).length})
                  </TabsTrigger>
                  <TabsTrigger value="public" className="text-xs">
                    Standard ({templates.filter(isPublicTemplate).length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <ScrollArea className="h-[400px] pr-4">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-32 bg-muted rounded-lg animate-pulse"></div>
                  ))}
                </div>
              ) : filteredTemplates.length === 0 ? (
                <Card>
                  <CardContent className="py-12">
                    <p className="text-sm text-muted-foreground text-center">
                      {filterTab === "my" 
                        ? "Du hast noch keine eigenen Templates erstellt"
                        : "Keine Templates verfügbar"}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {filteredTemplates.map((template) => (
                    <Card
                      key={template.id}
                      className={`cursor-pointer transition-colors hover:bg-accent ${
                        selectedTemplate?.id === template.id ? "ring-2 ring-primary" : ""
                      }`}
                      onClick={() => setSelectedTemplate(template)}
                    >
                      <CardHeader className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <CardTitle className="text-base mb-2">{template.name}</CardTitle>
                            <div className="flex flex-wrap gap-1.5">
                              <Badge className={getTemplateTypeColor(template.template_type)}>
                                {getTemplateTypeLabel(template.template_type)}
                              </Badge>
                              {isMyTemplate(template) ? (
                                <Badge variant="outline" className="gap-1">
                                  <User className="h-3 w-3" />
                                  Eigenes Template
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="gap-1">
                                  <Globe className="h-3 w-3" />
                                  Standard
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <CardDescription className="text-xs mt-2">
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
            <Label>Kampagnen-Konfiguration</Label>
            
            {selectedTemplate ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="campaign-name">Kampagnen-Name *</Label>
                  <Input
                    id="campaign-name"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder={`${selectedTemplate.name} ${new Date().getFullYear()}`}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Startdatum *</Label>
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    disabled={(date) => date < new Date()}
                    className="rounded-md border"
                  />
                </div>

                {startDate && (
                  <Card className="bg-muted/50">
                    <CardHeader className="p-4">
                      <CardTitle className="text-sm">Vorschau</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 text-xs space-y-1">
                      <p>
                        <span className="text-muted-foreground">Start:</span>{" "}
                        {startDate.toLocaleDateString("de-DE")}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Ende:</span>{" "}
                        {new Date(
                          startDate.getTime() + selectedTemplate.duration_days * 24 * 60 * 60 * 1000
                        ).toLocaleDateString("de-DE")}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Dauer:</span>{" "}
                        {selectedTemplate.duration_days} Tage
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
              <Card className="border-dashed">
                <CardContent className="py-12">
                  <p className="text-sm text-muted-foreground text-center">
                    Wähle ein Template aus, um deine Kampagne zu konfigurieren
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
          </div>
        </ScrollArea>

        <DialogFooter className="sticky bottom-0 bg-background pt-4 border-t mt-4">
          <Button variant="outline" onClick={handleClose}>
            Abbrechen
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!selectedTemplate || !campaignName || !startDate || generating}
          >
            {generating ? "Generiert..." : "Kampagne generieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
