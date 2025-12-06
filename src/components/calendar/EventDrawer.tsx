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
      toast.error("Bitte fülle zuerst das Briefing aus");
      return;
    }
    setIsGenerating(true);
    
    try {
      // Get session for auth header
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Nicht authentifiziert");
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
      
      toast.success("Post erfolgreich generiert! 🎉");
    } catch (error: any) {
      console.error("AI Generation error:", error);
      toast.error("KI-Generierung fehlgeschlagen: " + (error.message || "Unbekannter Fehler"));
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
      .update({ [field]: value })
      .eq("id", eventId);

    if (error) {
      toast.error(t("calendar.drawer.updateFailed"));
    } else {
      setEvent({ ...event, [field]: value });
      onUpdate?.();
      toast.success(t("calendar.drawer.eventUpdated"));
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
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
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
                  {!isMobile && t("calendar.drawer.details")}
                </TabsTrigger>
                <TabsTrigger value="tasks" className="gap-2">
                  <CheckSquare className="w-4 h-4" />
                  {!isMobile && t("calendar.drawer.tasks")}
                </TabsTrigger>
                <TabsTrigger value="comments" className="gap-2">
                  <MessageSquare className="w-4 h-4" />
                  {!isMobile && t("calendar.drawer.comments")}
                </TabsTrigger>
                <TabsTrigger value="approval" className="gap-2">
                  <UserCheck className="w-4 h-4" />
                  {!isMobile && t("calendar.drawer.approval")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>{t("calendar.event.title")}</Label>
                  <Input
                    value={event?.title || ""}
                    onChange={(e) => handleUpdate("title", e.target.value)}
                    onBlur={() => handleUpdate("title", event?.title)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t("calendar.event.status")}</Label>
                  <Select
                    value={event?.status}
                    onValueChange={(value) => handleUpdate("status", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="briefing">{t("calendar.status.briefing")}</SelectItem>
                      <SelectItem value="in_progress">{t("calendar.status.in_progress")}</SelectItem>
                      <SelectItem value="review">{t("calendar.status.review")}</SelectItem>
                      <SelectItem value="pending_approval">{t("calendar.status.pending_approval")}</SelectItem>
                      <SelectItem value="approved">{t("calendar.status.approved")}</SelectItem>
                      <SelectItem value="scheduled">{t("calendar.status.scheduled")}</SelectItem>
                      <SelectItem value="published">{t("calendar.status.published")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("calendar.event.brief")}</Label>
                  <Textarea
                    value={event?.brief || ""}
                    onChange={(e) => setEvent({ ...event, brief: e.target.value })}
                    onBlur={() => handleUpdate("brief", event?.brief)}
                    rows={4}
                    placeholder={t("calendar.drawer.briefPlaceholder")}
                  />
                </div>

                {/* KI Post Generator Button */}
                <div className="flex items-center gap-2 py-2">
                  <Button
                    onClick={handleGenerateWithAI}
                    disabled={!event?.brief || isGenerating}
                    className="gap-2"
                    variant="outline"
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {isGenerating ? "Generiere..." : "Mit KI generieren"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Generiert Caption & Hashtags aus dem Briefing
                  </span>
                </div>

                <div className="space-y-2">
                  <Label>{t("calendar.event.caption")}</Label>
                  <Textarea
                    value={event?.caption || ""}
                    onChange={(e) => setEvent({ ...event, caption: e.target.value })}
                    onBlur={() => handleUpdate("caption", event?.caption)}
                    rows={6}
                    placeholder={t("calendar.drawer.captionPlaceholder")}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t("calendar.event.channels")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {event?.channels?.map((channel: string) => (
                      <Badge key={channel} variant="outline">
                        {channel}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t("calendar.event.hashtags")}</Label>
                  <Input
                    value={event?.hashtags?.join(", ") || ""}
                    onChange={(e) => setEvent({ ...event, hashtags: e.target.value.split(",").map((t: string) => t.trim()).filter(Boolean) })}
                    onBlur={() => handleUpdate("hashtags", event?.hashtags || [])}
                    placeholder="Hashtags mit Komma trennen..."
                  />
                  {event?.hashtags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {event.hashtags.map((tag: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {tag.startsWith("#") ? tag : `#${tag}`}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>{t("calendar.drawer.scheduledTime")}</Label>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <Input
                      type="datetime-local"
                      value={event?.start_at ? new Date(event.start_at).toISOString().slice(0, 16) : ""}
                      onChange={(e) => {
                        if (e.target.value) {
                          handleUpdate("start_at", new Date(e.target.value).toISOString());
                        }
                      }}
                      className="max-w-[220px]"
                    />
                  </div>
                </div>

                {/* Media Preview Section */}
                {event?.assets_json && Array.isArray(event.assets_json) && event.assets_json.length > 0 && (
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Play className="w-4 h-4" />
                      Medien-Vorschau
                    </Label>
                    <div className="grid gap-3">
                      {event.assets_json.map((asset: any, index: number) => {
                        const url = asset?.url || asset;
                        const isVideo = asset?.type === "video" || 
                          (typeof url === "string" && (url.includes(".mp4") || url.includes(".webm") || url.includes(".mov")));
                        
                        return (
                          <div key={index} className="relative rounded-lg overflow-hidden border bg-muted/50">
                            {isVideo ? (
                              <video
                                src={url}
                                controls
                                className="w-full max-h-[300px] object-contain"
                                preload="metadata"
                              />
                            ) : (
                              <img
                                src={url}
                                alt={`Media ${index + 1}`}
                                className="w-full max-h-[300px] object-contain"
                              />
                            )}
                            <Badge 
                              variant="secondary" 
                              className="absolute top-2 left-2 gap-1"
                            >
                              {isVideo ? <Play className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                              {isVideo ? "Video" : "Bild"}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={handleDuplicate}>
                    <Copy className="w-4 h-4 mr-2" />
                    {t("calendar.drawer.duplicate")}
                  </Button>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          onClick={() => setApprovalDialogOpen(true)}
                        >
                          <UserCheck className="w-4 h-4 mr-2" />
                          {t("calendar.drawer.requestApproval")}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[250px]">
                        <p>Erstellt einen Link zur externen Freigabe durch Kunden oder Teammitglieder</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {onDelete && (
                    <Button variant="destructive" onClick={handleDelete}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      {t("calendar.drawer.delete")}
                    </Button>
                  )}
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
