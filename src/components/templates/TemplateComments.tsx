import { useState } from 'react';
import { useTemplateCollaboration } from '@/hooks/useTemplateCollaboration';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface TemplateCommentsProps {
  templateId: string;
}

export const TemplateComments = ({ templateId }: TemplateCommentsProps) => {
  const [commentText, setCommentText] = useState('');
  const { comments, addComment, isAddingComment } = useTemplateCollaboration(templateId);

  const handleSubmit = () => {
    if (!commentText.trim()) return;
    
    addComment({
      templateId,
      commentText: commentText.trim(),
    });
    
    setCommentText('');
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Kommentare</h3>
      </div>

      <div className="space-y-4">
        {/* Comment Input */}
        <div className="flex gap-2">
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Kommentar hinzufügen..."
            className="flex-1 min-h-[80px]"
          />
          <Button
            onClick={handleSubmit}
            disabled={!commentText.trim() || isAddingComment}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {/* Comments List */}
        <div className="space-y-3">
          {comments?.map((comment) => (
            <div key={comment.id} className="p-3 bg-muted rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-medium text-foreground">
                  Benutzer {comment.user_id.slice(0, 8)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(comment.created_at), {
                    addSuffix: true,
                    locale: de,
                  })}
                </span>
              </div>
              <p className="text-sm text-foreground">{comment.comment_text}</p>
            </div>
          ))}

          {comments?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Noch keine Kommentare vorhanden
            </p>
          )}
        </div>
      </div>
    </Card>
  );
};
