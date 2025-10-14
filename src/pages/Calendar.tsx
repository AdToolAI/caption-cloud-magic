import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { toast } from "sonner";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { CalendarToolbar, ViewType } from "@/components/calendar/CalendarToolbar";
import { MonthView } from "@/components/calendar/views/MonthView";
import { WeekView } from "@/components/calendar/views/WeekView";
import { ListView } from "@/components/calendar/views/ListView";
import { KanbanView } from "@/components/calendar/views/KanbanView";
import { TimelineView } from "@/components/calendar/views/TimelineView";
import { EventDetailDialog } from "@/components/calendar/EventDetailDialog";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";

interface CalendarEvent {
  id: string;
  workspace_id: string;
  client_id?: string;
  brand_kit_id?: string;
  campaign_id?: string;
  title: string;
  brief?: string;
  caption?: string;
  channels: string[];
  status: string;
  start_at?: string;
  end_at?: string;
  timezone: string;
  owner_id?: string;
  assignees?: string[];
  eta_minutes?: number;
  assets_json?: any;
  hashtags?: string[];
  tags?: string[];
  version: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

interface Workspace {
  id: string;
  name: string;
}

interface Client {
  id: string;
  name: string;
  workspace_id: string;
}

interface BrandKit {
  id: string;
  brand_name?: string;
  workspace_id?: string;
}

export default function Calendar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { emit } = useEventEmitter();
  
  // View State
  const [currentView, setCurrentView] = useState<ViewType>("month");
  
