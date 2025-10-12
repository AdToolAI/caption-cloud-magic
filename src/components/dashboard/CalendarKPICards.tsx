import { Card, CardContent } from "@/components/ui/card";
import { Calendar, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface KPIData {
  scheduled: number;
  target: number;
  published: number;
  overdue: number;
  conflicts: number;
  goodSlotsShare: number;
}

interface CalendarKPICardsProps {
  data: KPIData;
  loading?: boolean;
}

export function CalendarKPICards({ data, loading }: CalendarKPICardsProps) {
  const fulfillmentRate = data.target > 0 ? (data.scheduled / data.target) * 100 : 0;

  const cards = [
    {
      title: "Geplante Posts (Woche)",
      value: `${data.scheduled} / ${data.target}`,
      icon: Calendar,
      tooltip: "Diese Woche geplante vs. Ziel-Posts aller aktiven Kampagnen.",
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Veröffentlicht",
      value: data.published,
      icon: CheckCircle,
      tooltip: "Bereits veröffentlichte Posts diese Woche.",
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: "Konflikte / Überfällig",
      value: `${data.conflicts} / ${data.overdue}`,
      icon: AlertTriangle,
      tooltip: "Konflikte = Posts zur gleichen Zeit. Überfällig = verpasste Posting-Zeiten.",
      color: data.conflicts > 0 || data.overdue > 0 ? "text-destructive" : "text-muted-foreground",
      bgColor: data.conflicts > 0 || data.overdue > 0 ? "bg-destructive/10" : "bg-muted/10",
    },
    {
      title: "Beste Slots gefunden",
      value: `${Math.round(data.goodSlotsShare * 100)}%`,
      icon: TrendingUp,
      tooltip: "Anteil der geplanten Events mit Score ≥ 70 (optimale Posting-Zeiten).",
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
              <div className="h-8 bg-muted rounded w-3/4"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <TooltipProvider key={idx}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Card className="hover:shadow-md transition-shadow cursor-help">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`p-2 rounded-lg ${card.bgColor}`}>
                        <Icon className={`h-5 w-5 ${card.color}`} />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">{card.title}</p>
                    <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">{card.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}
