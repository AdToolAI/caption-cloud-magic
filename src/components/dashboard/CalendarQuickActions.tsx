import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, Calendar, FileDown, Plus } from "lucide-react";
import { useTx } from "@/lib/i18nText";

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
  const tx = useTx();
  const actions = [
    {
      title: tx({ de: "Auto-Planung", en: "Auto-scheduling", es: "Planificación automática" }),
      description: tx({ de: "Beste Slots für laufende Kampagnen finden", en: "Find the best slots for active campaigns", es: "Encontrar los mejores horarios para campañas activas" }),
      icon: Zap,
      onClick: onAutoSchedule,
      variant: "default" as const,
    },
    {
      title: tx({ de: "Draft-Posts einplanen", en: "Schedule draft posts", es: "Programar borradores" }),
      description: tx({ de: "Alle Entwürfe dieser Woche automatisch planen", en: "Automatically schedule all drafts for this week", es: "Programar automáticamente todos los borradores de esta semana" }),
      icon: Calendar,
      onClick: onScheduleDrafts,
      variant: "outline" as const,
    },
    {
      title: "Export (ICS/CSV)",
      description: tx({ de: "Kalender für diese Woche exportieren", en: "Export the calendar for this week", es: "Exportar el calendario de esta semana" }),
      icon: FileDown,
      onClick: onExport,
      variant: "outline" as const,
    },
    {
      title: tx({ de: "Neue Kampagne", en: "New campaign", es: "Nueva campaña" }),
      description: tx({ de: "Mehrteilige Kampagne mit Plan erstellen", en: "Create a multi-part campaign with a plan", es: "Crear una campaña de varias partes con un plan" }),
      icon: Plus,
      onClick: onNewCampaign,
      variant: "outline" as const,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tx({ de: "Quick-Actions", en: "Quick actions", es: "Acciones rápidas" })}</CardTitle>
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
