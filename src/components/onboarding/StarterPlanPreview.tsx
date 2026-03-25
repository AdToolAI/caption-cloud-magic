import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { Sparkles, Loader2, Clock, Lightbulb } from "lucide-react";

interface PlanItem {
  id?: string;
  day_of_week: number;
  suggested_date: string;
  suggested_time: string;
  platform: string;
  content_idea: string;
  tips: string;
}

interface StarterPlanPreviewProps {
  plans: PlanItem[];
  loading: boolean;
  error?: string | null;
  onComplete: () => void;
  onRetry: () => void;
}

const dayNames = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function StarterPlanPreview({ plans, loading, error, onComplete, onRetry }: StarterPlanPreviewProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="relative">
          <Sparkles className="h-12 w-12 text-primary animate-pulse" />
          <Loader2 className="h-6 w-6 text-primary animate-spin absolute -bottom-1 -right-1" />
        </div>
        <h3 className="text-xl font-semibold">Dein Plan wird erstellt...</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Unsere KI analysiert deine Nische und erstellt einen personalisierten Wochenplan mit optimalen Posting-Zeiten.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <p className="text-destructive font-medium">{error}</p>
        <Button onClick={onRetry} variant="outline">Erneut versuchen</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold">Dein Starter-Plan ist fertig! 🎉</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {plans.length} Posts für deine erste Woche — optimiert für maximale Reichweite
        </p>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
        {plans
          .sort((a, b) => new Date(a.suggested_date).getTime() - new Date(b.suggested_date).getTime())
          .map((plan, idx) => (
            <Card key={plan.id || idx} className="hover:shadow-md transition-all">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center min-w-[48px] pt-1">
                    <span className="text-xs font-bold text-primary uppercase">
                      {dayNames[plan.day_of_week]}
                    </span>
                    <span className="text-lg font-bold">
                      {new Date(plan.suggested_date + "T00:00:00").getDate()}
                    </span>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <PlatformBadge platform={plan.platform as any} />
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {plan.suggested_time} Uhr
                      </span>
                    </div>
                    <p className="text-sm font-medium">{plan.content_idea}</p>
                    {plan.tips && (
                      <p className="text-xs text-muted-foreground flex items-start gap-1">
                        <Lightbulb className="h-3 w-3 mt-0.5 shrink-0 text-warning" />
                        {plan.tips}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      <Button onClick={onComplete} size="lg" className="w-full">
        <Sparkles className="h-4 w-4 mr-2" />
        Los geht's!
      </Button>
    </div>
  );
}
