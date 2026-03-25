import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { Button } from "@/components/ui/button";
import { Check, Clock, Edit2, Upload, Plus, Sparkles, AlertCircle, CheckCircle2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WeekPost {
  id: string;
  platform: 'instagram' | 'tiktok' | 'linkedin' | 'facebook' | 'x';
  contentIdea: string;
  caption?: string;
  suggestedTime: string;
  originalTime?: string;
  status: 'suggested' | 'scheduled' | 'published' | 'missed';
  mediaUrl?: string;
  hashtags?: string[];
  sourceType: 'starter_plan' | 'calendar_event';
  sourceId: string;
}

interface WeekDayCardProps {
  date: string;
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  posts: WeekPost[];
  onEdit: (post: WeekPost) => void;
  onUpload: (post: WeekPost) => void;
  onAddPost: (date: string) => void;
  onDelete: (post: WeekPost) => void;
}

const statusConfig = {
  suggested: { icon: Sparkles, color: 'bg-muted text-muted-foreground', border: 'border-border', label: 'Vorgeschlagen' },
  scheduled: { icon: Clock, color: 'bg-primary/10 text-primary', border: 'border-primary/30', label: 'Geplant' },
  published: { icon: CheckCircle2, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', border: 'border-green-400 dark:border-green-500', label: 'Erledigt ✓' },
  missed: { icon: AlertCircle, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', border: 'border-orange-300 dark:border-orange-700', label: 'Verpasst' },
};

export function WeekDayCard({ date, dayName, dayNumber, isToday, posts, onEdit, onUpload, onAddPost }: WeekDayCardProps) {
  return (
    <div className={cn(
      "rounded-xl border p-4 transition-all",
      isToday ? "border-primary bg-primary/5 shadow-md" : "border-border bg-card hover:border-primary/30"
    )}>
      {/* Day Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase text-muted-foreground">{dayName}</span>
          <span className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold",
            isToday ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
          )}>
            {dayNumber}
          </span>
          {isToday && (
            <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">HEUTE</span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => onAddPost(date)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Posts */}
      {posts.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">Kein Post geplant</p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 h-7 text-xs text-primary"
            onClick={() => onAddPost(date)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Post hinzufügen
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => {
            const config = statusConfig[post.status];
            const StatusIcon = config.icon;
            return (
              <div
                key={post.id}
                className={cn(
                  "rounded-lg border p-3 transition-all hover:shadow-sm relative",
                  config.border,
                  post.status === 'published' && 'bg-green-50/50 dark:bg-green-950/20 border-green-400 dark:border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]',
                  post.status === 'missed' && 'bg-orange-50/50 dark:bg-orange-950/20',
                  post.status !== 'published' && post.status !== 'missed' && 'bg-background'
                )}
              >
                {/* Published glow checkmark */}
                {post.status === 'published' && (
                  <div className="absolute -top-2 -right-2 bg-green-500 rounded-full p-0.5 shadow-[0_0_10px_rgba(34,197,94,0.6)]">
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  </div>
                )}

                {/* Status + Time + Platform */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium", config.color)}>
                      <StatusIcon className="h-3 w-3" />
                      {config.label}
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {post.suggestedTime}
                      {post.status === 'missed' && post.originalTime && (
                        <span className="line-through ml-1 text-orange-400">{post.originalTime}</span>
                      )}
                    </span>
                  </div>
                  <PlatformBadge platform={post.platform} />
                </div>

                {/* Content */}
                <p className="text-sm leading-snug line-clamp-2 mb-2 text-foreground">
                  {post.caption || post.contentIdea}
                </p>

                {/* Hashtags preview */}
                {post.hashtags && post.hashtags.length > 0 && (
                  <p className="text-[10px] text-muted-foreground line-clamp-1 mb-2">
                    {post.hashtags.slice(0, 3).map(h => `#${h}`).join(' ')}
                    {post.hashtags.length > 3 && ` +${post.hashtags.length - 3}`}
                  </p>
                )}

                {/* Media preview */}
                {post.mediaUrl && (
                  <div className="w-full h-20 rounded-md overflow-hidden mb-2 bg-muted">
                    <img src={post.mediaUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs flex-1"
                    onClick={() => onEdit(post)}
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    Bearbeiten
                  </Button>
                  {post.status !== 'published' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs flex-1"
                      onClick={() => onUpload(post)}
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      Hochladen
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
