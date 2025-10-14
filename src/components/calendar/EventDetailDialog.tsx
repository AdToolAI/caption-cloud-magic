import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTranslation } from "@/hooks/useTranslation";

interface EventDetailDialogProps {
  event: any;
  open: boolean;
  onClose: () => void;
  onSave: (event: any) => void;
  onDelete: () => void;
  readOnly?: boolean;
}

export function EventDetailDialog({ event, open, onClose, onSave, onDelete, readOnly }: EventDetailDialogProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState(event);

  const statusOptions = [
    { value: "briefing", label: t("calendar.status.briefing") },
    { value: "in_progress", label: t("calendar.status.in_progress") },
    { value: "review", label: t("calendar.status.review") },
    { value: "pending_approval", label: t("calendar.status.pending_approval") },
    { value: "approved", label: t("calendar.status.approved") },
    { value: "scheduled", label: t("calendar.status.scheduled") },
    { value: "published", label: t("calendar.status.published") },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{readOnly ? "View Event" : "Edit Event"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                disabled={readOnly}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                  disabled={readOnly}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Channels</Label>
                <Input
                  value={formData.channels?.join(", ")}
                  onChange={(e) => setFormData({ ...formData, channels: e.target.value.split(",").map(c => c.trim()) })}
                  disabled={readOnly}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="content" className="space-y-4">
            <div className="space-y-2">
              <Label>Caption</Label>
              <Textarea
                value={formData.caption || ""}
                onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                disabled={readOnly}
                rows={6}
              />
            </div>
          </TabsContent>

          <TabsContent value="team" className="space-y-4">
            <p className="text-sm text-muted-foreground">Team collaboration features</p>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          {!readOnly && (
            <>
              <Button variant="destructive" onClick={onDelete}>Delete</Button>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => { onSave(formData); onClose(); }}>Save</Button>
            </>
          )}
          {readOnly && <Button onClick={onClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
