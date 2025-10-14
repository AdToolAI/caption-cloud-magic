import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import { format } from "date-fns";

interface Post {
  id: string;
  title: string;
  channels: string[];
  status: string;
  start_at: string;
  brief?: string;
  owner_id?: string;
}

interface KanbanViewProps {
  posts: Post[];
  onPostClick: (post: Post) => void;
  onStatusChange: (postId: string, newStatus: string) => void;
  readOnly?: boolean;
}

const statusColumns = [
  "briefing",
  "in_progress",
  "review",
  "pending_approval",
  "approved",
  "scheduled",
  "published",
];

const statusColors: Record<string, string> = {
  briefing: "bg-gray-500",
  in_progress: "bg-blue-500",
  review: "bg-yellow-500",
  pending_approval: "bg-orange-500",
  approved: "bg-green-500",
  scheduled: "bg-indigo-500",
  published: "bg-purple-500",
};

const channelColors: Record<string, string> = {
  instagram: "bg-pink-500",
  facebook: "bg-blue-600",
  linkedin: "bg-blue-700",
  twitter: "bg-sky-500",
  youtube: "bg-red-500",
  tiktok: "bg-black",
};

export function KanbanView({ posts, onPostClick, onStatusChange, readOnly }: KanbanViewProps) {
  const { t } = useTranslation();
  const [draggedPost, setDraggedPost] = useState<string | null>(null);

  const getPostsByStatus = (status: string) => {
    return posts.filter((post) => post.status === status);
  };

  const handleDragStart = (e: React.DragEvent, postId: string) => {
    if (readOnly) return;
    setDraggedPost(postId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    if (draggedPost && !readOnly) {
      onStatusChange(draggedPost, newStatus);
      setDraggedPost(null);
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {statusColumns.map((status) => {
        const columnPosts = getPostsByStatus(status);
        return (
          <div
            key={status}
            className="flex-shrink-0 w-[300px]"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, status)}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
                <h3 className="font-semibold">
                  {t(`calendar.status.${status}`)}
                </h3>
              </div>
              <Badge variant="secondary">{columnPosts.length}</Badge>
            </div>

            <div className="space-y-2 min-h-[200px] p-2 rounded-lg bg-muted/30">
              {columnPosts.map((post) => (
                <Card
                  key={post.id}
                  draggable={!readOnly}
                  onDragStart={(e) => handleDragStart(e, post.id)}
                  onClick={() => onPostClick(post)}
                  className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div className="space-y-2">
                    <div className="font-medium text-sm">{post.title}</div>
                    
                    <div className="flex flex-wrap gap-1">
                      {post.channels.map((channel) => (
                        <Badge
                          key={channel}
                          variant="outline"
                          className={`${channelColors[channel.toLowerCase()]} text-white text-[10px] px-1.5`}
                        >
                          {channel}
                        </Badge>
                      ))}
                    </div>

                    {post.brief && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {post.brief}
                      </p>
                    )}

                    {post.start_at && (
                      <div className="text-xs text-muted-foreground">
                        📅 {format(new Date(post.start_at), "MMM d, HH:mm")}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}