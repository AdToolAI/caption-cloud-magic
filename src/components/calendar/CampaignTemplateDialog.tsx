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
import { tx } from "@/lib/i18nText";

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
      toast.error(tx({ de: "Kein Workspace ausgewählt", en: "No workspace selected", es: "No se seleccionó ningún espacio de trabajo" }));
      console.error("❌ Missing workspace_id");
      return;
    }

    if (!selectedTemplate) {
      toast.error(tx({ de: "Bitte wähle ein Template aus", en: "Please select a template", es: "Por favor selecciona una plantilla" }));
      return;
    }

    if (!campaignName.trim()) {
      toast.error(tx({ de: "Bitte gib einen Kampagnennamen ein", en: "Please enter a campaign name", es: "Por favor introduce un nombre de campaña" }));
      return;
    }

    if (!startDate) {
      toast.error(tx({ de: "Bitte wähle ein Startdatum", en: "Please select a start date", es: "Por favor selecciona una fecha de inicio" }));
      return;
    }

    setGenerating(true);

    try {
      const requestBody: any = {
        template_id: selectedTemplate.id,
        campaign_name: campaignName,
        start_date: startDate.toISOString().split('T')[0],
        workspace_id: workspaceId
      };

      // Only include brand_kit_id if it's not empty
      if (brandKitId && brandKitId.trim() !== "") {
        requestBody.brand_kit_id = brandKitId;
      }

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
      toast.success(tx({ de: `Kampagne "${campaignName}" mit ${eventCount} Events erstellt`, en: `Campaign "${campaignName}" created with ${eventCount} events`, es: `Campaña "${campaignName}" creada con ${eventCount} eventos` }));
      
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
      const errorMessage = error.message || error.code || t("calendarCampaign.unknownError");
      toast.error(tx({ de: `Fehler beim Erstellen der Kampagne: ${errorMessage}`, en: `Error creating the campaign: ${errorMessage}`, es: `Error al crear la campaña: ${errorMessage}` }));
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
      product_launch: t("calendarCampaign.productLaunch"),
      social_sale: t("calendarCampaign.socialSale"),
      seasonal: t("calendarCampaign.seasonal"),
      educational: t("calendarCampaign.educational"),
      event: t("calendarCampaign.event"),
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
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            {tx({ de: "Kampagne aus Template starten", en: "Start campaign from template", es: "Iniciar campaña desde plantilla" })}
          </DialogTitle>
          <DialogDescription className="flex items-center justify-between">
            <span>{tx({ de: "Wähle ein Template und konfiguriere deine Kampagne", en: "Select a template and configure your campaign", es: "Selecciona una plantilla y configura tu campaña" })}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                handleClose();
                navigate("/command-center?view=campaigns");
              }}
            >
              <Library className="w-4 h-4 mr-2" />
              {tx({ de: "Templates verwalten", en: "Manage templates", es: "Gestionar plantillas" })}
            </Button>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0 py-4">
          {/* Template Selection */}
          <div className="flex flex-col gap-4 min-h-0">
            <div className="flex items-center justify-between flex-shrink-0">
              <Label>{tx({ de: "Template auswählen", en: "Select template", es: "Seleccionar plantilla" })}</Label>
              <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as any)} className="w-auto">
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs">
                    {tx({ de: "Alle", en: "All", es: "Todas" })} ({templates.length})
                  </TabsTrigger>
                  <TabsTrigger value="my" className="text-xs">
                    {tx({ de: "Meine", en: "Mine", es: "Mías" })} ({templates.filter(isMyTemplate).length})
                  </TabsTrigger>
                  <TabsTrigger value="public" className="text-xs">
                    {tx({ de: "Standard", en: "Default", es: "Predeterminadas" })} ({templates.filter(isPublicTemplate).length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <ScrollArea className="flex-1 pr-4">
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
                        ? t("calendarCampaign.noOwnTemplates")
                        : t("calendarCampaign.noTemplates")}
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
                                  {tx({ de: "Eigenes Template", en: "My own template", es: "Plantilla propia" })}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="gap-1">
                                  <Globe className="h-3 w-3" />
                                  {tx({ de: "Standard", en: "Default", es: "Predeterminada" })}
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
          <div className="flex flex-col gap-4 min-h-0">
            <Label className="flex-shrink-0">{tx({ de: "Kampagnen-Konfiguration", en: "Campaign configuration", es: "Configuración de campaña" })}</Label>
            
            {selectedTemplate ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="campaign-name">{tx({ de: "Kampagnen-Name *", en: "Campaign name *", es: "Nombre de campaña *" })}</Label>
                  <Input
                    id="campaign-name"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder={`${selectedTemplate.name} ${new Date().getFullYear()}`}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{tx({ de: "Startdatum *", en: "Start date *", es: "Fecha de inicio *" })}</Label>
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
                      <CardTitle className="text-sm">{tx({ de: "Vorschau", en: "Preview", es: "Vista previa" })}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 text-xs space-y-1">
                      <p>
                        <span className="text-muted-foreground">{tx({ de: "Start:", en: "Start:", es: "Inicio:" })}</span>{" "}
                        {startDate.toLocaleDateString("de-DE")}
                      </p>
                      <p>
                        <span className="text-muted-foreground">{tx({ de: "Ende:", en: "End:", es: "Fin:" })}</span>{" "}
                        {new Date(
                          startDate.getTime() + selectedTemplate.duration_days * 24 * 60 * 60 * 1000
                        ).toLocaleDateString("de-DE")}
                      </p>
                      <p>
                        <span className="text-muted-foreground">{tx({ de: "Dauer:", en: "Duration:", es: "Duración:" })}</span>{" "}
                        {selectedTemplate.duration_days} {tx({ de: "Tage", en: "days", es: "días" })}
                      </p>
                      <p>
                        <span className="text-muted-foreground">{tx({ de: "Posts:", en: "Posts:", es: "Publicaciones:" })}</span>{" "}
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
                    {tx({ de: "Wähle ein Template aus, um deine Kampagne zu konfigurieren", en: "Select a template to configure your campaign", es: "Selecciona una plantilla para configurar tu campaña" })}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 border-t pt-4">
          <Button variant="outline" onClick={handleClose}>
            {t("calendarCampaign.cancel")}
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!selectedTemplate || !campaignName || !startDate || generating}
          >
            {generating ? t("calendarCampaign.generatingCampaign") : t("calendarCampaign.generateCampaign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
