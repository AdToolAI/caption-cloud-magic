import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";

interface Alert {
  type: string;
  message: string;
  relatedIds: string[];
}

interface CalendarAlertsProps {
  alerts: Alert[];
  loading?: boolean;
  onResolveConflict?: () => void;
  onAutoSchedule?: () => void;
}

export function CalendarAlerts({ 
  alerts, 
  loading, 
  onResolveConflict,
  onAutoSchedule 
}: CalendarAlertsProps) {
  const getAlertConfig = (type: string) => {
    switch (type) {
      case 'conflict':
        return {
          icon: AlertTriangle,
          color: "text-destructive",
          bgColor: "bg-destructive/10",
          priority: "high",
          action: tx({ de: "Konflikt lösen", en: "Resolve conflict", es: "Resolver conflicto" }),
          onAction: onResolveConflict,
        };
      case 'overdue':
        return {
          icon: AlertCircle,
          color: "text-warning",
          bgColor: "bg-warning/10",
          priority: "medium",
          action: tx({ de: "Jetzt veröffentlichen", en: "Publish now", es: "Publicar ahora" }),
        };
      case 'empty':
        return {
          icon: Info,
          color: "text-primary",
          bgColor: "bg-primary/10",
          priority: "low",
          action: tx({ de: "Auto-Planung starten", en: "Start auto-scheduling", es: "Iniciar programación automática" }),
          onAction: onAutoSchedule,
        };
      default:
        return {
          icon: Info,
          color: "text-muted-foreground",
          bgColor: "bg-muted/10",
          priority: "low",
        };
    }
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive"; label: string }> = {
      high: { variant: "destructive", label: tx({ de: "Hoch", en: "High", es: "Alto" }) },
      medium: { variant: "default", label: tx({ de: "Mittel", en: "Medium", es: "Medio" }) },
      low: { variant: "secondary", label: tx({ de: "Niedrig", en: "Low", es: "Bajo" }) },
    };
    const config = variants[priority] || variants.low;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Warnungen & Aufgaben</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Warnungen & Aufgaben</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Info className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Alles im grünen Bereich! ✅</p>
            <p className="text-sm mt-1">Keine Warnungen oder offenen Aufgaben.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Warnungen & Aufgaben</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.map((alert, idx) => {
            const config = getAlertConfig(alert.type);
            const Icon = config.icon;
            
            return (
              <Card key={idx} className={`${config.bgColor} border-0`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg bg-background/50`}>
                      <Icon className={`h-5 w-5 ${config.color}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getPriorityBadge(config.priority)}
                        <span className={`text-sm font-medium ${config.color}`}>
                          {alert.type === 'conflict' ? 'Konflikt erkannt' : tx({ de: 'Konflikt erkannt', en: 'Conflict detected', es: 'Conflicto detectado' }) : 
                           alert.type === 'overdue' ? 'Überfällig' : tx({ de: 'Überfällig', en: 'Overdue', es: 'Vencido' }) : 
                           Leere Tage
                        </span>
                      </div>
                      <p className="text-sm text-foreground mb-3">{alert.message}</p>
                      {config.action && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={config.onAction}
                          className="hover:bg-background/80"
                        >
                          {config.action}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
