import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Calendar, CheckCircle, Clock } from "lucide-react";
import { FeatureFlag } from "@/components/FeatureFlag";
import { AdvancedCalendarAnalytics } from "./AdvancedCalendarAnalytics";

export function CalendarAnalytics() {
  const stats = [
    { label: "Total Posts", value: "42", change: "+12%", icon: Calendar },
    { label: "Published", value: "28", change: "+8%", icon: CheckCircle },
    { label: "Scheduled", value: "14", change: "+4", icon: Clock },
    { label: "Avg. Engagement", value: "2.4K", change: "+15%", icon: TrendingUp },
  ];

  return (
    <FeatureFlag
      flag="enable_advanced_analytics"
      fallback={
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {stats.map((stat, idx) => (
            <Card key={idx} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className="h-5 w-5 text-muted-foreground" />
                <Badge variant="secondary" className="text-xs">{stat.change}</Badge>
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </Card>
          ))}
        </div>
      }
    >
      <AdvancedCalendarAnalytics />
    </FeatureFlag>
  );
}
