import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Plus, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { AddPostModal } from "@/components/calendar/AddPostModal";
import { AddNoteModal } from "@/components/calendar/AddNoteModal";
import { CalendarView } from "@/components/calendar/CalendarView";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";

interface Post {
  id: string;
  platform: string;
  caption: string;
  image_url?: string;
  status: 'draft' | 'scheduled' | 'posted';
  scheduled_at: string;
  tags: any;
}

interface CalendarNote {
  id: string;
  note_text: string;
  date: string;
}

export default function Calendar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPost, setShowAddPost] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [userPlan, setUserPlan] = useState<string>("free");
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserPlan();
      fetchPosts();
      fetchNotes();
    }
  }, [user]);

  const fetchUserPlan = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user?.id)
      .single();
    
    if (data) setUserPlan(data.plan || "free");
  };

  const fetchPosts = async () => {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("scheduled_at", { ascending: true });

    if (error) {
      toast.error("Failed to load posts");
      console.error(error);
    } else {
      setPosts(data || []);
    }
    setLoading(false);
  };

  const fetchNotes = async () => {
    const { data, error } = await supabase
      .from("calendar_notes")
      .select("*")
      .order("date", { ascending: true });

    if (error) {
      toast.error("Failed to load notes");
      console.error(error);
    } else {
      setNotes(data || []);
    }
  };

  const handleAddPost = () => {
    if (userPlan === "free") {
      setShowUpgrade(true);
      return;
    }
    setEditingPost(null);
    setShowAddPost(true);
  };

  const handleAddNote = (date?: Date) => {
    if (userPlan === "free") {
      setShowUpgrade(true);
      return;
    }
    setSelectedDate(date || new Date());
    setShowAddNote(true);
  };

  const handleEditPost = (post: Post) => {
    if (userPlan === "free") {
      setShowUpgrade(true);
      return;
    }
    setEditingPost(post);
    setShowAddPost(true);
  };

  const handlePostSaved = () => {
    fetchPosts();
    setShowAddPost(false);
    setEditingPost(null);
  };

  const handleNoteSaved = () => {
    fetchNotes();
    setShowAddNote(false);
    setSelectedDate(null);
  };

  const handlePostMoved = async (postId: string, newDate: Date) => {
    if (userPlan === "free") {
      setShowUpgrade(true);
      return;
    }

    const { error } = await supabase
      .from("posts")
      .update({ scheduled_at: newDate.toISOString() })
      .eq("id", postId);

    if (error) {
      toast.error("Failed to move post");
      console.error(error);
    } else {
      toast.success("Post rescheduled");
      fetchPosts();
    }
  };

  const handleExportCalendar = () => {
    if (userPlan === "free") {
      setShowUpgrade(true);
      return;
    }
    
    // Generate ICS file
    const scheduledPosts = posts.filter(p => p.status === 'scheduled');
    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CaptionGenie//Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    scheduledPosts.forEach(post => {
      const start = new Date(post.scheduled_at);
      const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour duration
      
      icsContent.push(
        'BEGIN:VEVENT',
        `DTSTART:${start.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
        `DTEND:${end.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
        `SUMMARY:${post.platform} Post`,
        `DESCRIPTION:${post.caption?.substring(0, 200) || ''}`,
        `UID:${post.id}@captiongenie.com`,
        'END:VEVENT'
      );
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'content-calendar.ics';
    link.click();
    URL.revokeObjectURL(url);
    
    toast.success("Calendar exported successfully");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <Breadcrumbs category="optimize" feature="calendar_title" />

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <CalendarIcon className="w-8 h-8 text-primary" />
              {t("calendar_title")}
            </h1>
            <p className="text-muted-foreground mt-2">
              {userPlan === "free" 
                ? "View demo calendar - upgrade to Pro to create and manage posts"
                : "Plan and organize your content visually"}
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => handleAddNote()} variant="outline">
              <StickyNote className="w-4 h-4 mr-2" />
              {t("calendar_add_note")}
            </Button>
            <Button onClick={handleAddPost}>
              <Plus className="w-4 h-4 mr-2" />
              {t("calendar_add_post")}
            </Button>
            <Button onClick={handleExportCalendar} variant="outline">
              {t("calendar_export")}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : (
          <CalendarView
            posts={posts}
            notes={notes}
            onPostClick={handleEditPost}
            onPostMove={handlePostMoved}
            onDateClick={handleAddNote}
            readOnly={userPlan === "free"}
          />
        )}
      </main>

      <Footer />

      <AddPostModal
        open={showAddPost}
        onClose={() => {
          setShowAddPost(false);
          setEditingPost(null);
        }}
        onSave={handlePostSaved}
        editingPost={editingPost}
      />

      <AddNoteModal
        open={showAddNote}
        onClose={() => {
          setShowAddNote(false);
          setSelectedDate(null);
        }}
        onSave={handleNoteSaved}
        selectedDate={selectedDate}
      />

      <PlanLimitDialog
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        feature="Smart Content Calendar"
      />
    </div>
  );
}
