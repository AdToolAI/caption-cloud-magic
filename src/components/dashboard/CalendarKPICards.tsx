import { tx } from "@/lib/i18nText";
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
      title: tx({ de: "Geplante Posts (Woche)", en: "Scheduled posts (week)", es: "Publicaciones programadas (semana)" }),
      value: `${data.scheduled} / ${data.target}`,
      icon: Calendar,
      tooltip: tx({ de: "Diese Woche geplante vs. Ziel-Posts aller aktiven Kampagnen.", en: "This week's scheduled vs. target posts across all active campaigns.", es: "Publicaciones programadas esta semana frente al objetivo de todas las campañas activas." }),
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: tx({ de: "Veröffentlicht", en: "Published", es: "Publicado" }),
      value: data.published,
      icon: CheckCircle,
      tooltip: tx({ de: "Bereits veröffentlichte Posts diese Woche.", en: "Posts already published this week.", es: "Publicaciones ya publicadas esta semana." }),
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: tx({ de: "Konflikte / Überfällig", en: "Conflicts / Overdue", es: "Conflictos / Atrasadas" }),
      value: `${data.conflicts} / ${data.overdue}`,
      icon: AlertTriangle,
      tooltip: tx({ de: "Konflikte = Posts zur gleichen Zeit. Überfällig = verpasste Posting-Zeiten.", en: "Conflicts = posts at the same time. Overdue = missed posting times.", es: "Conflictos = publicaciones al mismo tiempo. Atrasadas = horarios de publicación perdidos." }),
      color: data.conflicts > 0 || data.overdue > 0 ? "text-destructive" : "text-muted-foreground",
      bgColor: data.conflicts > 0 || data.overdue > 0 ? "bg-destructive/10" : "bg-muted/10",
    },
    {
      title: tx({ de: "Beste Slots gefunden", en: "Best slots found", es: "Mejores horarios encontrados" }),
      value: `${Math.round(data.goodSlotsShare * 100)}%`,
      icon: TrendingUp,
      tooltip: tx({ de: "Anteil der geplanten Events mit Score ≥ 70 (optimale Posting-Zeiten).", en: "Share of scheduled events with a score ≥ 70 (optimal posting times).", es: "Proporción de eventos programados con una puntuación ≥ 70 (horarios óptimos de publicación)." }),
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
