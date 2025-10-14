import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Calendar, CheckCircle, Users, Clock, BarChart3 } from "lucide-react";

interface CalendarMetric {
  label: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
  icon: React.ReactNode;
}

interface CalendarMetricsDashboardProps {
  events: any[];
  workspaceMembers?: any[];
  dateRange?: { start: Date; end: Date };
}

export function CalendarMetricsDashboard({ 
  events = [], 
  workspaceMembers = [],
  dateRange 
}: CalendarMetricsDashboardProps) {
  
  // Calculate metrics
  const totalEvents = events.length;
  const publishedEvents = events.filter(e => e.status === 'published').length;
  const scheduledEvents = events.filter(e => e.status === 'scheduled').length;
  const draftEvents = events.filter(e => e.status === 'briefing' || e.status === 'in_progress').length;
  
  // Calculate publish rate
  const publishRate = totalEvents > 0 
    ? Math.round((publishedEvents / totalEvents) * 100) 
    : 0;
  
  // Events per week - calculated from actual date range
  const calculateWeeklyAverage = (events: any[], range: {start: Date; end: Date}): string => {
    const days = Math.ceil((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24));
    const weeks = days / 7;
    return weeks > 0 ? (events.length / weeks).toFixed(1) : '0.0';
  };
  
  const eventsPerWeek = dateRange 
    ? calculateWeeklyAverage(events, dateRange)
    : '-';
  
  // Team utilization
  const assignedEvents = events.filter(e => e.assignees && e.assignees.length > 0).length;
  const teamUtilization = totalEvents > 0
    ? Math.round((assignedEvents / totalEvents) * 100)
    : 0;
  
  // Average ETA
  const eventsWithETA = events.filter(e => e.eta_minutes);
  const avgETA = eventsWithETA.length > 0
    ? Math.round(eventsWithETA.reduce((sum, e) => sum + (e.eta_minutes || 0), 0) / eventsWithETA.length)
    : 0;

  const metrics: CalendarMetric[] = [
    {
      label: "Total Events",
      value: totalEvents,
      icon: <Calendar className="w-4 h-4" />,
      trend: "neutral"
    },
    {
      label: "Published",
      value: publishedEvents,
      change: `${publishRate}% rate`,
      icon: <CheckCircle className="w-4 h-4" />,
      trend: publishRate > 70 ? "up" : "neutral"
    },
    {
      label: "Scheduled",
      value: scheduledEvents,
      icon: <Clock className="w-4 h-4" />,
      trend: "neutral"
    },
    {
      label: "Events/Week",
      value: eventsPerWeek,
      icon: <TrendingUp className="w-4 h-4" />,
      trend: "up"
    },
    {
      label: "Team Utilization",
      value: `${teamUtilization}%`,
      icon: <Users className="w-4 h-4" />,
      trend: teamUtilization > 60 ? "up" : "down"
    },
    {
      label: "Avg. ETA",
      value: avgETA > 0 ? `${avgETA}min` : '-',
      icon: <BarChart3 className="w-4 h-4" />,
      trend: "neutral"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      {metrics.map((metric, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {metric.label}
            </CardTitle>
            <div className="text-muted-foreground">
              {metric.icon}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metric.value}</div>
            {metric.change && (
              <p className={`text-xs ${
                metric.trend === 'up' ? 'text-green-600' :
                metric.trend === 'down' ? 'text-red-600' :
                'text-muted-foreground'
              }`}>
                {metric.change}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}