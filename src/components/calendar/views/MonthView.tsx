import { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek, isSameMonth } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface Post {
  id: string;
  title: string;
  channels: string[];
  status: string;
  start_at: string;
}

interface MonthViewProps {
  posts: Post[];
  onPostClick: (post: Post) => void;
  onPostMove?: (postId: string, newDate: Date) => void;
  onDateClick?: (date: Date) => void;
  readOnly?: boolean;
  selectedEventIds?: string[];
}

const statusColors: Record<string, string> = {
  briefing: "bg-gray-500",
  in_progress: "bg-blue-500",
  review: "bg-yellow-500",
  pending_approval: "bg-orange-500",
  approved: "bg-green-500",
  scheduled: "bg-indigo-500",
  published: "bg-purple-500",
};

// Platform-specific colors (James Bond 2028 style)
const platformColors: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  instagram: { 
    bg: "bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400", 
    border: "border-pink-400", 
    text: "text-white",
    glow: "hover:shadow-[0_0_20px_rgba(236,72,153,0.5)]"
  },
  facebook: { 
    bg: "bg-[#1877F2]", 
    border: "border-[#1877F2]", 
    text: "text-white",
    glow: "hover:shadow-[0_0_20px_rgba(24,119,242,0.5)]"
  },
  linkedin: { 
    bg: "bg-[#0A8A0A]", 
    border: "border-[#0A8A0A]", 
    text: "text-white",
    glow: "hover:shadow-[0_0_20px_rgba(10,138,10,0.5)]"
  },
  tiktok: { 
    bg: "bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900", 
    border: "border-cyan-400 border-2", 
    text: "text-white",
    glow: "hover:shadow-[0_0_20px_rgba(34,211,238,0.5)]"
  },
  // X/Twitter kommt später
  youtube: { 
    bg: "bg-[#FF0000]", 
    border: "border-[#FF0000]", 
    text: "text-white",
    glow: "hover:shadow-[0_0_20px_rgba(255,0,0,0.5)]"
  },
};

const getPlatformStyle = (channels: string[]) => {
  const primaryChannel = channels[0]?.toLowerCase() || '';
  return platformColors[primaryChannel] || { 
    bg: "bg-gradient-to-r from-gold/80 to-gold/60", 
    border: "border-gold/50", 
    text: "text-black",
    glow: "hover:shadow-[0_0_20px_rgba(245,199,106,0.5)]"
  };
};

