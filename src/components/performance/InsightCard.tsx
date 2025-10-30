import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";

interface InsightCardProps {
  title: string;
  delta: string;
  evidence: string;
  icon: LucideIcon;
  actions: Array<{
    label: string;
    href: string;
    variant?: 'default' | 'outline';
  }>;
  priority: 'high' | 'medium' | 'low';
}

export function InsightCard({ 
  title, 
  delta, 
  evidence, 
  icon: Icon, 
  actions, 
  priority 
}: InsightCardProps) {
  const priorityConfig = {
    high: {
      badge: 'Wichtig',
      className: 'border-destructive/50 bg-destructive/5'
    },
    medium: {
      badge: 'Mittel',
      className: 'border-orange-500/50 bg-orange-500/5'
    },
    low: {
      badge: 'Optional',
      className: 'border-muted-foreground/30 bg-muted/30'
    }
  };

  const config = priorityConfig[priority];

  return (
    <Card className={`rounded-2xl shadow-soft hover:shadow-glow transition-all duration-300 ${config.className}`}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 grid place-items-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{evidence}</p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {config.badge}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-primary mb-4">{delta}</div>
        <div className="flex flex-wrap gap-2">
          {actions.map((action, i) => (
            <Button
              key={i}
              asChild
              variant={action.variant || 'default'}
              size="sm"
              className="shadow-soft hover:shadow-glow"
            >
              <Link to={action.href}>{action.label}</Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
