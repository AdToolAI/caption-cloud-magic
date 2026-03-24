import { useState } from "react";
import { Plus, StickyNote, Download, Filter, Share2, Calendar, MoreVertical, Sparkles, Rocket, Ban, PartyPopper, FileText, FileSpreadsheet, FileDown, Settings, Library, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { canQuickCalendarPost } from "@/lib/entitlements";
import { QuickPostUpsellModal } from "@/components/pricing/QuickPostUpsellModal";

export type ViewType = "month" | "week" | "list" | "kanban" | "timeline";

export interface CalendarToolbarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onAddPost?: () => void;
  onCreateEvent?: () => void;
  onAddNote: () => void;
  onExport: (format: 'csv' | 'pdf' | 'ics' | 'metrics') => void;
  onFilter: () => void;
  onShare: () => void;
  onOpenAutoSchedule?: () => void;
  onOpenCampaignTemplates?: () => void;
  onOpenBlackoutDates?: () => void;
  onOpenHolidays?: () => void;
  onOpenIntegrations?: () => void;
  readOnly?: boolean;
  selectedEventsCount?: number;
  onSelectAllDrafts?: () => void;
  onDeselectAll?: () => void;
}

export function CalendarToolbar({
  currentView,
  onViewChange,
  onAddPost,
  onCreateEvent,
  onAddNote,
  onExport,
  onFilter,
  onShare,
  onOpenAutoSchedule,
  onOpenCampaignTemplates,
  onOpenBlackoutDates,
  onOpenHolidays,
  onOpenIntegrations,
  readOnly,
  selectedEventsCount = 0,
  onSelectAllDrafts,
  onDeselectAll,
}: CalendarToolbarProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showUpsell, setShowUpsell] = useState(false);
  const createHandler = onCreateEvent || onAddPost;
  const userPlan = user?.user_metadata?.plan_type;
  const hasQuickPostAccess = canQuickCalendarPost(userPlan);

  if (isMobile) {
    return (
      <div className="sticky top-0 z-10 bg-background border-b pb-3 mb-3">
        <div className="flex items-center justify-between gap-2">
          <Select value={currentView} onValueChange={(v) => onViewChange(v as ViewType)}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">📅 {t("calendar.views.month")}</SelectItem>
              <SelectItem value="week">📆 {t("calendar.views.week")}</SelectItem>
              <SelectItem value="list">📋 {t("calendar.views.list")}</SelectItem>
              <SelectItem value="kanban">📊 {t("calendar.views.kanban")}</SelectItem>
              <SelectItem value="timeline">⏱️ {t("calendar.views.timeline")}</SelectItem>
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-50 bg-popover">
              <DropdownMenuItem onClick={onFilter}>
                <Filter className="w-4 h-4 mr-2" /> {t("calendar.actions.filter")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAddNote} disabled={readOnly}>
                <StickyNote className="w-4 h-4 mr-2" /> {t("calendar.actions.addNote")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onShare}>
                <Share2 className="w-4 h-4 mr-2" /> {t("calendar.actions.share")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onExport('csv')}>
                <FileSpreadsheet className="w-4 h-4 mr-2" /> {t("calendar.export.csv")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('ics')}>
                <FileDown className="w-4 h-4 mr-2" /> {t("calendar.export.ics")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {createHandler && (
            <Button size="sm" onClick={createHandler} disabled={readOnly} className="h-9">
              <Plus className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-10 backdrop-blur-xl bg-background/80 border-b border-white/10 pb-3 mb-3">
      <div className="flex items-center justify-between gap-3">
        {/* View Switcher - Compact */}
        <Tabs value={currentView} onValueChange={(v) => onViewChange(v as ViewType)}>
          <TabsList className="h-9 backdrop-blur-xl bg-card/60 border border-white/10 p-0.5">
            <TabsTrigger 
              value="month" 
              className="h-8 px-3 text-xs gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_10px_hsla(43,90%,68%,0.2)] transition-all duration-200"
            >
              <Calendar className="w-3.5 h-3.5" />
              {t("calendar.views.month")}
            </TabsTrigger>
            <TabsTrigger value="week" className="h-8 px-3 text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_10px_hsla(43,90%,68%,0.2)] transition-all duration-200">
              {t("calendar.views.week")}
            </TabsTrigger>
            <TabsTrigger value="list" className="h-8 px-3 text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_10px_hsla(43,90%,68%,0.2)] transition-all duration-200">
              {t("calendar.views.list")}
            </TabsTrigger>
            <TabsTrigger value="kanban" className="h-8 px-3 text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_10px_hsla(43,90%,68%,0.2)] transition-all duration-200">
              {t("calendar.views.kanban")}
            </TabsTrigger>
            <TabsTrigger value="timeline" className="h-8 px-3 text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_10px_hsla(43,90%,68%,0.2)] transition-all duration-200">
              {t("calendar.views.timeline")}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Actions - Compact with "More" dropdown */}
        <div className="flex items-center gap-1.5">
          {onSelectAllDrafts && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSelectAllDrafts}
              className="h-8 text-xs bg-muted/30 border-white/10 hover:border-primary/40 hover:bg-primary/10"
            >
              Entwürfe wählen
            </Button>
          )}
          
          {onDeselectAll && selectedEventsCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDeselectAll}
              className="h-8 text-xs bg-muted/30 border-white/10 hover:border-primary/40 hover:bg-primary/10"
            >
              Abwählen ({selectedEventsCount})
            </Button>
          )}
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onFilter}
            className="h-8 px-2 bg-muted/30 border-white/10 hover:border-primary/40 hover:bg-primary/10"
          >
            <Filter className="w-3.5 h-3.5" />
          </Button>
          
          {onOpenAutoSchedule && selectedEventsCount > 0 && (
            <Button 
              size="sm" 
              onClick={() => {
                if (!hasQuickPostAccess) {
                  setShowUpsell(true);
                  return;
                }
                onOpenAutoSchedule();
              }} 
              disabled={readOnly}
              className="h-8 text-xs relative overflow-hidden bg-gradient-to-r from-primary via-amber-500 to-primary bg-[length:200%_100%] hover:bg-[position:100%_0] transition-all duration-500 shadow-[0_0_15px_hsla(43,90%,68%,0.3)]"
            >
              {!hasQuickPostAccess && <Lock className="w-3 h-3 mr-1" />}
              <Sparkles className="w-3 h-3 mr-1" />
              AI ({selectedEventsCount})
            </Button>
          )}
          
          {createHandler && (
            <Button 
              size="sm" 
              onClick={createHandler} 
              disabled={readOnly}
              className="h-8 text-xs bg-gradient-to-r from-primary to-amber-500 hover:shadow-[0_0_15px_hsla(43,90%,68%,0.3)]"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Neu
            </Button>
          )}
          
          {/* More Dropdown - Groups less used actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                className="h-8 px-2 bg-muted/30 border-white/10 hover:border-primary/40 hover:bg-primary/10"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 backdrop-blur-xl bg-popover/95 border-white/10">
              {onOpenCampaignTemplates && (
                <DropdownMenuItem onClick={onOpenCampaignTemplates} disabled={readOnly}>
                  <Rocket className="w-4 h-4 mr-2" />
                  Templates
                </DropdownMenuItem>
              )}
              {onOpenCampaignTemplates && (
                <DropdownMenuItem onClick={() => navigate("/calendar/templates")}>
                  <Library className="w-4 h-4 mr-2" />
                  Vorlagen verwalten
                </DropdownMenuItem>
              )}
              {onOpenBlackoutDates && (
                <DropdownMenuItem onClick={onOpenBlackoutDates} disabled={readOnly}>
                  <Ban className="w-4 h-4 mr-2" />
                  Blackout Dates
                </DropdownMenuItem>
              )}
              {onOpenHolidays && (
                <DropdownMenuItem onClick={onOpenHolidays}>
                  <PartyPopper className="w-4 h-4 mr-2" />
                  Holidays
                </DropdownMenuItem>
              )}
              {onOpenIntegrations && (
                <DropdownMenuItem onClick={onOpenIntegrations} disabled={readOnly}>
                  <Settings className="w-4 h-4 mr-2" />
                  Integrationen
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onAddNote} disabled={readOnly}>
                <StickyNote className="w-4 h-4 mr-2" />
                Notiz hinzufügen
              </DropdownMenuItem>
              
              <DropdownMenuSeparator className="bg-white/10" />
              
              <DropdownMenuItem onClick={onShare}>
                <Share2 className="w-4 h-4 mr-2" />
                Teilen
              </DropdownMenuItem>
              
              <DropdownMenuSeparator className="bg-white/10" />
              
              <DropdownMenuItem onClick={() => onExport('csv')}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('pdf')}>
                <FileText className="w-4 h-4 mr-2" />
                Export PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('ics')}>
                <FileDown className="w-4 h-4 mr-2" />
                Export ICS
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('metrics')}>
                <Download className="w-4 h-4 mr-2" />
                Export Metrics
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      <QuickPostUpsellModal open={showUpsell} onClose={() => setShowUpsell(false)} />
    </div>
  );
}
