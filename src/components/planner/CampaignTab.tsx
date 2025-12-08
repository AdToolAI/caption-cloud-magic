import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Rocket, 
  Calendar, 
  ChevronRight, 
  Trash2, 
  Send, 
  Loader2,
  Package,
  Clock,
  Sparkles
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
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
    campaign_id?: string;
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
      const { data: blocks, error } = await supabase
        .from("schedule_blocks")
        .select("*, content_items(*)")
        .eq("workspace_id", workspaceId)
        .order("start_at", { ascending: true });

      if (error) throw error;

      const { data: templates } = await supabase
        .from("calendar_campaign_templates")
        .select("id, name");

      const templateMap = new Map(templates?.map(t => [t.id, t.name]) || []);

      const campaignMap = new Map<string, Campaign>();

      blocks?.forEach((block: any) => {
        // Erkennt sowohl campaign_id als auch template_id für Rückwärtskompatibilität
        const campaignId = block.meta?.campaign_id || block.meta?.template_id || block.content_items?.source_id;
        if (!campaignId) return;

        const campaignName = block.meta?.campaign_name || templateMap.get(campaignId) || "Kampagne";

        if (!campaignMap.has(campaignId)) {
          campaignMap.set(campaignId, {
            templateId: campaignId,
            name: campaignName,
            startDate: block.start_at,
            posts: [],
          });
        }

        campaignMap.get(campaignId)!.posts.push(block);
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
      fetchCampaigns();
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
      <div className="flex items-center justify-center py-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
            <Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" />
          </div>
          <span className="text-muted-foreground text-sm">Kampagnen laden...</span>
        </motion.div>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="p-10 text-center backdrop-blur-xl bg-card/60 border-white/10 relative overflow-hidden">
          {/* Glow Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-cyan-500/5 pointer-events-none" />
          
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="relative z-10"
          >
            <div className="relative mx-auto mb-6 w-20 h-20">
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-cyan-500/20 border border-white/10 flex items-center justify-center">
                <Package className="h-10 w-10 text-primary" />
              </div>
            </div>
            
            <h3 className="text-xl font-semibold mb-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              Keine Kampagnen vorhanden
            </h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Erstelle Kampagnen aus Templates, um sie hier zu verwalten und zum Kalender zu übertragen.
            </p>
            
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button 
                onClick={() => navigate("/templates")} 
                className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:shadow-[0_0_30px_rgba(var(--primary),0.4)] transition-all duration-300"
              >
                <Rocket className="h-4 w-4" />
                Zu den Templates
                <Sparkles className="h-3 w-3" />
              </Button>
            </motion.div>
          </motion.div>
        </Card>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      <AnimatePresence mode="popLayout">
        {campaigns.map((campaign, index) => {
          const { scheduled, total } = getStatusCounts(campaign.posts);
          const progress = total > 0 ? (scheduled / total) * 100 : 0;
          const isTransferring = transferring === campaign.templateId;

          return (
            <motion.div
              key={campaign.templateId}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <Card className="p-5 backdrop-blur-xl bg-card/60 border-white/10 hover:border-primary/30 hover:shadow-[0_0_30px_rgba(var(--primary),0.15)] transition-all duration-300 relative overflow-hidden group">
                {/* Subtle gradient overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                
                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <motion.div 
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20"
                      >
                        <Rocket className="h-5 w-5 text-primary" />
                      </motion.div>
                      <div>
                        <h3 className="font-semibold text-lg">{campaign.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>Gestartet: {formatDate(campaign.startDate)}</span>
                        </div>
                      </div>
                    </div>
                    <Badge 
                      variant={progress === 100 ? "default" : "secondary"}
                      className={progress === 100 
                        ? "bg-gradient-to-r from-emerald-500 to-cyan-500 text-white border-0 shadow-[0_0_15px_rgba(16,185,129,0.4)]" 
                        : "bg-primary/10 text-primary border-primary/20"
                      }
                    >
                      {progress === 100 ? "✓ Abgeschlossen" : "In Bearbeitung"}
                    </Badge>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-5">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Fortschritt</span>
                      <span className="font-medium text-primary">{scheduled}/{total} Posts geplant</span>
                    </div>
                    <div className="h-2 bg-muted/50 rounded-full overflow-hidden relative">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 1, delay: index * 0.1, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-primary via-primary/80 to-cyan-500 rounded-full relative"
                      >
                        {progress > 0 && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                        )}
                      </motion.div>
                    </div>
                  </div>

                  {/* Post Timeline Preview */}
                  <div className="flex gap-2 mb-5 overflow-x-auto pb-2 scrollbar-hide">
                    {campaign.posts.slice(0, 7).map((post, idx) => {
                      const isScheduled = ["scheduled", "approved", "queued", "published"].includes(post.status);
                      return (
                        <motion.div
                          key={post.id}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.3 + idx * 0.05 }}
                          whileHover={{ scale: 1.1, y: -2 }}
                          className={`flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 cursor-default ${
                            isScheduled 
                              ? "bg-gradient-to-br from-primary/30 to-cyan-500/20 border-primary/50 text-primary shadow-[0_0_10px_rgba(var(--primary),0.3)]" 
                              : "bg-muted/30 border-white/10 text-muted-foreground hover:border-white/20"
                          }`}
                          title={post.title_override || post.content_items?.title || `Tag ${idx + 1}`}
                        >
                          {isScheduled ? "✓" : idx + 1}
                        </motion.div>
                      );
                    })}
                    {campaign.posts.length > 7 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center text-xs text-muted-foreground bg-muted/30 border border-white/10"
                      >
                        +{campaign.posts.length - 7}
                      </motion.div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex-1">
                      <Button 
                        size="sm" 
                        className="gap-2 w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-[0_0_15px_rgba(var(--primary),0.2)] hover:shadow-[0_0_25px_rgba(var(--primary),0.35)] transition-all duration-300"
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
                    </motion.div>
                    
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="gap-2 border-white/10 hover:border-primary/30 hover:bg-primary/5"
                        onClick={() => navigate("/calendar")}
                      >
                        <Calendar className="h-4 w-4" />
                        Details
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </motion.div>
                    
                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        className="text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeletingCampaign(campaign)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingCampaign} onOpenChange={() => setDeletingCampaign(null)}>
        <AlertDialogContent className="backdrop-blur-xl bg-card/95 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Kampagne löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion löscht alle {deletingCampaign?.posts.length} Posts dieser Kampagne. 
              Dies kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10">Abbrechen</AlertDialogCancel>
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
