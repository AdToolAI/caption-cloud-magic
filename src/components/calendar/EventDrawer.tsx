import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommentThread } from "./CommentThread";
import { TaskList } from "./TaskList";
import { ApprovalDialog } from "./ApprovalDialog";
import { Copy, Trash2, FileText, MessageSquare, CheckSquare, UserCheck, Clock, Play, Image as ImageIcon, Sparkles, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { PostComposerPanel } from "./PostComposerPanel";

interface EventDrawerProps {
  open: boolean;
  onClose: () => void;
  eventId: string | null;
  onDelete?: () => void;
  onUpdate?: () => void;
}

export function EventDrawer({ open, onClose, eventId, onDelete, onUpdate }: EventDrawerProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // KI Post Generation
  const handleGenerateWithAI = async () => {
    if (!event?.brief) {
      toast.error(t("calendarDrawer.briefingRequired"));
      return;
    }
    setIsGenerating(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error(t("calendarDrawer.notAuthenticated"));
        return;
      }

      // Media-URL aus assets_json extrahieren
      const mediaUrl = event.assets_json?.[0]?.url || event.assets_json?.[0] || null;
      const mediaType = event.assets_json?.[0]?.type || "image";
      
      const { data, error } = await supabase.functions.invoke("generate-post-v2", {
        body: {
          workspaceId: event.workspace_id,
          brief: event.brief,
          mediaUrl,
          mediaType,
          platforms: event.channels || ["instagram"],
          languages: ["de"],
          stylePreset: "clean",
          options: {},
        },
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      
      if (error) throw error;
      
      // Caption zusammenbauen: Hook + Caption
      const hook = data.result?.hooks?.A || "";
      const caption = data.result?.caption || "";
      const fullCaption = hook ? `${hook}\n\n${caption}` : caption;
      
      // Hashtags extrahieren
      const hashtags = data.result?.hashtags?.reach || data.result?.hashtags || [];
      
      // Calendar Event updaten
      await handleUpdate("caption", fullCaption);
      if (hashtags.length > 0) {
        await handleUpdate("hashtags", hashtags);
      }
      
      toast.success(t("calendarDrawer.postGenerated"));
    } catch (error: any) {
      console.error("AI Generation error:", error);
      toast.error(t("calendarDrawer.generationFailed") + ": " + (error.message || ""));
    } finally {
      setIsGenerating(false);
    }
  };

  // Fetch event when drawer opens
  useEffect(() => {
    if (eventId && open) {
      fetchEvent();
    }
  }, [eventId, open]);

  const fetchEvent = async () => {
    if (!eventId) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (error) {
      console.error("Failed to fetch event:", error);
      toast.error(t("calendar.drawer.loadFailed"));
    } else {
      setEvent(data);
    }
    setLoading(false);
  };

  const handleUpdate = async (field: string, value: any) => {
    if (!eventId) return;

    const { error } = await supabase
      .from("calendar_events")
      .update({ [field]: value } as any)
      .eq("id", eventId);

    if (error) {
      toast.error(t("calendar.drawer.updateFailed"));
    } else {
      setEvent({ ...event, [field]: value });
      onUpdate?.();
      toast.success(t("calendar.drawer.eventUpdated"));
    }
  };

  const handlePatch = async (patch: Record<string, any>) => {
    if (!eventId) return;
    const { error } = await supabase
      .from("calendar_events")
      .update(patch as any)
      .eq("id", eventId);
    if (error) {
      toast.error(t("calendar.drawer.updateFailed"));
    } else {
      setEvent({ ...event, ...patch });
      onUpdate?.();
    }
  };

  const handleDuplicate = async () => {
    if (!event) return;

    const { title, brief, caption, channels, brand_kit_id, campaign_id, workspace_id } = event;
    
    const { error } = await supabase
      .from("calendar_events")
      .insert({
        workspace_id,
        brand_kit_id,
        campaign_id,
        title: `${title} (Copy)`,
        brief,
        caption,
        channels,
        status: "briefing"
      });

    if (error) {
      toast.error(t("calendar.drawer.duplicateFailed"));
    } else {
      toast.success(t("calendar.drawer.eventDuplicated"));
      onUpdate?.();
    }
  };

  const handleDelete = async () => {
    if (!eventId) return;
    
    const { error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", eventId);

    if (error) {
      toast.error(t("calendar.drawer.deleteFailed"));
    } else {
      toast.success(t("calendar.drawer.eventDeleted"));
      onDelete?.();
      onClose();
    }
  };

  if (!event && !loading) return null;

  const statusColors: Record<string, string> = {
    briefing: "bg-gray-100 text-gray-800",
    in_progress: "bg-blue-100 text-blue-800",
    review: "bg-yellow-100 text-yellow-800",
    pending_approval: "bg-orange-100 text-orange-800",
    approved: "bg-green-100 text-green-800",
    scheduled: "bg-indigo-100 text-indigo-800",
    published: "bg-purple-100 text-purple-800"
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-5xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <span>{event?.title || t("calendar.drawer.eventDetails")}</span>
              <Badge className={statusColors[event?.status] || ""}>
                {event?.status}
              </Badge>
            </SheetTitle>
          </SheetHeader>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <Tabs defaultValue="details" className="mt-6">
              <TabsList className={`grid w-full ${isMobile ? "grid-cols-2 gap-2" : "grid-cols-4"}`}>
                <TabsTrigger value="details" className="gap-2">
                  <FileText className="w-4 h-4" />
                  {!isMobile && t("calendarDrawer.details")}
                </TabsTrigger>
                <TabsTrigger value="tasks" className="gap-2">
                  <CheckSquare className="w-4 h-4" />
                  {!isMobile && t("calendarDrawer.tasks")}
                </TabsTrigger>
                <TabsTrigger value="comments" className="gap-2">
                  <MessageSquare className="w-4 h-4" />
                  {!isMobile && t("calendarDrawer.comments")}
                </TabsTrigger>
                <TabsTrigger value="approval" className="gap-2">
                  <UserCheck className="w-4 h-4" />
                  {!isMobile && t("calendarDrawer.approval")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-2">
                <div className="space-y-3">
                  <Input
                    value={event?.title || ""}
                    onChange={(e) => setEvent({ ...event, title: e.target.value })}
                    onBlur={() => handleUpdate("title", event?.title)}
                    placeholder={t("calendarDrawer.title")}
                    className="text-lg font-semibold bg-card/40 border-white/10"
                  />

                  <PostComposerPanel
                    event={event}
                    onUpdate={handleUpdate}
                    onPatch={handlePatch}
                  />

                  <div className="flex flex-wrap gap-2 pt-4 border-t border-white/5">
                    <Button variant="outline" size="sm" onClick={handleDuplicate}>
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      {t("calendar.drawer.duplicate")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setApprovalDialogOpen(true)}>
                      <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                      {t("calendar.drawer.requestApproval")}
                    </Button>
                    {onDelete && (
                      <Button variant="destructive" size="sm" onClick={handleDelete}>
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        {t("calendar.drawer.delete")}
                      </Button>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="tasks" className="mt-4">
                {eventId && <TaskList eventId={eventId} />}
              </TabsContent>

              <TabsContent value="comments" className="mt-4">
                {eventId && <CommentThread eventId={eventId} />}
              </TabsContent>

              <TabsContent value="approval" className="mt-4">
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {t("calendar.drawer.approvalDesc")}
                  </p>
                  <Button onClick={() => setApprovalDialogOpen(true)}>
                    <UserCheck className="w-4 h-4 mr-2" />
                    {t("calendar.drawer.createApprovalRequest")}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

      {eventId && (
        <ApprovalDialog
          eventId={eventId}
          open={approvalDialogOpen}
          onClose={() => setApprovalDialogOpen(false)}
        />
      )}
    </>
  );
}