export function MonthView({
  posts,
  onPostClick,
  onPostMove,
  onDateClick,
  readOnly,
  selectedEventIds = [],
}: MonthViewProps) {
  const selectableStatuses = ['briefing', 'in_progress', 'review', 'approved'];
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [draggedPostId, setDraggedPostId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, postId: string) => {
    if (readOnly) return;
    setDraggedPostId(postId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggedPostId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    if (draggedPostId && !readOnly && onPostMove) {
      onPostMove(draggedPostId, date);
    }
    setDraggedPostId(null);
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getPostsForDay = (date: Date) => {
    return posts.filter((post) => isSameDay(new Date(post.start_at), date));
  };

  const getPlatformIcon = (platform: string | undefined) => {
    if (!platform) return '📝';
    switch (platform.toLowerCase()) {
      case 'instagram': return '📷';
      case 'facebook': return '👍';
      case 'linkedin': return '💼';
      case 'twitter':
      case 'x': return '🐦';
      case 'tiktok': return '🎵';
      case 'youtube': return '▶️';
      default: return '📱';
    }
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const weekDays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  if (isMobile) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{format(currentMonth, "MMMM yyyy")}</h2>
          <div className="flex gap-2">
            <Button onClick={prevMonth} variant="outline" size="sm">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button onClick={nextMonth} variant="outline" size="sm">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {days.map((day) => {
            const dayPosts = getPostsForDay(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            if (!isCurrentMonth || dayPosts.length === 0) return null;

            return (
              <Card key={day.toISOString()} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-lg font-bold">{format(day, "EEE, MMM d")}</div>
                    <div className="text-sm text-muted-foreground">
                      {dayPosts.length} {t("calendar.mobile.events")}
                    </div>
                  </div>
                  {!readOnly && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDateClick?.(day)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  {dayPosts.map((post) => (
                  <div
                    key={post.id}
                    onClick={() => onPostClick(post)}
                    className={cn(
                      "p-3 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer relative",
                      selectableStatuses.includes(post.status) && "hover:ring-2 hover:ring-primary/50",
                      selectedEventIds.includes(post.id) && "ring-2 ring-primary bg-primary/10"
                    )}
                  >
                      <Badge className={statusColors[post.status] + " text-white mb-2"}>
                        {post.status}
                      </Badge>
                      <div className="font-medium">{post.title}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {post.channels.join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-3xl font-bold">{format(currentMonth, "MMMM yyyy")}</h2>
        <div className="flex gap-2">
          <Button onClick={prevMonth} variant="outline" size="default">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button onClick={nextMonth} variant="outline" size="default">
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {/* Header */}
        {weekDays.map((day) => (
          <div key={day} className="text-center font-bold p-3 text-sm text-muted-foreground bg-muted/30 rounded-lg">
            {day}
          </div>
        ))}

        {/* Days */}
        {days.map((day) => {
          const dayPosts = getPostsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isToday = isSameDay(day, new Date());
          
          return (
            <div
              key={day.toISOString()}
              onClick={() => !readOnly && isCurrentMonth && onDateClick?.(day)}
              onDragOver={isCurrentMonth ? handleDragOver : undefined}
              onDrop={isCurrentMonth ? (e) => handleDrop(e, day) : undefined}
              className={cn(
                "min-h-[100px] p-3 border-2 rounded-xl transition-all cursor-pointer group relative bg-card",
                isToday && "border-primary bg-primary/5 shadow-md ring-2 ring-primary/20",
                !isCurrentMonth && "opacity-30 bg-muted/10",
                isCurrentMonth && !isToday && "hover:border-primary/60 hover:shadow-lg hover:bg-accent/40 hover:scale-[1.02]",
                draggedPostId && isCurrentMonth && "border-dashed border-primary/60 bg-primary/10",
                "flex flex-col"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={cn(
                  "text-sm font-semibold",
                  isToday && "bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center font-bold text-base shadow-sm"
                )}>
                  {format(day, "d")}
                </span>
                <div className="flex items-center gap-1.5">
                  {dayPosts.length > 0 && (
                    <Badge variant="secondary" className="text-xs font-semibold px-2">
                      {dayPosts.length}
                    </Badge>
                  )}
                  {!readOnly && isCurrentMonth && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-8 w-8 transition-all rounded-lg",
                        dayPosts.length === 0 
                          ? "opacity-70 hover:opacity-100 hover:bg-primary hover:text-primary-foreground" 
                          : "opacity-0 group-hover:opacity-100 hover:bg-primary/90 hover:text-primary-foreground"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDateClick?.(day);
                      }}
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1 flex-1">
                {dayPosts.slice(0, 3).map((post) => {
                  const channels = Array.isArray(post.channels) ? post.channels : [post.channels];
                  const isSelected = selectedEventIds.includes(post.id);
                  const platformStyle = getPlatformStyle(channels);
                  return (
                    <div
                      key={post.id}
                      draggable={!readOnly}
                      onDragStart={(e) => handleDragStart(e, post.id)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "text-[10px] px-2 py-1 rounded-md transition-all duration-200 border",
                        !readOnly && "cursor-grab active:cursor-grabbing",
                        readOnly && "cursor-pointer",
                        platformStyle.bg,
                        platformStyle.border,
                        platformStyle.text,
                        platformStyle.glow,
                        "font-medium hover:scale-[1.01]",
                        selectableStatuses.includes(post.status) && "hover:ring-1 hover:ring-gold/60",
                        isSelected && "ring-1 ring-gold ring-offset-1 ring-offset-background",
                        draggedPostId === post.id && "opacity-50 scale-95"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPostClick(post);
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs flex-shrink-0">
                          {channels.length > 0 ? getPlatformIcon(channels[0]) : "📝"}
                        </span>
                        <span className="truncate font-semibold">{post.title}</span>
                      </div>
                    </div>
                  );
                })}
                {dayPosts.length > 3 && (
                  <div className="text-xs text-muted-foreground text-center py-1.5 font-semibold bg-muted/30 rounded-lg">
                    +{dayPosts.length - 3} weitere
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
