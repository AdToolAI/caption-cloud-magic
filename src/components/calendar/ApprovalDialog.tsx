import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Mail, CheckCircle2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface ApprovalDialogProps {
  eventId: string;
  open: boolean;
  onClose: () => void;
}

export function ApprovalDialog({ eventId, open, onClose }: ApprovalDialogProps) {
  const { t } = useTranslation();
  const [approverEmail, setApproverEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [reviewLink, setReviewLink] = useState<string | null>(null);

  const handleCreateLink = async () => {
    if (!approverEmail.trim()) {
      toast.error("Please enter an approver email");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('calendar-create-approval-link', {
        body: {
          event_id: eventId,
          approver_email: approverEmail,
          message: message || undefined,
        }
      });

      if (error) throw error;

      setReviewLink(data.review_url);
      toast.success("Approval link created!");
    } catch (error: any) {
      console.error("Failed to create approval link:", error);
      toast.error(error.message || "Failed to create approval link");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (reviewLink) {
      navigator.clipboard.writeText(reviewLink);
      toast.success("Link copied to clipboard!");
    }
  };

  const handleSendEmail = () => {
    if (reviewLink) {
      const subject = "Content Approval Request";
      const body = `${message || "Please review and approve this content."}\n\nReview Link: ${reviewLink}`;
      window.location.href = `mailto:${approverEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }
  };

  const handleClose = () => {
    setApproverEmail("");
    setMessage("");
    setReviewLink(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Request Approval</DialogTitle>
        </DialogHeader>

        {!reviewLink ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="approver-email">Approver Email *</Label>
              <Input
                id="approver-email"
                type="email"
                value={approverEmail}
                onChange={(e) => setApproverEmail(e.target.value)}
                placeholder="client@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message (optional)</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a note for the approver..."
                rows={4}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleCreateLink} disabled={loading}>
                {loading ? "Creating..." : "Create Approval Link"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-semibold">Approval link created!</span>
            </div>

            <div className="space-y-2">
              <Label>Review Link</Label>
              <div className="flex gap-2">
                <Input value={reviewLink} readOnly className="flex-1" />
                <Button size="sm" variant="outline" onClick={handleCopyLink}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This link expires in 7 days
              </p>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={handleClose} className="w-full sm:w-auto">
                Close
              </Button>
              <Button onClick={handleSendEmail} className="w-full sm:w-auto">
                <Mail className="w-4 h-4 mr-2" />
                Send via Email
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
