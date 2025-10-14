import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommentThread } from "./CommentThread";
import { TaskList } from "./TaskList";
import { ApprovalDialog } from "./ApprovalDialog";
import { Copy, Trash2, FileText, MessageSquare, CheckSquare, UserCheck, Clock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface EventDrawerProps {
  open: boolean;
  onClose: () => void;
  eventId: string | null;
  onDelete?: () => void;
  onUpdate?: () => void;
}

export function EventDrawer({ open, onClose, eventId, onDelete, onUpdate }: EventDrawerProps) {
  const { t } = useTranslation();
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);

  // Fetch event when drawer opens
  useState(() => {
    if (eventId && open) {
      fetchEvent();
    }
  });

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
      toast.error("Failed to load event");
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
      toast.error("Failed to update event");
    } else {
      setEvent({ ...event, [field]: value });
      onUpdate?.();
      toast.success("Event updated");
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
      toast.error("Failed to duplicate event");
    } else {
      toast.success("Event duplicated");
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
      toast.error("Failed to delete event");
    } else {
      toast.success("Event deleted");
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
              <span>{event?.title || "Event Details"}</span>
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
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="details">
                  <FileText className="w-4 h-4 mr-2" />
                  Details
                </TabsTrigger>
                <TabsTrigger value="tasks">
                  <CheckSquare className="w-4 h-4 mr-2" />
                  Tasks
                </TabsTrigger>
                <TabsTrigger value="comments">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Comments
                </TabsTrigger>
                <TabsTrigger value="approval">
                  <UserCheck className="w-4 h-4 mr-2" />
                  Approval
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={event?.title || ""}
                    onChange={(e) => handleUpdate("title", e.target.value)}
                    onBlur={() => handleUpdate("title", event?.title)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={event?.status}
                    onValueChange={(value) => handleUpdate("status", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="briefing">Briefing</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="review">Review</SelectItem>
                      <SelectItem value="pending_approval">Pending Approval</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Brief</Label>
                  <Textarea
                    value={event?.brief || ""}
                    onChange={(e) => setEvent({ ...event, brief: e.target.value })}
                    onBlur={() => handleUpdate("brief", event?.brief)}
                    rows={4}
                    placeholder="Content brief, objectives, target audience..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Caption</Label>
                  <Textarea
                    value={event?.caption || ""}
                    onChange={(e) => setEvent({ ...event, caption: e.target.value })}
                    onBlur={() => handleUpdate("caption", event?.caption)}
                    rows={6}
                    placeholder="Post caption..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Channels</Label>
                  <div className="flex flex-wrap gap-2">
                    {event?.channels?.map((channel: string) => (
                      <Badge key={channel} variant="outline">
                        {channel}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Hashtags</Label>
                  <div className="flex flex-wrap gap-2">
                    {event?.hashtags?.map((tag: string, i: number) => (
                      <Badge key={i} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Scheduled Time</Label>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">
                      {event?.start_at
                        ? new Date(event.start_at).toLocaleString()
                        : "Not scheduled"}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={handleDuplicate}>
                    <Copy className="w-4 h-4 mr-2" />
                    Duplicate
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setApprovalDialogOpen(true)}
                  >
                    <UserCheck className="w-4 h-4 mr-2" />
                    Request Approval
                  </Button>
                  {onDelete && (
                    <Button variant="destructive" onClick={handleDelete}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
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
                    Send this event for approval by creating a review link.
                  </p>
                  <Button onClick={() => setApprovalDialogOpen(true)}>
                    <UserCheck className="w-4 h-4 mr-2" />
                    Create Approval Request
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
