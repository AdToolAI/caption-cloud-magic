import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, Send } from "lucide-react";

interface Comment {
  id: string;
  user_id: string | null;
  username: string;
  comment_text: string;
  created_at: string;
  mentions: string[];
  parent_comment_id: string | null;
}

interface CommentThreadProps {
  eventId: string;
}

export function CommentThread({ eventId }: CommentThreadProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchComments();
    
    // Subscribe to new comments
    const subscription = supabase
      .channel(`comments:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calendar_comments',
          filter: `event_id=eq.${eventId}`
        },
        () => {
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [eventId]);

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from("calendar_comments")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to fetch comments:", error);
    } else {
      setComments(data || []);
    }
  };

  const handleSubmit = async () => {
    if (!newComment.trim()) return;

    setLoading(true);

    try {
      // Extract mentions (@username)
      const mentions = newComment.match(/@(\w+)/g) || [];
      
      const { error } = await supabase
        .from("calendar_comments")
        .insert({
          event_id: eventId,
          user_id: user?.id,
          username: user?.email?.split('@')[0] || 'Anonymous',
          comment_text: newComment,
          mentions: mentions.map(m => m.slice(1)), // Remove @ symbol
        });

      if (error) throw error;

      setNewComment("");
      toast.success("Comment added");
    } catch (error: any) {
      console.error("Failed to add comment:", error);
      toast.error(error.message || "Failed to add comment");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="w-4 h-4" />
        Comments ({comments.length})
      </div>

      {/* Comments List */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No comments yet. Be the first to comment!
          </p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-xs">
                  {comment.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{comment.username}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {comment.comment_text}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Comment Input */}
      <div className="space-y-2">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Add a comment... (use @ to mention someone, Cmd/Ctrl + Enter to send)"
          rows={3}
          disabled={loading}
        />
        <div className="flex justify-between items-center">
          <p className="text-xs text-muted-foreground">
            Use @username to mention team members
          </p>
          <Button 
            size="sm" 
            onClick={handleSubmit} 
            disabled={loading || !newComment.trim()}
          >
            <Send className="w-4 h-4 mr-2" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
