import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Calendar, CheckCircle, Users, Clock, BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [expanded, setExpanded] = useState(false);
  
  // Calculate metrics
  const totalEvents = events.length;
  const publishedEvents = events.filter(e => e.status === 'published').length;
  const scheduledEvents = events.filter(e => e.status === 'scheduled').length;
  const draftEvents = events.filter(e => e.status === 'briefing' || e.status === 'in_progress').length;
  
  // Calculate publish rate
  const publishRate = totalEvents > 0 
    ? Math.round((publishedEvents / totalEvents) * 100) 
    : 0;
  
  // Events per week
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
      label: "Total",
      value: totalEvents,
      numericValue: totalEvents,
      icon: <Calendar className="w-4 h-4" />,
      trend: "neutral"
    },
    {
      label: "Published",
      value: publishedEvents,
      numericValue: publishedEvents,
      change: `${publishRate}%`,
      icon: <CheckCircle className="w-4 h-4" />,
      trend: publishRate > 70 ? "up" : "neutral"
    },
    {
      label: "Scheduled",
      value: scheduledEvents,
      numericValue: scheduledEvents,
      icon: <Clock className="w-4 h-4" />,
      trend: "neutral"
    },
    {
      label: "Events/Woche",
      value: eventsPerWeek || '-',
      numericValue: eventsPerWeek,
      icon: <TrendingUp className="w-4 h-4" />,
      trend: "up"
    },
    {
      label: "Team",
      value: `${teamUtilization}%`,
      numericValue: teamUtilization,
      icon: <Users className="w-4 h-4" />,
      trend: teamUtilization > 60 ? "up" : "down"
    },
    {
      label: "Ø ETA",
      value: avgETA > 0 ? `${avgETA}min` : '-',
      numericValue: avgETA,
      icon: <BarChart3 className="w-4 h-4" />,
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

  // Compact inline view (first 3 metrics)
  const compactMetrics = metrics.slice(0, 3);
  const expandedMetrics = metrics.slice(3);

  return (
    <div className="backdrop-blur-xl bg-card/40 border border-white/10 rounded-xl px-4 py-2.5">
      <div className="flex items-center justify-between">
        {/* Compact Metrics Row */}
        <div className="flex items-center gap-6">
          {compactMetrics.map((metric, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                {metric.icon}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{metric.label}:</span>
                <span className="text-sm font-semibold text-foreground">
                  {typeof metric.numericValue === 'number' && metric.numericValue > 0 ? (
                    <CountUp end={metric.numericValue} duration={1} />
                  ) : (
                    metric.value
                  )}
                </span>
                {metric.change && (
                  <span className={`text-xs ${getTrendColor(metric.trend || 'neutral')}`}>
                    ({metric.change})
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Expand Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-primary/10"
        >
          {expanded ? (
            <>Weniger <ChevronUp className="w-3 h-3 ml-1" /></>
          ) : (
            <>Mehr <ChevronDown className="w-3 h-3 ml-1" /></>
          )}
        </Button>
      </div>

      {/* Expanded Metrics */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-6 pt-2.5 mt-2.5 border-t border-white/10">
              {expandedMetrics.map((metric, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    {metric.icon}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{metric.label}:</span>
                    <span className="text-sm font-semibold text-foreground">
                      {typeof metric.numericValue === 'number' && metric.numericValue > 0 ? (
                        <CountUp end={metric.numericValue} duration={1} />
                      ) : (
                        metric.value
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
