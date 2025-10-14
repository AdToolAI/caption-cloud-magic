import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { SEO } from "@/components/SEO";

export default function ReviewLink() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [approval, setApproval] = useState<any>(null);
  const [event, setEvent] = useState<any>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (token) {
      fetchApprovalData();
    }
  }, [token]);

  const fetchApprovalData = async () => {
    setLoading(true);

    try {
      // Fetch approval by token
      const { data: approvalData, error: approvalError } = await supabase
        .from("calendar_approvals")
        .select("*")
        .eq("review_token", token)
        .single();

      if (approvalError) throw approvalError;

      // Check if token is expired
      if (new Date(approvalData.token_expires_at) < new Date()) {
        toast.error("This review link has expired");
        setLoading(false);
        return;
      }

      // Check if already reviewed
      if (approvalData.status !== "pending") {
        setApproval(approvalData);
        setLoading(false);
        return;
      }

      setApproval(approvalData);

      // Fetch associated event
      const { data: eventData, error: eventError } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("id", approvalData.event_id)
        .single();

      if (eventError) throw eventError;

      setEvent(eventData);
    } catch (error: any) {
      console.error("Failed to load review:", error);
      toast.error("Failed to load review");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (decision: "approved" | "changes_requested") => {
    if (!approval) return;

    setSubmitting(true);

    try {
      // Update approval
      const { error: approvalError } = await supabase
        .from("calendar_approvals")
        .update({
          status: decision,
          comment: comment.trim() || null,
          reviewed_at: new Date().toISOString()
        })
        .eq("id", approval.id);

      if (approvalError) throw approvalError;

      // Update event status
      const newEventStatus = decision === "approved" ? "approved" : "review";
      
      const { error: eventError } = await supabase
        .from("calendar_events")
        .update({ status: newEventStatus })
        .eq("id", approval.event_id);

      if (eventError) throw eventError;

      toast.success(
        decision === "approved"
          ? "Content approved successfully!"
          : "Feedback submitted. Team will make changes."
      );

      // Refresh data
      fetchApprovalData();
    } catch (error: any) {
      console.error("Failed to submit review:", error);
      toast.error("Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <SEO
          title="Review Content"
          description="Review and approve content"
        />
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!approval || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <SEO
          title="Invalid Link"
          description="This review link is invalid or has expired"
        />
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" />
              <CardTitle>Invalid or Expired Link</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This review link is invalid or has expired. Please contact your team
              for a new review link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isReviewed = approval.status !== "pending";

  return (
    <div className="min-h-screen bg-background p-4">
      <SEO
        title="Review Content"
        description="Review and approve content"
      />
      
      <div className="max-w-3xl mx-auto py-8 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Content Review</CardTitle>
              {isReviewed ? (
                <Badge
                  variant={approval.status === "approved" ? "default" : "secondary"}
                  className="gap-2"
                >
                  {approval.status === "approved" ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Approved
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4" />
                      Changes Requested
                    </>
                  )}
                </Badge>
              ) : (
                <Badge variant="outline">Pending Review</Badge>
              )}
            </div>
            <CardDescription>
              {isReviewed
                ? `Reviewed on ${new Date(approval.reviewed_at).toLocaleDateString()}`
                : "Please review the content below and provide your feedback"}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{event.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {event.brief && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Brief</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {event.brief}
                </p>
              </div>
            )}

            {event.caption && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Caption</h3>
                <p className="text-sm whitespace-pre-wrap">{event.caption}</p>
              </div>
            )}

            {event.channels?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Channels</h3>
                <div className="flex flex-wrap gap-2">
                  {event.channels.map((channel: string) => (
                    <Badge key={channel} variant="outline">
                      {channel}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {event.hashtags?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Hashtags</h3>
                <div className="flex flex-wrap gap-2">
                  {event.hashtags.map((tag: string, i: number) => (
                    <Badge key={i} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {event.assets_json?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Assets</h3>
                <div className="grid grid-cols-2 gap-2">
                  {event.assets_json.map((asset: any, i: number) => (
                    <img
                      key={i}
                      src={asset.url}
                      alt={asset.name || `Asset ${i + 1}`}
                      className="rounded-lg border w-full h-48 object-cover"
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {isReviewed ? (
          approval.comment && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{approval.comment}</p>
              </CardContent>
            </Card>
          )
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Feedback</CardTitle>
              <CardDescription>
                Provide comments or changes you'd like to see (optional)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add your feedback here..."
                rows={6}
              />

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => handleSubmit("approved")}
                  disabled={submitting}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleSubmit("changes_requested")}
                  disabled={submitting}
                >
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Request Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
