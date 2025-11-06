import { Card } from "@/components/ui/card";
import { KpiBar } from "@/components/ui/KpiBar";
import { CheckCircle2, XCircle, Timer } from "lucide-react";

interface OnboardingData {
  started: number;
  completed: number;
  completionRate: number;
  avgDuration: number;
  dropoffByStep: Array<{ step: number; name: string; dropoff: number }>;
}

interface OnboardingMetricsProps {
  data?: OnboardingData;
}

export function OnboardingMetrics({ data }: OnboardingMetricsProps) {
  if (!data) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground text-center">No data available</p>
      </Card>
    );
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${Math.round(seconds % 60)}s`;
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <div>
              <div className="text-sm text-muted-foreground">Completion Rate</div>
              <div className="text-2xl font-bold">{data.completionRate.toFixed(1)}%</div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <Timer className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm text-muted-foreground">Avg Duration</div>
              <div className="text-2xl font-bold">{formatDuration(data.avgDuration)}</div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive" />
            <div>
              <div className="text-sm text-muted-foreground">Drop-offs</div>
              <div className="text-2xl font-bold">{data.started - data.completed}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Completion Funnel */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-6">Onboarding Funnel</h3>
        <KpiBar
          label={`Users Started Onboarding → Completed`}
          value={data.completed}
          max={data.started}
          color={data.completionRate > 70 ? 'success' : 'warning'}
          className="mb-4"
        />
        <div className="text-sm text-muted-foreground">
          {data.completed} of {data.started} users completed onboarding
        </div>
      </Card>

      {/* Step-by-Step Drop-off Analysis */}
      {data.dropoffByStep && data.dropoffByStep.length > 0 && (
        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-6">Drop-off by Step</h3>
          <div className="space-y-4">
            {data.dropoffByStep.map((step) => (
              <div key={step.step}>
                <KpiBar
                  label={`Step ${step.step}: ${step.name}`}
                  value={100 - step.dropoff}
                  max={100}
                  color={step.dropoff > 30 ? 'error' : step.dropoff > 15 ? 'warning' : 'success'}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  {step.dropoff.toFixed(1)}% of users drop off at this step
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
