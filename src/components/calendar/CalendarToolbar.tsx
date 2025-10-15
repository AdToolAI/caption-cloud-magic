import { Plus, StickyNote, Download, Filter, Share2, Calendar, MoreVertical, Sparkles, Rocket, Ban, PartyPopper, FileText, FileSpreadsheet, FileDown, Settings, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";

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
}: CalendarToolbarProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const createHandler = onCreateEvent || onAddPost;

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
    <div className="sticky top-0 z-10 bg-background border-b pb-4 mb-4">
      <div className="flex items-center justify-between gap-4">
        {/* View Switcher */}
        <Tabs value={currentView} onValueChange={(v) => onViewChange(v as ViewType)}>
          <TabsList>
            <TabsTrigger value="month" className="gap-2">
              <Calendar className="w-4 h-4" />
              {t("calendar.views.month")}
            </TabsTrigger>
            <TabsTrigger value="week">{t("calendar.views.week")}</TabsTrigger>
            <TabsTrigger value="list">{t("calendar.views.list")}</TabsTrigger>
            <TabsTrigger value="kanban">{t("calendar.views.kanban")}</TabsTrigger>
            <TabsTrigger value="timeline">{t("calendar.views.timeline")}</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onFilter}>
            <Filter className="w-4 h-4 mr-2" />
            {t("calendar.actions.filter")}
          </Button>
          
          {onOpenAutoSchedule && selectedEventsCount > 0 && (
            <Button variant="default" size="sm" onClick={onOpenAutoSchedule} disabled={readOnly}>
              <Sparkles className="w-4 h-4 mr-2" />
              AI Auto-Schedule ({selectedEventsCount})
            </Button>
          )}
          
          {onOpenCampaignTemplates && (
            <>
              <Button variant="outline" size="sm" onClick={onOpenCampaignTemplates} disabled={readOnly}>
                <Rocket className="w-4 h-4 mr-2" />
                Templates
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/calendar/templates")}>
                <Library className="w-4 h-4 mr-2" />
                Vorlagen verwalten
              </Button>
            </>
          )}
          
          {onOpenBlackoutDates && (
            <Button variant="outline" size="sm" onClick={onOpenBlackoutDates} disabled={readOnly}>
              <Ban className="w-4 h-4 mr-2" />
              Blackout
            </Button>
          )}
          
          {onOpenHolidays && (
            <Button variant="outline" size="sm" onClick={onOpenHolidays}>
              <PartyPopper className="w-4 h-4 mr-2" />
              Holidays
            </Button>
          )}
          
          {onOpenIntegrations && (
            <Button variant="outline" size="sm" onClick={onOpenIntegrations} disabled={readOnly}>
              <Settings className="w-4 h-4 mr-2" />
              {t("calendar.actions.manageIntegrations")}
            </Button>
          )}
          
          <Button variant="outline" size="sm" onClick={onAddNote} disabled={readOnly}>
            <StickyNote className="w-4 h-4 mr-2" />
            {t("calendar.actions.addNote")}
          </Button>
          
          {createHandler && (
            <Button size="sm" onClick={createHandler} disabled={readOnly}>
              <Plus className="w-4 h-4 mr-2" />
              {t("calendar.actions.createEvent")}
            </Button>
          )}
          
          <div className="h-6 w-px bg-border" />
          
          <Button variant="ghost" size="sm" onClick={onShare}>
            <Share2 className="w-4 h-4" />
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Download className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExport('csv')}>
                <FileSpreadsheet className="w-4 h-4 mr-2" /> {t("calendar.export.csv")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('pdf')}>
                <FileText className="w-4 h-4 mr-2" /> {t("calendar.export.pdf")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('ics')}>
                <FileDown className="w-4 h-4 mr-2" /> {t("calendar.export.ics")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onExport('metrics')}>
                <Download className="w-4 h-4 mr-2" /> {t("calendar.export.metrics")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}