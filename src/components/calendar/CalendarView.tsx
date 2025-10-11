import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StickyNote, Image as ImageIcon } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek } from "date-fns";

interface Post {
  id: string;
  platform: string;
  caption: string;
  image_url?: string;
  status: 'draft' | 'scheduled' | 'posted';
  scheduled_at: string;
  tags: string[];
}

interface CalendarNote {
  id: string;
  note_text: string;
  date: string;
}

interface CalendarViewProps {
  posts: Post[];
  notes: CalendarNote[];
  onPostClick: (post: Post) => void;
  onPostMove: (postId: string, newDate: Date) => void;
  onDateClick: (date: Date) => void;
  readOnly?: boolean;
}

const statusColors = {
  draft: "bg-gray-500",
  scheduled: "bg-indigo-500",
  posted: "bg-green-500",
};

export function CalendarView({ posts, notes, onPostClick, onPostMove, onDateClick, readOnly }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [draggedPost, setDraggedPost] = useState<string | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getPostsForDate = (date: Date) => {
    return posts.filter(post => {
      const postDate = new Date(post.scheduled_at);
      return isSameDay(postDate, date);
    });
  };

  const getNotesForDate = (date: Date) => {
    return notes.filter(note => {
      const noteDate = new Date(note.date);
      return isSameDay(noteDate, date);
    });
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

  const handleDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    if (draggedPost && !readOnly) {
      onPostMove(draggedPost, date);
      setDraggedPost(null);
    }
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {format(currentMonth, "MMMM yyyy")}
        </h2>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="px-4 py-2 bg-secondary rounded hover:bg-secondary/80">
            Previous
          </button>
          <button onClick={nextMonth} className="px-4 py-2 bg-secondary rounded hover:bg-secondary/80">
            Next
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
          <div key={day} className="text-center font-semibold text-muted-foreground p-2">
            {day}
          </div>
        ))}

        {days.map(day => {
          const dayPosts = getPostsForDate(day);
          const dayNotes = getNotesForDate(day);
          const isCurrentMonth = day.getMonth() === currentMonth.getMonth();

          return (
            <Card
              key={day.toISOString()}
              className={`min-h-[120px] p-2 ${!isCurrentMonth ? "opacity-50" : ""} ${
                draggedPost ? "cursor-pointer" : ""
              }`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, day)}
              onClick={() => !readOnly && onDateClick(day)}
            >
              <div className="text-sm font-semibold mb-2">
                {format(day, "d")}
              </div>

              <div className="space-y-1">
                {dayPosts.map(post => (
                  <div
                    key={post.id}
                    draggable={!readOnly}
                    onDragStart={(e) => handleDragStart(e, post.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPostClick(post);
                    }}
                    className="text-xs p-1.5 rounded bg-card border cursor-pointer hover:border-primary transition-colors"
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <Badge variant="outline" className={`${statusColors[post.status]} text-white text-[10px] px-1`}>
                        {post.status}
                      </Badge>
                      {post.image_url && <ImageIcon className="w-3 h-3" />}
                    </div>
                    <div className="font-medium truncate">{post.platform}</div>
                    <div className="truncate text-muted-foreground">
                      {post.caption?.substring(0, 30)}...
                    </div>
                  </div>
                ))}

                {dayNotes.map(note => (
                  <div key={note.id} className="text-xs p-1.5 rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                    <div className="flex items-center gap-1">
                      <StickyNote className="w-3 h-3 text-yellow-600" />
                      <span className="truncate text-yellow-800 dark:text-yellow-200">
                        {note.note_text.substring(0, 30)}...
                      </span>
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
