import { motion } from "framer-motion";
import { TrendingUp, Calendar, CheckCircle, Users, Clock, BarChart3 } from "lucide-react";
import CountUp from "@/components/ui/count-up";

interface CalendarMetric {
  label: string;
  value: string | number;
  numericValue?: number;
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
  const calculateWeeklyAverage = (events: any[], range: {start: Date; end: Date}): number => {
    const days = Math.ceil((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24));
    const weeks = days / 7;
    return weeks > 0 ? parseFloat((events.length / weeks).toFixed(1)) : 0;
  };
  
  const eventsPerWeek = dateRange 
    ? calculateWeeklyAverage(events, dateRange)
    : 0;
  
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
      numericValue: totalEvents,
      icon: <Calendar className="w-5 h-5" />,
      trend: "neutral"
    },
    {
      label: "Published",
      value: publishedEvents,
      numericValue: publishedEvents,
      change: `${publishRate}% rate`,
      icon: <CheckCircle className="w-5 h-5" />,
      trend: publishRate > 70 ? "up" : "neutral"
    },
    {
      label: "Scheduled",
      value: scheduledEvents,
      numericValue: scheduledEvents,
      icon: <Clock className="w-5 h-5" />,
      trend: "neutral"
    },
    {
      label: "Events/Week",
      value: eventsPerWeek || '-',
      numericValue: eventsPerWeek,
      icon: <TrendingUp className="w-5 h-5" />,
      trend: "up"
    },
    {
      label: "Team Utilization",
      value: `${teamUtilization}%`,
      numericValue: teamUtilization,
      icon: <Users className="w-5 h-5" />,
      trend: teamUtilization > 60 ? "up" : "down"
    },
    {
      label: "Avg. ETA",
      value: avgETA > 0 ? `${avgETA}min` : '-',
      numericValue: avgETA,
      icon: <BarChart3 className="w-5 h-5" />,
      trend: "neutral"
    }
  ];

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up': return 'text-emerald-400';
      case 'down': return 'text-red-400';
      default: return 'text-muted-foreground';
    }
  };

  const getTrendGlow = (trend: string) => {
    switch (trend) {
      case 'up': return 'shadow-[0_0_10px_hsla(142,70%,50%,0.2)]';
      case 'down': return 'shadow-[0_0_10px_hsla(0,70%,50%,0.2)]';
      default: return '';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      {metrics.map((metric, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1, duration: 0.4 }}
          whileHover={{ scale: 1.02, y: -2 }}
          className="group"
        >
          <div className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-5 shadow-[0_0_20px_rgba(255,255,255,0.03)] hover:shadow-[0_0_30px_hsla(43,90%,68%,0.1)] transition-all duration-300">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">
                {metric.label}
              </span>
              <div className={`p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary transition-all duration-300 group-hover:shadow-[0_0_15px_hsla(43,90%,68%,0.3)]`}>
                {metric.icon}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-3xl font-bold text-foreground">
                {typeof metric.numericValue === 'number' && metric.numericValue > 0 ? (
                  <CountUp end={metric.numericValue} duration={1.5} />
                ) : (
                  metric.value
                )}
                {metric.label === 'Team Utilization' && typeof metric.numericValue === 'number' && '%'}
                {metric.label === 'Avg. ETA' && typeof metric.numericValue === 'number' && metric.numericValue > 0 && 'min'}
              </p>
              {metric.change && (
                <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-muted/50 ${getTrendColor(metric.trend || 'neutral')} ${getTrendGlow(metric.trend || 'neutral')}`}>
                  {metric.change}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}