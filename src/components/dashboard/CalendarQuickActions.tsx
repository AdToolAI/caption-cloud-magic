import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, Calendar, FileDown, Plus } from "lucide-react";

interface CalendarQuickActionsProps {
  onAutoSchedule?: () => void;
  onScheduleDrafts?: () => void;
  onExport?: () => void;
  onNewCampaign?: () => void;
  loading?: boolean;
}

export function CalendarQuickActions({
  onAutoSchedule,
  onScheduleDrafts,
  onExport,
  onNewCampaign,
  loading,
}: CalendarQuickActionsProps) {
  const actions = [
    {
      title: "Auto-Planung",
      description: "Beste Slots für laufende Kampagnen finden",
      icon: Zap,
      onClick: onAutoSchedule,
      variant: "default" as const,
    },
    {
      title: "Draft-Posts einplanen",
      description: "Alle Entwürfe dieser Woche automatisch planen",
      icon: Calendar,
      onClick: onScheduleDrafts,
      variant: "outline" as const,
    },
    {
      title: "Export (ICS/CSV)",
      description: "Kalender für diese Woche exportieren",
      icon: FileDown,
      onClick: onExport,
      variant: "outline" as const,
    },
    {
      title: "Neue Kampagne",
      description: "Mehrteilige Kampagne mit Plan erstellen",
      icon: Plus,
      onClick: onNewCampaign,
      variant: "outline" as const,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick-Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {actions.map((action, idx) => {
            const Icon = action.icon;
            return (
              <Button
                key={idx}
                variant={action.variant}
                className="h-auto flex-col items-start p-4 text-left"
                onClick={action.onClick}
                disabled={loading}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{action.title}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {action.description}
                </span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
