import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Rocket, 
  Calendar, 
  ChevronRight, 
  Trash2, 
  Send, 
  Loader2,
  Package,
  Clock
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
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

interface CampaignPost {
  id: string;
  title_override: string | null;
  platform: string;
  start_at: string;
  status: string;
  meta: {
    template_id?: string;
    campaign_name?: string;
  } | null;
  content_items?: {
    title: string;
    source_id?: string;
  } | null;
}

interface Campaign {
  templateId: string;
  name: string;
  startDate: string;
  posts: CampaignPost[];
}

interface CampaignTabProps {
  workspaceId: string | null;
}

export function CampaignTab({ workspaceId }: CampaignTabProps) {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState<string | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchCampaigns();
  }, [workspaceId]);

  const fetchCampaigns = async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // Fetch all schedule_blocks with template_id in meta
      const { data: blocks, error } = await supabase
        .from("schedule_blocks")
        .select("*, content_items(*)")
        .eq("workspace_id", workspaceId)
        .order("start_at", { ascending: true });

      if (error) throw error;

      // Also fetch template names
      const { data: templates } = await supabase
        .from("calendar_campaign_templates")
        .select("id, name");

      const templateMap = new Map(templates?.map(t => [t.id, t.name]) || []);

      // Group posts by template_id
      const campaignMap = new Map<string, Campaign>();

      blocks?.forEach((block: any) => {
        const templateId = block.meta?.template_id || block.content_items?.source_id;
        if (!templateId) return;

        if (!campaignMap.has(templateId)) {
          campaignMap.set(templateId, {
            templateId,
            name: templateMap.get(templateId) || block.meta?.campaign_name || "Kampagne",
            startDate: block.start_at,
            posts: [],
          });
        }

        campaignMap.get(templateId)!.posts.push(block);
      });

      setCampaigns(Array.from(campaignMap.values()));
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      toast.error("Fehler beim Laden der Kampagnen");
    } finally {
      setLoading(false);
    }
  };

  const handleTransferToCalendar = async (campaign: Campaign) => {
    if (!workspaceId) return;

    setTransferring(campaign.templateId);

    try {
      const blockIds = campaign.posts.map(p => p.id);

      const { data, error } = await supabase.functions.invoke("planner-to-calendar", {
        body: {
          blockIds,
          workspaceId,
          autoPublish: false,
        },
      });

      if (error) throw error;

      toast.success(`✅ ${data.eventsCreated} Posts zum Kalender übertragen`);
      
      // Refresh campaigns
      fetchCampaigns();
      
      // Navigate to calendar
      setTimeout(() => navigate("/calendar"), 1000);
    } catch (error: any) {
      console.error("Transfer error:", error);
      toast.error("Fehler beim Übertragen");
    } finally {
      setTransferring(null);
    }
  };

  const handleDeleteCampaign = async () => {
    if (!deletingCampaign) return;

    setDeleting(true);

    try {
      const blockIds = deletingCampaign.posts.map(p => p.id);

      // Delete all schedule_blocks for this campaign
      const { error } = await supabase
        .from("schedule_blocks")
        .delete()
        .in("id", blockIds);

      if (error) throw error;

      toast.success("Kampagne gelöscht");
      setDeletingCampaign(null);
      fetchCampaigns();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast.error("Fehler beim Löschen");
    } finally {
      setDeleting(false);
    }
  };

  const getStatusCounts = (posts: CampaignPost[]) => {
    const scheduled = posts.filter(p => ["scheduled", "approved", "queued", "published"].includes(p.status)).length;
    return { scheduled, total: posts.length };
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "dd. MMM yyyy", { locale: de });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">Keine Kampagnen vorhanden</h3>
        <p className="text-muted-foreground mb-4">
          Erstelle Kampagnen aus Templates, um sie hier zu verwalten.
        </p>
        <Button onClick={() => navigate("/templates")} className="gap-2">
          <Rocket className="h-4 w-4" />
          Zu den Templates
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {campaigns.map(campaign => {
        const { scheduled, total } = getStatusCounts(campaign.posts);
        const progress = total > 0 ? (scheduled / total) * 100 : 0;
        const isTransferring = transferring === campaign.templateId;

        return (
          <Card key={campaign.templateId} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Rocket className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{campaign.name}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Gestartet: {formatDate(campaign.startDate)}</span>
                  </div>
                </div>
              </div>
              <Badge variant={progress === 100 ? "default" : "secondary"}>
                {progress === 100 ? "Abgeschlossen" : "In Bearbeitung"}
              </Badge>
            </div>

            {/* Progress */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Fortschritt</span>
                <span className="font-medium">{scheduled}/{total} Posts geplant</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Post Timeline Preview */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
              {campaign.posts.slice(0, 7).map((post, idx) => {
                const isScheduled = ["scheduled", "approved", "queued", "published"].includes(post.status);
                return (
                  <div
                    key={post.id}
                    className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-xs font-medium border-2 transition-colors ${
                      isScheduled 
                        ? "bg-primary/20 border-primary text-primary" 
                        : "bg-muted border-muted-foreground/20 text-muted-foreground"
                    }`}
                    title={post.title_override || post.content_items?.title || `Tag ${idx + 1}`}
                  >
                    {isScheduled ? "✓" : idx + 1}
                  </div>
                );
              })}
              {campaign.posts.length > 7 && (
                <div className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-xs text-muted-foreground bg-muted">
                  +{campaign.posts.length - 7}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button 
                size="sm" 
                className="gap-2 flex-1"
                onClick={() => handleTransferToCalendar(campaign)}
                disabled={isTransferring}
              >
                {isTransferring ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Zum Kalender übertragen
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="gap-2"
                onClick={() => navigate("/calendar")}
              >
                <Calendar className="h-4 w-4" />
                Details
                <ChevronRight className="h-3 w-3" />
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeletingCampaign(campaign)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        );
      })}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingCampaign} onOpenChange={() => setDeletingCampaign(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kampagne löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion löscht alle {deletingCampaign?.posts.length} Posts dieser Kampagne. 
              Dies kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteCampaign}
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
