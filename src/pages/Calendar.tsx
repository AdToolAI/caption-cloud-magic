import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOptimizedCache } from "@/hooks/useOptimizedCache";
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
import { EventDrawer } from "@/components/calendar/EventDrawer";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";
import { CalendarEmptyState } from "@/components/calendar/CalendarEmptyState";
import { AutoScheduleDialog } from "@/components/calendar/AutoScheduleDialog";
import { CampaignTemplateDialog } from "@/components/calendar/CampaignTemplateDialog";
import { BlackoutDatePicker } from "@/components/calendar/BlackoutDatePicker";
import { HolidaySuggestionsDialog } from "@/components/calendar/HolidaySuggestionsDialog";
import { IntegrationSettingsDialog } from "@/components/calendar/IntegrationSettingsDialog";
import { CalendarMetricsDashboard } from "@/components/calendar/CalendarMetricsDashboard";
import { PublishingStatusPanel } from "@/components/calendar/PublishingStatusPanel";
import { exportToCSV, exportToPDF, exportToICS, exportMetricsToCSV } from "@/lib/calendarExport";
import { ScheduleQuickForm } from "@/components/calendar/ScheduleQuickForm";

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
  const queryClient = useQueryClient();
  
  // View State
  const [currentView, setCurrentView] = useState<ViewType>("month");
  
  // Scope State
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  
  // UI State
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventDetail, setShowEventDetail] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEventDrawer, setShowEventDrawer] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [prefillDate, setPrefillDate] = useState<Date | null>(null);
  const [userPlan, setUserPlan] = useState<string>("free");
  const [showUpgrade, setShowUpgrade] = useState(false);
  
  // Sprint 5-6: AI & Automation Dialogs
  const [showAutoSchedule, setShowAutoSchedule] = useState(false);
  const [showCampaignTemplates, setShowCampaignTemplates] = useState(false);
  const [showBlackoutDates, setShowBlackoutDates] = useState(false);
  const [showHolidays, setShowHolidays] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [showMetricsDashboard, setShowMetricsDashboard] = useState(true);
  const [selectedEventForLogs, setSelectedEventForLogs] = useState<string | null>(null);

  // React Query: Events with caching
  const {
    data: events = [],
    isLoading: eventsLoading,
    invalidate: invalidateEvents,
  } = useOptimizedCache({
    queryKey: ['calendar-events', selectedWorkspace, selectedClient, selectedBrand],
    queryFn: async () => {
      if (!selectedWorkspace) return [];
      
      let query = supabase
        .from("calendar_events")
        .select("*")
        .eq("workspace_id", selectedWorkspace);
      
      if (selectedClient) query = query.eq("client_id", selectedClient);
      if (selectedBrand) query = query.eq("brand_kit_id", selectedBrand);
      
      query = query.order("start_at", { ascending: true });
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: true,
    enabled: !!selectedWorkspace,
  });

  // React Query: Workspaces
  const {
    data: workspaces = [],
    isLoading: workspacesLoading,
  } = useOptimizedCache({
    queryKey: ['workspaces', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id, workspaces(id, name)")
        .eq("user_id", user?.id);
      
      if (error) throw error;
      return data?.map((d: any) => d.workspaces).filter(Boolean) || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });

  // React Query: Clients
  const { data: clients = [] } = useOptimizedCache({
    queryKey: ['clients', selectedWorkspace],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("workspace_id", selectedWorkspace)
        .order("name");
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!selectedWorkspace,
  });

  // React Query: Brands
  const { data: brands = [] } = useOptimizedCache({
    queryKey: ['brands', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_kits")
        .select("*")
        .eq("user_id", user?.id)
        .order("brand_name");
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });

  // React Query: Workspace Members
  const { data: workspaceMembers = [] } = useOptimizedCache({
    queryKey: ['workspace-members', selectedWorkspace],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", selectedWorkspace);
      
      if (error) throw error;
      
      // Fetch profiles separately
      if (data && data.length > 0) {
        const userIds = data.map(m => m.user_id);
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", userIds);
        
        if (!profilesError && profiles) {
          return data.map(m => ({
            user_id: m.user_id,
            profiles: profiles.find(p => p.id === m.user_id) || { id: m.user_id, email: '' }
          }));
        }
      }
      
      return data?.map(m => ({ user_id: m.user_id, profiles: { id: m.user_id, email: '' } })) || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!selectedWorkspace,
  });

  const loading = workspacesLoading || eventsLoading;

  useEffect(() => {
    if (user) {
      fetchUserPlan();
    }
  }, [user]);

  useEffect(() => {
    if (workspaces.length > 0 && !selectedWorkspace) {
      setSelectedWorkspace(workspaces[0].id);
    }
  }, [workspaces, selectedWorkspace]);

  const fetchUserPlan = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("plan, test_mode_plan")
      .eq("id", user?.id)
      .single();
    
    if (data) {
      setUserPlan(data.test_mode_plan || data.plan || "free");
    }
  };

  const hasCalendarAccess = () => {
    const planHierarchy: Record<string, number> = {
      'free': 0,
      'basic': 1,
      'pro': 2,
      'enterprise': 3
    };
    
    const userLevel = planHierarchy[userPlan] || 0;
    const requiredLevel = planHierarchy['pro'] || 0;
    
    return userLevel >= requiredLevel;
  };

  const handleEventClick = (event: CalendarEvent) => {
    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }
    setSelectedEventId(event.id);
    setShowEventDrawer(true);
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

    // Optimistic Update
    const queryKey = ['calendar-events', selectedWorkspace, selectedClient, selectedBrand];
    const previousEvents = queryClient.getQueryData<CalendarEvent[]>(queryKey);
    
    queryClient.setQueryData<CalendarEvent[]>(queryKey, (old = []) =>
      old.map(e => e.id === eventId ? { ...e, start_at: newDate.toISOString() } : e)
    );

    try {
      const { error } = await supabase
        .from("calendar_events")
        .update({ start_at: newDate.toISOString() })
        .eq("id", eventId);

      if (error) throw error;

      await emit({
        event_type: 'calendar.post.scheduled',
        source: 'calendar',
        payload: { event_id: eventId, new_date: newDate.toISOString() },
      }, { silent: true });
      
      toast.success(t("calendar.messages.eventMoved"));
    } catch (error) {
      // Rollback on error
      if (previousEvents) {
        queryClient.setQueryData(queryKey, previousEvents);
      }
      toast.error(t("calendar.messages.moveFailed"));
      console.error(error);
    }
  };

  const handleStatusChange = async (eventId: string, newStatus: any) => {
    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }

    // Optimistic Update
    const queryKey = ['calendar-events', selectedWorkspace, selectedClient, selectedBrand];
    const previousEvents = queryClient.getQueryData<CalendarEvent[]>(queryKey);
    
    queryClient.setQueryData<CalendarEvent[]>(queryKey, (old = []) =>
      old.map(e => e.id === eventId ? { ...e, status: newStatus } : e)
    );

    try {
      const { error } = await supabase
        .from("calendar_events")
        .update({ status: newStatus as any })
        .eq("id", eventId);

      if (error) throw error;
      toast.success(t("calendar.messages.statusUpdated"));
    } catch (error) {
      // Rollback on error
      if (previousEvents) {
        queryClient.setQueryData(queryKey, previousEvents);
      }
      toast.error(t("calendar.messages.statusFailed"));
      console.error(error);
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
      onPostClick: (post: any) => {
        // Toggle selection for draft events
        if (post.status === 'draft') {
          setSelectedEventIds(prev => 
            prev.includes(post.id) 
              ? prev.filter(id => id !== post.id)
              : [...prev, post.id]
          );
        } else {
          handleEventClick(post);
        }
      },
      readOnly: !hasCalendarAccess(),
      selectedEventIds,
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
            onOpenIntegrations={() => setShowIntegrations(true)}
            readOnly={!hasCalendarAccess()}
          selectedEventsCount={selectedEventIds.length}
          onSelectAllDrafts={() => {
            const selectableStatuses = ['briefing', 'in_progress', 'review', 'approved'];
            const draftEventIds = events
              .filter(event => selectableStatuses.includes(event.status))
              .map(event => event.id);
            setSelectedEventIds(draftEventIds);
          }}
          onDeselectAll={() => setSelectedEventIds([])}
        />

          {/* Metrics Dashboard */}
          {showMetricsDashboard && events.length > 0 && (
            <CalendarMetricsDashboard 
              events={events}
              workspaceMembers={workspaceMembers}
            />
          )}

          {/* Publishing Status Panel & Quick Schedule */}
          {selectedWorkspace && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <ScheduleQuickForm 
                workspaceId={selectedWorkspace}
                onSuccess={() => invalidateEvents()}
              />
              <PublishingStatusPanel workspaceId={selectedWorkspace} />
            </div>
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
          onSave={invalidateEvents}
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
          onSuccess={invalidateEvents}
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
        onScheduled={invalidateEvents}
      />

      <CampaignTemplateDialog
        open={showCampaignTemplates}
        onClose={() => setShowCampaignTemplates(false)}
        workspaceId={selectedWorkspace}
        brandKitId={selectedBrand}
        onGenerated={invalidateEvents}
      />

      <BlackoutDatePicker
        open={showBlackoutDates}
        onClose={() => setShowBlackoutDates(false)}
        workspaceId={selectedWorkspace}
        brandKitId={selectedBrand}
        clientId={selectedClient}
        onSaved={invalidateEvents}
      />

      <HolidaySuggestionsDialog
        open={showHolidays}
        onClose={() => setShowHolidays(false)}
        workspaceId={selectedWorkspace}
        brandKitId={selectedBrand}
        onEventCreated={invalidateEvents}
      />

      <IntegrationSettingsDialog
        open={showIntegrations}
        onClose={() => setShowIntegrations(false)}
        workspaceId={selectedWorkspace}
      />

      {/* Event Drawer (Right Panel) */}
      <EventDrawer
        open={showEventDrawer}
        onClose={() => {
          setShowEventDrawer(false);
          setSelectedEventId(null);
        }}
        eventId={selectedEventId}
        onDelete={invalidateEvents}
        onUpdate={invalidateEvents}
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
