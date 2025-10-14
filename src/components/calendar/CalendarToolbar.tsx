import { Plus, StickyNote, Download, Filter, Share2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/hooks/useTranslation";

export type ViewType = "month" | "week" | "list" | "kanban" | "timeline";

export interface CalendarToolbarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onAddPost?: () => void;
  onCreateEvent?: () => void;
  onAddNote: () => void;
  onExport: () => void;
  onFilter: () => void;
  onShare: () => void;
  readOnly?: boolean;
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
  readOnly,
}: CalendarToolbarProps) {
  const { t } = useTranslation();
  const createHandler = onCreateEvent || onAddPost;

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
          
          <Button variant="ghost" size="sm" onClick={onExport}>
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}