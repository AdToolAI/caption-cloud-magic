import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Calendar, TrendingUp, Clock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface SmartSchedulerProps {
  onScheduleSuggestion: (time: Date) => void;
}

export function SmartScheduler({ onScheduleSuggestion }: SmartSchedulerProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const suggestions = [
    { time: "2:00 PM", day: "Monday", score: 95, reason: "Peak engagement time" },
    { time: "6:00 PM", day: "Wednesday", score: 88, reason: "High activity period" },
    { time: "12:00 PM", day: "Friday", score: 82, reason: "Lunch break engagement" },
  ];

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Smart Scheduling</h3>
      </div>

      <div className="space-y-3">
        {suggestions.map((suggestion, idx) => (
          <div key={idx} className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{suggestion.day}, {suggestion.time}</p>
                <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {suggestion.score}%
              </Badge>
              <Button size="sm" onClick={() => onScheduleSuggestion(new Date())}>
                Use
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button className="w-full mt-4" variant="outline" disabled={loading}>
        <Sparkles className="h-4 w-4 mr-2" />
        Get More Suggestions
      </Button>
    </Card>
  );
}
