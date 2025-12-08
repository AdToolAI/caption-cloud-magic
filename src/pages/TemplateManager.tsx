import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Loader2,
  Sparkles
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
import { TemplateManagerHeroHeader } from "@/components/templates/TemplateManagerHeroHeader";

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
      
      const { data: workspaces } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_id", user?.id)
        .limit(1)
        .single();

      const workspaceId = workspaces?.id;

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
      product_launch: "bg-purple-500/20 text-purple-400 border-purple-500/30 shadow-[0_0_10px_hsla(270,60%,50%,0.2)]",
      social_sale: "bg-orange-500/20 text-orange-400 border-orange-500/30 shadow-[0_0_10px_hsla(30,80%,50%,0.2)]",
      seasonal: "bg-green-500/20 text-green-400 border-green-500/30 shadow-[0_0_10px_hsla(140,60%,50%,0.2)]",
      educational: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 shadow-[0_0_10px_hsla(180,80%,50%,0.2)]",
      event: "bg-pink-500/20 text-pink-400 border-pink-500/30 shadow-[0_0_10px_hsla(330,70%,60%,0.2)]",
    };
    return colors[type] || "bg-muted/30 text-muted-foreground border-white/10";
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

  const renderTemplateCard = (template: Template, idx: number) => {
    const isOwn = template.created_by === user?.id;
    const eventsCount = Array.isArray(template.events_json) 
      ? template.events_json.length 
      : 0;

    return (
      <motion.div
        key={template.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: idx * 0.1, duration: 0.4 }}
        whileHover={{ y: -4 }}
        className="group relative backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                   hover:border-primary/30 hover:shadow-[0_0_30px_hsla(43,90%,68%,0.12)]
                   transition-all duration-300"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Badge className={`border ${getTemplateTypeColor(template.template_type)}`}>
                {getTemplateTypeLabel(template.template_type)}
              </Badge>
              {template.is_public ? (
                <Badge variant="outline" className="gap-1 bg-muted/20 border-white/10">
                  <Globe className="h-3 w-3" />
                  Öffentlich
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 bg-muted/20 border-white/10">
                  <Lock className="h-3 w-3" />
                  Privat
                </Badge>
              )}
            </div>
            <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
              {template.name}
            </h3>
            {template.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {template.description}
              </p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-5">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/20 border border-white/5">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            {template.duration_days} Tage
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/20 border border-white/5">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            {eventsCount} Posts
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => openTransferDialog(template)}
            className="group/btn relative overflow-hidden bg-gradient-to-r from-primary to-primary/80
                       shadow-[0_0_15px_hsla(43,90%,68%,0.2)] hover:shadow-[0_0_25px_hsla(43,90%,68%,0.4)]"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent
                             -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700" />
            <Send className="h-4 w-4 mr-1" />
            Zum Planer
          </Button>
          {isOwn && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEdit(template)}
                className="bg-muted/20 border-white/10 hover:border-primary/40 hover:bg-muted/30"
              >
                <Edit className="h-4 w-4 mr-1" />
                Bearbeiten
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => confirmDelete(template.id)}
                className="bg-destructive/10 border-destructive/30 text-destructive 
                           hover:bg-destructive/20 hover:shadow-[0_0_15px_hsla(0,60%,50%,0.2)]"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDuplicate(template)}
            className="bg-muted/20 border-white/10 hover:border-cyan-400/40 hover:bg-muted/30"
          >
            <Copy className="h-4 w-4 mr-1" />
            Kopie
          </Button>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-6"
        >
          <Button
            variant="ghost"
            onClick={() => navigate("/calendar")}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zum Kalender
          </Button>
        </motion.div>

        {/* Hero Header */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
          <TemplateManagerHeroHeader templateCount={templates.length} />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Button 
              onClick={handleCreate}
              className="group relative overflow-hidden bg-gradient-to-r from-primary to-primary/80
                         shadow-[0_0_20px_hsla(43,90%,68%,0.3)] hover:shadow-[0_0_30px_hsla(43,90%,68%,0.5)]
                         h-12 px-6"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent
                               -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              <Plus className="h-5 w-5 mr-2" />
              Neues Template
            </Button>
          </motion.div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="my" className="w-full">
          <TabsList className="mb-6 backdrop-blur-xl bg-card/60 border border-white/10 p-1 rounded-xl">
            <TabsTrigger 
              value="my"
              className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary
                         data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.2)]
                         rounded-lg px-4 py-2 transition-all"
            >
              Meine Templates ({myTemplates.length})
            </TabsTrigger>
            <TabsTrigger 
              value="public"
              className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary
                         data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.2)]
                         rounded-lg px-4 py-2 transition-all"
            >
              Standard Templates ({publicTemplates.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my">
            {loading ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-16"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                  className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/30 to-cyan-500/30
                             flex items-center justify-center shadow-[0_0_20px_hsla(43,90%,68%,0.2)] mb-4"
                >
                  <Sparkles className="h-6 w-6 text-primary" />
                </motion.div>
                <p className="text-muted-foreground">Lade Templates...</p>
              </motion.div>
            ) : myTemplates.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="backdrop-blur-xl bg-card/40 border-2 border-dashed border-white/20 rounded-2xl
                           flex flex-col items-center justify-center py-16 px-8"
              >
                <motion.div
                  animate={{ scale: [1, 1.05, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/20
                             flex items-center justify-center shadow-[0_0_25px_hsla(43,90%,68%,0.15)] mb-6"
                >
                  <Calendar className="h-8 w-8 text-primary" />
                </motion.div>
                <h3 className="text-xl font-semibold mb-2">
                  Noch keine eigenen Templates
                </h3>
                <p className="text-muted-foreground text-center mb-6 max-w-md">
                  Erstelle dein erstes Template, um Kampagnen schnell zu wiederholen und Zeit zu sparen
                </p>
                <Button 
                  onClick={handleCreate}
                  className="group relative overflow-hidden bg-gradient-to-r from-primary to-primary/80
                             shadow-[0_0_20px_hsla(43,90%,68%,0.3)]"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent
                                   -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  <Plus className="h-4 w-4 mr-2" />
                  Template erstellen
                </Button>
              </motion.div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {myTemplates.map((t, idx) => renderTemplateCard(t, idx))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="public">
            {loading ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-16"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                  className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/30 to-cyan-500/30
                             flex items-center justify-center shadow-[0_0_20px_hsla(43,90%,68%,0.2)] mb-4"
                >
                  <Sparkles className="h-6 w-6 text-primary" />
                </motion.div>
                <p className="text-muted-foreground">Lade Templates...</p>
              </motion.div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {publicTemplates.map((t, idx) => renderTemplateCard(t, idx))}
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

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="backdrop-blur-xl bg-card/90 border border-white/10">
          <AlertDialogHeader>
            <div className="w-12 h-12 rounded-xl bg-destructive/20 flex items-center justify-center mb-4
                            shadow-[0_0_20px_hsla(0,60%,50%,0.2)]">
              <Trash2 className="h-6 w-6 text-destructive" />
            </div>
            <AlertDialogTitle>Template löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden. Das Template wird dauerhaft gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted/20 border-white/10 hover:bg-muted/30">
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90
                         shadow-[0_0_15px_hsla(0,60%,50%,0.3)]"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="sm:max-w-[425px] backdrop-blur-xl bg-card/90 border border-white/10">
          <DialogHeader>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20 
                            flex items-center justify-center mb-4 shadow-[0_0_20px_hsla(43,90%,68%,0.2)]">
              <Send className="h-6 w-6 text-primary" />
            </div>
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
              className="rounded-xl border border-white/10 bg-muted/20"
            />
            
            {transferStartDate && templateToTransfer && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-4 rounded-xl backdrop-blur-sm bg-muted/30 border border-white/10"
              >
                <p className="font-medium mb-2 text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Vorschau:
                </p>
                <ul className="space-y-1.5 text-muted-foreground text-sm">
                  {Array.isArray(templateToTransfer.events_json) && 
                    templateToTransfer.events_json.slice(0, 3).map((event: any, idx: number) => {
                      const dayOffset = event.day || event.day_offset || idx;
                      const postDate = new Date(transferStartDate);
                      postDate.setDate(postDate.getDate() + dayOffset);
                      return (
                        <li key={idx} className="flex items-center gap-2">
                          <span className="text-primary">📅</span>
                          <span>{format(postDate, "dd. MMM", { locale: de })}</span>
                          <span className="text-xs text-muted-foreground">- {event.title || `Post ${idx + 1}`}</span>
                        </li>
                      );
                    })
                  }
                  {Array.isArray(templateToTransfer.events_json) && 
                    templateToTransfer.events_json.length > 3 && (
                    <li className="text-xs text-muted-foreground/70">
                      ...und {templateToTransfer.events_json.length - 3} weitere
                    </li>
                  )}
                </ul>
              </motion.div>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setTransferDialogOpen(false)}
              className="bg-muted/20 border-white/10 hover:bg-muted/30"
            >
              Abbrechen
            </Button>
            <Button 
              onClick={handleTransferToPlanner} 
              disabled={transferring || !transferStartDate}
              className="group relative overflow-hidden bg-gradient-to-r from-primary to-primary/80
                         shadow-[0_0_15px_hsla(43,90%,68%,0.2)] hover:shadow-[0_0_25px_hsla(43,90%,68%,0.4)]"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent
                               -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
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
