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
      <div className="sticky top-0 z-10 bg-background border-b pb-4 mb-4">
        <div className="flex items-center justify-between gap-2">
          {/* View Dropdown */}
          <Select value={currentView} onValueChange={(v) => onViewChange(v as ViewType)}>
            <SelectTrigger className="w-[140px]">
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

          {/* Actions Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
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
              <DropdownMenuItem onClick={() => onExport('pdf')}>
                <FileText className="w-4 h-4 mr-2" /> {t("calendar.export.pdf")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('ics')}>
                <FileDown className="w-4 h-4 mr-2" /> {t("calendar.export.ics")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('metrics')}>
                <Download className="w-4 h-4 mr-2" /> {t("calendar.export.metrics")}
              </DropdownMenuItem>
              {onOpenIntegrations && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onOpenIntegrations} disabled={readOnly}>
                    <Settings className="w-4 h-4 mr-2" /> {t("calendar.actions.manageIntegrations")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Create Button */}
          {createHandler && (
            <Button size="sm" onClick={createHandler} disabled={readOnly}>
              <Plus className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-10 backdrop-blur-xl bg-background/80 border-b border-white/10 pb-4 mb-4">
      <div className="flex items-center justify-between gap-4">
        {/* View Switcher - Premium Tabs */}
        <Tabs value={currentView} onValueChange={(v) => onViewChange(v as ViewType)}>
          <TabsList className="backdrop-blur-xl bg-card/60 border border-white/10 p-1">
            <TabsTrigger 
              value="month" 
              className="gap-2 font-semibold data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_12px_hsla(43,90%,68%,0.25)] data-[state=active]:border-primary/30 transition-all duration-200" 
              title="Empfohlene Ansicht"
            >
              <Calendar className="w-4 h-4" />
              {t("calendar.views.month")}
            </TabsTrigger>
            <TabsTrigger value="week" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_12px_hsla(43,90%,68%,0.25)] transition-all duration-200">
              {t("calendar.views.week")}
            </TabsTrigger>
            <TabsTrigger value="list" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_12px_hsla(43,90%,68%,0.25)] transition-all duration-200">
              {t("calendar.views.list")}
            </TabsTrigger>
            <TabsTrigger value="kanban" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_12px_hsla(43,90%,68%,0.25)] transition-all duration-200">
              {t("calendar.views.kanban")}
            </TabsTrigger>
            <TabsTrigger value="timeline" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_12px_hsla(43,90%,68%,0.25)] transition-all duration-200">
              {t("calendar.views.timeline")}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Actions - Enhanced Buttons */}
        <div className="flex items-center gap-2">
          {onSelectAllDrafts && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSelectAllDrafts}
              className="gap-2 bg-muted/30 border-white/10 hover:border-primary/40 hover:bg-primary/10 transition-all duration-200"
            >
              Select All Drafts
            </Button>
          )}
          {onDeselectAll && selectedEventsCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDeselectAll}
              className="gap-2 bg-muted/30 border-white/10 hover:border-primary/40 hover:bg-primary/10 transition-all duration-200"
            >
              Deselect All ({selectedEventsCount})
            </Button>
          )}
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onFilter}
            className="bg-muted/30 border-white/10 hover:border-primary/40 hover:bg-primary/10 transition-all duration-200"
          >
            <Filter className="w-4 h-4 mr-2" />
            {t("calendar.actions.filter")}
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
              className="relative overflow-hidden bg-gradient-to-r from-primary via-amber-500 to-primary bg-[length:200%_100%] hover:bg-[position:100%_0] transition-all duration-500 shadow-[0_0_20px_hsla(43,90%,68%,0.3)] hover:shadow-[0_0_30px_hsla(43,90%,68%,0.5)]"
            >
              {!hasQuickPostAccess && <Lock className="w-4 h-4 mr-2" />}
              <Sparkles className="w-4 h-4 mr-2" />
              AI Auto-Schedule ({selectedEventsCount})
            </Button>
          )}
          
          {onOpenCampaignTemplates && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onOpenCampaignTemplates} 
                disabled={readOnly}
                className="bg-muted/30 border-white/10 hover:border-primary/40 hover:bg-primary/10 transition-all duration-200"
              >
                <Rocket className="w-4 h-4 mr-2" />
                Templates
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate("/calendar/templates")}
                className="bg-muted/30 border-white/10 hover:border-primary/40 hover:bg-primary/10 transition-all duration-200"
              >
                <Library className="w-4 h-4 mr-2" />
                Vorlagen verwalten
              </Button>
            </>
          )}
          
          {onOpenBlackoutDates && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onOpenBlackoutDates} 
              disabled={readOnly}
              className="bg-muted/30 border-white/10 hover:border-primary/40 hover:bg-primary/10 transition-all duration-200"
            >
              <Ban className="w-4 h-4 mr-2" />
              Blackout
            </Button>
          )}
          
          {onOpenHolidays && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onOpenHolidays}
              className="bg-muted/30 border-white/10 hover:border-primary/40 hover:bg-primary/10 transition-all duration-200"
            >
              <PartyPopper className="w-4 h-4 mr-2" />
              Holidays
            </Button>
          )}
          
          {onOpenIntegrations && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onOpenIntegrations} 
              disabled={readOnly}
              className="bg-muted/30 border-white/10 hover:border-primary/40 hover:bg-primary/10 transition-all duration-200"
            >
              <Settings className="w-4 h-4 mr-2" />
              {t("calendar.actions.manageIntegrations")}
            </Button>
          )}
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onAddNote} 
            disabled={readOnly}
            className="bg-muted/30 border-white/10 hover:border-primary/40 hover:bg-primary/10 transition-all duration-200"
          >
            <StickyNote className="w-4 h-4 mr-2" />
            {t("calendar.actions.addNote")}
          </Button>
          
          {createHandler && (
            <Button 
              size="sm" 
              onClick={createHandler} 
              disabled={readOnly}
              className="bg-gradient-to-r from-primary to-amber-500 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.3)] transition-all duration-200"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("calendar.actions.createEvent")}
            </Button>
          )}
          
          <div className="h-6 w-px bg-white/10" />
          
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onShare}
            className="hover:bg-primary/10 hover:text-primary transition-all duration-200"
          >
            <Share2 className="w-4 h-4" />
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm"
                className="hover:bg-primary/10 hover:text-primary transition-all duration-200"
              >
                <Download className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="backdrop-blur-xl bg-popover/95 border-white/10">
              <DropdownMenuItem onClick={() => onExport('csv')}>
                <FileSpreadsheet className="w-4 h-4 mr-2" /> {t("calendar.export.csv")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('pdf')}>
                <FileText className="w-4 h-4 mr-2" /> {t("calendar.export.pdf")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('ics')}>
                <FileDown className="w-4 h-4 mr-2" /> {t("calendar.export.ics")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem onClick={() => onExport('metrics')}>
                <Download className="w-4 h-4 mr-2" /> {t("calendar.export.metrics")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      <QuickPostUpsellModal open={showUpsell} onClose={() => setShowUpsell(false)} />
    </div>
  );
}