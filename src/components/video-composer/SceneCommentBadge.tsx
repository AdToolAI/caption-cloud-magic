import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageCircle } from 'lucide-react';

interface Props {
  total: number;
  open: number;
  onClick: () => void;
}

export default function SceneCommentBadge({ total, open, onClick }: Props) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="gap-1.5 h-7 px-2 relative"
      aria-label={`${total} comments, ${open} open`}
    >
      <MessageCircle className="h-3.5 w-3.5" />
      {total > 0 ? (
        <>
          <span className="text-xs">{total}</span>
          {open > 0 && (
            <Badge variant="destructive" className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[10px]">
              {open}
            </Badge>
          )}
        </>
      ) : (
        <span className="text-xs">Comment</span>
      )}
    </Button>
  );
}
