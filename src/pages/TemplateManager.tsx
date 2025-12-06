import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, 
  Calendar, 
  Copy, 
  Edit, 
  Trash2, 
  Globe, 
  Lock,
  ArrowLeft,
  Send,
  Loader2
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { TemplateBuilderDialog } from "@/components/calendar/TemplateBuilderDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface Template {
  id: string;
  name: string;
  description: string | null;
  template_type: string;
  duration_days: number;
  events_json: any;
  is_public: boolean;
  workspace_id: string | null;
  created_by: string | null;
  created_at: string;
}

export default function TemplateManager() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  
  // Transfer to Planner state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [templateToTransfer, setTemplateToTransfer] = useState<Template | null>(null);
  const [transferStartDate, setTransferStartDate] = useState<Date | undefined>(new Date());
  const [transferring, setTransferring] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
    loadWorkspace();
  }, [user]);

  const loadWorkspace = async () => {
    if (!user) return;
    // Use same logic as Planner.tsx - get from workspace_members for consistency
    const { data } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (data) setWorkspaceId(data.workspace_id);
  };

  const loadTemplates = async () => {
    try {
      setLoading(true);
      
      // Fetch user's default workspace
      const { data: workspaces } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_id", user?.id)
        .limit(1)
        .single();

      const workspaceId = workspaces?.id;

      // Fetch templates (own + public)
      const { data, error } = await supabase
        .from("calendar_campaign_templates")
        .select("*")
        .or(`created_by.eq.${user?.id},is_public.eq.true,workspace_id.eq.${workspaceId}`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error loading templates:", error);
      toast({
        title: "Fehler",
        description: "Templates konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setBuilderOpen(true);
  };

  const handleEdit = (template: Template) => {
    setEditingTemplate(template);
    setBuilderOpen(true);
  };

  const handleDuplicate = async (template: Template) => {
    try {
      // Fetch user's default workspace
      const { data: workspaces } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_id", user?.id)
        .limit(1)
        .single();

      const { error } = await supabase
        .from("calendar_campaign_templates")
        .insert({
          name: `${template.name} (Kopie)`,
          description: template.description,
          template_type: template.template_type,
          duration_days: template.duration_days,
          events_json: template.events_json,
          is_public: false,
          workspace_id: workspaces?.id,
          created_by: user?.id,
        });

      if (error) throw error;

      toast({
        title: "Template dupliziert",
        description: "Das Template wurde erfolgreich kopiert.",
      });
      loadTemplates();
    } catch (error) {
      console.error("Error duplicating template:", error);
      toast({
        title: "Fehler",
        description: "Template konnte nicht dupliziert werden.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;

    try {
      const { error } = await supabase
        .from("calendar_campaign_templates")
        .delete()
        .eq("id", templateToDelete);

      if (error) throw error;

      toast({
        title: "Template gelöscht",
        description: "Das Template wurde erfolgreich entfernt.",
      });
      loadTemplates();
    } catch (error) {
      console.error("Error deleting template:", error);
      toast({
        title: "Fehler",
        description: "Template konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    }
  };

  const confirmDelete = (templateId: string) => {
    setTemplateToDelete(templateId);
    setDeleteDialogOpen(true);
  };

  const openTransferDialog = (template: Template) => {
    setTemplateToTransfer(template);
    setTransferStartDate(new Date());
    setTransferDialogOpen(true);
  };

  const handleTransferToPlanner = async () => {
    if (!templateToTransfer || !transferStartDate || !workspaceId) {
      toast({
        title: "Fehler",
        description: "Bitte wähle ein Startdatum aus.",
        variant: "destructive",
      });
      return;
    }

    setTransferring(true);
    try {
      const { data, error } = await supabase.functions.invoke("template-to-planner", {
        body: {
          templateId: templateToTransfer.id,
          startDate: transferStartDate.toISOString(),
          workspaceId,
        },
      });

      if (error) throw error;

      toast({
        title: "✅ Template übertragen",
        description: `${data.blocksCreated} Posts wurden in den Content-Planer übertragen.`,
      });

      setTransferDialogOpen(false);
      setTemplateToTransfer(null);
      
      // Navigate to planner
      setTimeout(() => navigate("/planner"), 1000);
    } catch (error: any) {
      console.error("Transfer error:", error);
      toast({
        title: "Fehler",
        description: "Template konnte nicht übertragen werden.",
        variant: "destructive",
      });
    } finally {
      setTransferring(false);
    }
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

  const myTemplates = templates.filter(t => t.created_by === user?.id);
  const publicTemplates = templates.filter(t => t.is_public && t.created_by !== user?.id);

  const renderTemplateCard = (template: Template) => {
    const isOwn = template.created_by === user?.id;
    const eventsCount = Array.isArray(template.events_json) 
      ? template.events_json.length 
      : 0;

    return (
      <Card key={template.id} className="hover:shadow-lg transition-shadow">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge className={getTemplateTypeColor(template.template_type)}>
                  {getTemplateTypeLabel(template.template_type)}
                </Badge>
                {template.is_public ? (
                  <Badge variant="outline" className="gap-1">
                    <Globe className="h-3 w-3" />
                    Öffentlich
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1">
                    <Lock className="h-3 w-3" />
                    Privat
                  </Badge>
                )}
              </div>
              <CardTitle className="text-lg">{template.name}</CardTitle>
              <CardDescription className="mt-1">
                {template.description}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {template.duration_days} Tage
            </div>
            <div>
              {eventsCount} Posts
            </div>
          </div>
          
          <div className="flex gap-2 flex-wrap">
            {/* Transfer to Planner - always visible */}
            <Button
              variant="default"
              size="sm"
              onClick={() => openTransferDialog(template)}
              className="gap-1"
            >
              <Send className="h-4 w-4" />
              Zum Planer
            </Button>
            {isOwn && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(template)}
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Bearbeiten
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => confirmDelete(template.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDuplicate(template)}
            >
              <Copy className="h-4 w-4 mr-1" />
              Kopie
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/calendar")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Campaign Templates</h1>
              <p className="text-muted-foreground mt-1">
                Erstelle wiederverwendbare Kampagnen-Vorlagen
              </p>
            </div>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Neues Template
          </Button>
        </div>

        <Tabs defaultValue="my" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="my">
              Meine Templates ({myTemplates.length})
            </TabsTrigger>
            <TabsTrigger value="public">
              Standard Templates ({publicTemplates.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my">
            {loading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Lade Templates...</p>
              </div>
            ) : myTemplates.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    Noch keine eigenen Templates
                  </h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Erstelle dein erstes Template, um Kampagnen schnell zu wiederholen
                  </p>
                  <Button onClick={handleCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Template erstellen
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {myTemplates.map(renderTemplateCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="public">
            {loading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Lade Templates...</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {publicTemplates.map(renderTemplateCard)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <TemplateBuilderDialog
        open={builderOpen}
        onClose={() => {
          setBuilderOpen(false);
          setEditingTemplate(null);
        }}
        onSaved={loadTemplates}
        template={editingTemplate}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Template löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden. Das Template wird
              dauerhaft gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer to Planner Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Kampagne zum Planer übertragen</DialogTitle>
            <DialogDescription>
              {templateToTransfer && (
                <span className="font-medium text-foreground">
                  {Array.isArray(templateToTransfer.events_json) 
                    ? templateToTransfer.events_json.length 
                    : 0} Posts aus "{templateToTransfer.name}"
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label className="text-sm font-medium mb-2 block">
              Startdatum wählen
            </Label>
            <CalendarPicker
              mode="single"
              selected={transferStartDate}
              onSelect={setTransferStartDate}
              locale={de}
              className="rounded-md border"
            />
            
            {transferStartDate && templateToTransfer && (
              <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm">
                <p className="font-medium mb-2">Vorschau:</p>
                <ul className="space-y-1 text-muted-foreground">
                  {Array.isArray(templateToTransfer.events_json) && 
                    templateToTransfer.events_json.slice(0, 3).map((event: any, idx: number) => {
                      const dayOffset = event.day || event.day_offset || idx;
                      const postDate = new Date(transferStartDate);
                      postDate.setDate(postDate.getDate() + dayOffset);
                      return (
                        <li key={idx} className="flex items-center gap-2">
                          <span>📅 {format(postDate, "dd. MMM", { locale: de })}</span>
                          <span className="text-xs">- {event.title || `Post ${idx + 1}`}</span>
                        </li>
                      );
                    })
                  }
                  {Array.isArray(templateToTransfer.events_json) && 
                    templateToTransfer.events_json.length > 3 && (
                    <li className="text-xs">...und {templateToTransfer.events_json.length - 3} weitere</li>
                  )}
                </ul>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleTransferToPlanner} disabled={transferring || !transferStartDate}>
              {transferring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Übertrage...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Posts einplanen
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}