import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Check, RotateCcw, Trash2, Send, Loader2, MessageSquare } from 'lucide-react';
import { useSceneComments, type SceneComment } from '@/hooks/useComposerCollaboration';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sceneId: string | undefined;
  projectId: string | undefined;
  sceneLabel?: string;
  currentUserId?: string;
  canEdit: boolean;
}

export default function SceneCommentSheet({
  open, onOpenChange, sceneId, projectId, sceneLabel, currentUserId, canEdit,
}: Props) {
  const { data: comments, isLoading, addComment, resolveComment, reopenComment, deleteComment } =
    useSceneComments(sceneId, projectId);
  const [body, setBody] = useState('');

  const handleSubmit = async () => {
    const text = body.trim();
    if (!text) return;
    try {
      await addComment.mutateAsync({ body: text });
      setBody('');
    } catch (e: any) {
      toast({ title: 'Failed to post comment', description: e.message, variant: 'destructive' });
    }
  };

  const grouped = (comments ?? []).reduce<{ open: SceneComment[]; resolved: SceneComment[] }>(
    (acc, c) => {
      (c.resolved_at ? acc.resolved : acc.open).push(c);
      return acc;
    },
    { open: [], resolved: [] },
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Comments
          </SheetTitle>
          <SheetDescription>{sceneLabel ?? 'Discussion for this scene'}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-4 mt-4 pr-1">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && (comments?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">Be the first to leave a comment.</p>
          )}

          {grouped.open.length > 0 && (
            <CommentList
              title={`Open (${grouped.open.length})`}
              items={grouped.open}
              currentUserId={currentUserId}
              canEdit={canEdit}
              onResolve={(id) => resolveComment.mutate(id)}
              onDelete={(id) => deleteComment.mutate(id)}
            />
          )}
          {grouped.resolved.length > 0 && (
            <CommentList
              title={`Resolved (${grouped.resolved.length})`}
              items={grouped.resolved}
              currentUserId={currentUserId}
              canEdit={canEdit}
              resolved
              onReopen={(id) => reopenComment.mutate(id)}
              onDelete={(id) => deleteComment.mutate(id)}
            />
          )}
        </div>

        <div className="border-t pt-3 mt-3 space-y-2">
          <Textarea
            placeholder="Leave a comment…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter to send</span>
            <Button size="sm" onClick={handleSubmit} disabled={addComment.isPending || !body.trim()}>
              {addComment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="ml-1">Post</span>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CommentList({
  title, items, currentUserId, canEdit, resolved, onResolve, onReopen, onDelete,
}: {
  title: string;
  items: SceneComment[];
  currentUserId?: string;
  canEdit: boolean;
  resolved?: boolean;
  onResolve?: (id: string) => void;
  onReopen?: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">{title}</h4>
      {items.map((c) => {
        const isAuthor = c.user_id === currentUserId;
        return (
          <div
            key={c.id}
            className={`rounded-lg border p-3 ${resolved ? 'opacity-70 bg-muted/30' : 'bg-card/40'}`}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px]">{c.user_id.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                </span>
                {isAuthor && <Badge variant="outline" className="text-[10px] h-4 px-1">You</Badge>}
              </div>
              <div className="flex items-center gap-1">
                {!resolved && canEdit && onResolve && (
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onResolve(c.id)}>
                    <Check className="h-3 w-3" />
                  </Button>
                )}
                {resolved && canEdit && onReopen && (
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onReopen(c.id)}>
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
                {(isAuthor || canEdit) && (
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onDelete(c.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words">{c.body}</p>
          </div>
        );
      })}
    </div>
  );
}