  // Data State
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Scope State
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [brands, setBrands] = useState<BrandKit[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  
  // UI State
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventDetail, setShowEventDetail] = useState(false);
  const [userPlan, setUserPlan] = useState<string>("free");
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserPlan();
      fetchWorkspaces();
    }
  }, [user]);

  useEffect(() => {
    if (selectedWorkspace) {
      fetchClients();
      fetchBrands();
      fetchEvents();
    }
  }, [selectedWorkspace, selectedClient, selectedBrand]);

  const fetchUserPlan = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("plan, test_mode_plan")
      .eq("id", user?.id)
      .single();
    
    // Verwende test_mode_plan falls gesetzt, sonst normalen plan
    if (data) {
      setUserPlan(data.test_mode_plan || data.plan || "free");
    }
  };

  const hasCalendarAccess = () => {
    // Plan-Hierarchie: free < basic < pro < enterprise
    const planHierarchy: Record<string, number> = {
      'free': 0,
      'basic': 1,
      'pro': 2,
      'enterprise': 3
    };
    
    const userLevel = planHierarchy[userPlan] || 0;
    const requiredLevel = planHierarchy['pro'] || 0; // Calendar benötigt Pro
    
    return userLevel >= requiredLevel;
  };

  const fetchWorkspaces = async () => {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id, workspaces(id, name)")
      .eq("user_id", user?.id);

    if (error) {
      console.error("Failed to load workspaces:", error);
    } else if (data && data.length > 0) {
      const ws = data.map((d: any) => d.workspaces).filter(Boolean);
      setWorkspaces(ws);
      if (!selectedWorkspace && ws.length > 0) {
        setSelectedWorkspace(ws[0].id);
      }
    }
  };

  const fetchClients = async () => {
    if (!selectedWorkspace) return;
    
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("workspace_id", selectedWorkspace)
      .order("name");

    if (error) {
      console.error("Failed to load clients:", error);
    } else {
      setClients(data || []);
    }
  };

  const fetchBrands = async () => {
    if (!selectedWorkspace) return;
    
    const { data, error } = await supabase
      .from("brand_kits")
      .select("*")
      .eq("user_id", user?.id)
      .order("brand_name");

    if (error) {
      console.error("Failed to load brands:", error);
    } else {
      setBrands(data || []);
    }
  };

  const fetchEvents = async () => {
    if (!selectedWorkspace) return;
    
    setLoading(true);
    
    let query = supabase
      .from("calendar_events")
      .select("*")
      .eq("workspace_id", selectedWorkspace);
    
    if (selectedClient) {
      query = query.eq("client_id", selectedClient);
    }
    
    if (selectedBrand) {
      query = query.eq("brand_kit_id", selectedBrand);
    }
    
    query = query.order("start_at", { ascending: true });

    const { data, error } = await query;

    if (error) {
      toast.error("Failed to load events");
      console.error(error);
    } else {
      setEvents(data || []);
    }
    
    setLoading(false);
  };

  const handleEventClick = (event: CalendarEvent) => {
    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }
    setSelectedEvent(event);
    setShowEventDetail(true);
  };

  const handleDateClick = (date: Date) => {
    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }
    // TODO: Open create event dialog
    toast.info("Create event feature coming soon");
  };

  const handleEventMove = async (eventId: string, newDate: Date) => {
    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }

    const { error } = await supabase
      .from("calendar_events")
      .update({ start_at: newDate.toISOString() })
      .eq("id", eventId);

    if (error) {
      toast.error("Failed to move event");
      console.error(error);
    } else {
      await emit({
        event_type: 'calendar.post.scheduled',
        source: 'calendar',
        payload: { event_id: eventId, new_date: newDate.toISOString() },
      }, { silent: true });
      
      toast.success("Event rescheduled");
      fetchEvents();
    }
  };

  const handleStatusChange = async (eventId: string, newStatus: any) => {
    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }

    const { error } = await supabase
      .from("calendar_events")
      .update({ status: newStatus as any })
      .eq("id", eventId);

    if (error) {
      toast.error("Failed to update status");
      console.error(error);
    } else {
      toast.success("Status updated");
      fetchEvents();
    }
  };

  const handleFilter = () => {
    toast.info("Filter feature coming soon");
  };

  const handleShare = () => {
    toast.info("Share feature coming soon");
  };

  const handleExport = () => {
    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }
    
    const scheduledEvents = events.filter(e => e.status === 'scheduled');
    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CaptionGenie//Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    scheduledEvents.forEach(event => {
      const start = new Date(event.start_at || new Date());
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      
      icsContent.push(
        'BEGIN:VEVENT',
        `DTSTART:${start.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
        `DTEND:${end.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
        `SUMMARY:${event.title}`,
        `DESCRIPTION:${event.caption?.substring(0, 200) || ''}`,
        `UID:${event.id}@captiongenie.com`,
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

  const handleCreateEvent = () => {
    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }
    toast.info("Create event feature coming soon");
  };

  const handleAddNote = () => {
    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }
    toast.info("Add note feature coming soon");
  };

  const renderView = () => {
    // Transform events to Post format that views expect
    const transformedPosts = events.map(event => ({
      id: event.id,
      title: event.title,
      channels: event.channels,
      status: event.status,
      start_at: event.start_at || new Date().toISOString(),
      end_at: event.end_at,
      timezone: event.timezone,
      campaign_id: event.campaign_id,
      owner_id: event.owner_id,
      brief: event.brief,
    }));

    const commonProps = {
      posts: transformedPosts as any,
      onPostClick: handleEventClick as any,
      readOnly: !hasCalendarAccess(),
    };

    switch (currentView) {
      case "month":
        return (
          <MonthView
            {...commonProps}
            onDateClick={handleDateClick}
          />
        );
      case "week":
        return (
          <WeekView
            {...commonProps}
            onPostMove={handleEventMove as any}
          />
        );
      case "list":
        return (
          <ListView
            {...commonProps}
          />
        );
      case "kanban":
        return (
          <KanbanView
            {...commonProps}
            onStatusChange={handleStatusChange as any}
          />
        );
      case "timeline":
        return <TimelineView {...commonProps} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <Breadcrumbs category="optimize" feature="calendar_title" />

        <div className="space-y-6">
          {/* Scope Switcher */}
          <CalendarHeader
            workspaceId={selectedWorkspace}
            clientId={selectedClient}
            brandId={selectedBrand}
            onWorkspaceChange={setSelectedWorkspace}
            onClientChange={setSelectedClient}
            onBrandChange={setSelectedBrand}
            workspaces={workspaces}
            clients={clients}
            brands={brands.map(b => ({ id: b.id, name: b.brand_name || 'Unnamed Brand' }))}
          />

          {/* Toolbar */}
          <CalendarToolbar
            currentView={currentView}
            onViewChange={setCurrentView}
            onFilter={handleFilter}
            onAddNote={handleAddNote}
            onCreateEvent={handleCreateEvent}
            onShare={handleShare}
            onExport={handleExport}
            readOnly={!hasCalendarAccess()}
          />

          {/* View Container */}
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : !selectedWorkspace ? (
            <div className="text-center py-12 text-muted-foreground">
              Please select a workspace to view calendar
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No events found. Create your first event to get started.
            </div>
          ) : (
            renderView()
          )}
        </div>
      </main>

      <Footer />

      {/* Event Detail Dialog */}
      {selectedEvent && (
        <EventDetailDialog
          event={selectedEvent}
          open={showEventDetail}
          onClose={() => {
            setShowEventDetail(false);
            setSelectedEvent(null);
          }}
          onSave={fetchEvents}
        />
      )}

      <PlanLimitDialog
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        feature="Smart Content Calendar"
      />
    </div>
  );
}
