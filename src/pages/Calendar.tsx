import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { useIsMobile } from "@/hooks/use-mobile";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { CalendarToolbar, ViewType } from "@/components/calendar/CalendarToolbar";
import { MonthView } from "@/components/calendar/views/MonthView";
import { WeekView } from "@/components/calendar/views/WeekView";
import { ListView } from "@/components/calendar/views/ListView";
import { KanbanView } from "@/components/calendar/views/KanbanView";
import { TimelineView } from "@/components/calendar/views/TimelineView";
import { EventDetailDialog } from "@/components/calendar/EventDetailDialog";
import { EventCreateDialog } from "@/components/calendar/EventCreateDialog";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";
import { CalendarEmptyState } from "@/components/calendar/CalendarEmptyState";
import { AutoScheduleDialog } from "@/components/calendar/AutoScheduleDialog";
import { CampaignTemplateDialog } from "@/components/calendar/CampaignTemplateDialog";
import { BlackoutDatePicker } from "@/components/calendar/BlackoutDatePicker";
import { HolidaySuggestionsDialog } from "@/components/calendar/HolidaySuggestionsDialog";
import { CalendarMetricsDashboard } from "@/components/calendar/CalendarMetricsDashboard";
import { exportToCSV, exportToPDF, exportToICS, exportMetricsToCSV } from "@/lib/calendarExport";

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
  const isMobile = useIsMobile();
  
  // View State
  const [currentView, setCurrentView] = useState<ViewType>("month");
  
  // Data State
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Scope State
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [brands, setBrands] = useState<BrandKit[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  
  // UI State
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventDetail, setShowEventDetail] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [prefillDate, setPrefillDate] = useState<Date | null>(null);
  const [userPlan, setUserPlan] = useState<string>("free");
  const [showUpgrade, setShowUpgrade] = useState(false);
  
  // Sprint 5-6: AI & Automation Dialogs
  const [showAutoSchedule, setShowAutoSchedule] = useState(false);
  const [showCampaignTemplates, setShowCampaignTemplates] = useState(false);
  const [showBlackoutDates, setShowBlackoutDates] = useState(false);
  const [showHolidays, setShowHolidays] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [showMetricsDashboard, setShowMetricsDashboard] = useState(true);

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
      fetchWorkspaceMembers();
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
    try {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id, workspaces(id, name)")
        .eq("user_id", user?.id);

      if (error) {
        console.error("Failed to load workspaces:", error);
        setLoading(false);
        return;
      }

      if (data && data.length > 0) {
        const ws = data.map((d: any) => d.workspaces).filter(Boolean);
        setWorkspaces(ws);
        if (!selectedWorkspace && ws.length > 0) {
          setSelectedWorkspace(ws[0].id);
        }
        setLoading(false);
      } else {
        // No workspaces found - auto-create a default workspace
        await createDefaultWorkspace();
      }
    } catch (error) {
      console.error("Error fetching workspaces:", error);
      setLoading(false);
    }
  };

  const createDefaultWorkspace = async () => {
    try {
      // Create default workspace
      const { data: workspace, error: wsError } = await supabase
        .from("workspaces")
        .insert({
          name: t("calendar.messages.defaultWorkspace"),
          owner_id: user?.id,
        })
        .select()
        .single();

      if (wsError) {
        console.error("Failed to create workspace:", wsError);
        setLoading(false);
        return;
      }

      // Add user as member
      const { error: memberError } = await supabase
        .from("workspace_members")
        .insert({
          workspace_id: workspace.id,
          user_id: user?.id,
          role: "owner",
        });

      if (memberError) {
        console.error("Failed to add workspace member:", memberError);
      }

      // Refresh workspaces
      await fetchWorkspaces();
      toast.success(t("calendar.messages.workspaceCreated"));
    } catch (error) {
      console.error("Error creating default workspace:", error);
      setLoading(false);
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

  const fetchWorkspaceMembers = async () => {
    if (!selectedWorkspace) return;
    
    const { data, error } = await supabase
      .from("workspace_members")
      .select("user_id, profiles(id, email)")
      .eq("workspace_id", selectedWorkspace);

    if (error) {
      console.error("Failed to load members:", error);
    } else {
      setWorkspaceMembers(data || []);
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
      toast.error(t("calendar.messages.loadFailed"));
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
    setPrefillDate(date);
    setShowCreateDialog(true);
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
      toast.error(t("calendar.messages.moveFailed"));
      console.error(error);
    } else {
      await emit({
        event_type: 'calendar.post.scheduled',
        source: 'calendar',
        payload: { event_id: eventId, new_date: newDate.toISOString() },
      }, { silent: true });
      
      toast.success(t("calendar.messages.eventMoved"));
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
      toast.error(t("calendar.messages.statusFailed"));
      console.error(error);
    } else {
      toast.success(t("calendar.messages.statusUpdated"));
      fetchEvents();
    }
  };

  const handleFilter = () => {
    toast.info(t("calendar.messages.filterComingSoon"));
  };

  const handleShare = () => {
    toast.info(t("calendar.messages.shareComingSoon"));
  };

  const handleExport = async (format: 'csv' | 'pdf' | 'ics' | 'metrics') => {
    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }
    
    // Validate that there are events to export
    if (events.length === 0) {
      toast.error(t("calendar.messages.noEventsToExport"));
      return;
    }
    
    try {
      toast.info(`Starting ${format.toUpperCase()} export...`);
      
      switch (format) {
        case 'csv':
          await exportToCSV(events);
          toast.success('CSV export completed');
          break;
          
        case 'pdf':
          toast.info(t("calendar.messages.pdfPrintDialog"));
          const now = new Date();
          await exportToPDF({
            workspaceId: selectedWorkspace,
            brandKitId: selectedBrand,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
            format: 'pdf'
          });
          break;
          
        case 'ics':
          await exportToICS(events.filter(e => e.status === 'scheduled'));
          toast.success(t("calendar.messages.exportSuccess"));
          break;
          
        case 'metrics':
          await exportMetricsToCSV(events);
          toast.success('Metrics export completed');
          break;
      }
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error(error.message || 'Export failed');
    }
  };

  const handleCreateEvent = () => {
    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }
    setPrefillDate(null);
    setShowCreateDialog(true);
  };

  const handleAddNote = () => {
    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }
    toast.info(t("calendar.messages.addNoteComingSoon"));
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
        <Breadcrumbs category="optimize" feature="calendar.title" />

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
            onOpenAutoSchedule={() => setShowAutoSchedule(true)}
            onOpenCampaignTemplates={() => setShowCampaignTemplates(true)}
            onOpenBlackoutDates={() => setShowBlackoutDates(true)}
            onOpenHolidays={() => setShowHolidays(true)}
            readOnly={!hasCalendarAccess()}
          />

          {/* Metrics Dashboard */}
          {showMetricsDashboard && events.length > 0 && (
            <CalendarMetricsDashboard 
              events={events}
              workspaceMembers={workspaceMembers}
            />
          )}

          {/* View Container */}
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : workspaces.length === 0 ? (
            <CalendarEmptyState />
          ) : !selectedWorkspace ? (
            <div className="text-center py-12 text-muted-foreground">
              {t("calendar.empty.noWorkspace")}
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

      {/* Event Create Dialog */}
      {showCreateDialog && (
        <EventCreateDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          workspaceId={selectedWorkspace}
          clients={clients}
          brands={brands}
          workspaceMembers={workspaceMembers}
          prefillDate={prefillDate}
          onSuccess={fetchEvents}
        />
      )}

      {/* Upgrade Dialog */}
      <PlanLimitDialog
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        feature="Smart Content Calendar"
      />

      {/* Sprint 5-6: AI & Automation Dialogs */}
      <AutoScheduleDialog
        open={showAutoSchedule}
        onClose={() => setShowAutoSchedule(false)}
        workspaceId={selectedWorkspace}
        brandKitId={selectedBrand}
        eventIds={selectedEventIds}
        onScheduled={fetchEvents}
      />

      <CampaignTemplateDialog
        open={showCampaignTemplates}
        onClose={() => setShowCampaignTemplates(false)}
        workspaceId={selectedWorkspace}
        brandKitId={selectedBrand}
        onGenerated={fetchEvents}
      />

      <BlackoutDatePicker
        open={showBlackoutDates}
        onClose={() => setShowBlackoutDates(false)}
        workspaceId={selectedWorkspace}
        brandKitId={selectedBrand}
        clientId={selectedClient}
        onSaved={fetchEvents}
      />

      <HolidaySuggestionsDialog
        open={showHolidays}
        onClose={() => setShowHolidays(false)}
        workspaceId={selectedWorkspace}
        brandKitId={selectedBrand}
        onEventCreated={fetchEvents}
      />

      {/* Floating Action Button (Mobile only) */}
      {isMobile && hasCalendarAccess && selectedWorkspace && (
        <Button
          size="lg"
          onClick={handleCreateEvent}
          className="fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg z-50 p-0"
        >
          <Plus className="w-6 h-6" />
        </Button>
      )}
    </div>
  );
}
