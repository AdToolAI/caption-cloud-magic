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
          action: "Konflikt lösen",
          onAction: onResolveConflict,
        };
      case 'overdue':
        return {
          icon: AlertCircle,
          color: "text-warning",
          bgColor: "bg-warning/10",
          priority: "medium",
          action: "Jetzt veröffentlichen",
        };
      case 'empty':
        return {
          icon: Info,
          color: "text-primary",
          bgColor: "bg-primary/10",
          priority: "low",
          action: "Auto-Planung starten",
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
      high: { variant: "destructive", label: "Hoch" },
      medium: { variant: "default", label: "Mittel" },
      low: { variant: "secondary", label: "Niedrig" },
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
                          {alert.type === 'conflict' ? 'Konflikt erkannt' : 
                           alert.type === 'overdue' ? 'Überfällig' : 
                           'Leere Tage'}
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
