import { Card } from "@/components/ui/card";
import { KpiBar } from "@/components/ui/KpiBar";
import { ArrowRight, Clock } from "lucide-react";

interface SignupFunnelData {
  signups: number;
  firstPostCreated: number;
  conversionRate: number;
  avgTimeToFirstPost: number;
}

interface SignupConversionFunnelProps {
  data?: SignupFunnelData;
}

export function SignupConversionFunnel({ data }: SignupConversionFunnelProps) {
  if (!data) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground text-center">No data available</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-6">Signup to First Post Journey</h3>
        
        {/* Funnel Visualization */}
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium mb-2">Users Signed Up</div>
              <div className="text-3xl font-bold">{data.signups}</div>
              <div className="text-xs text-muted-foreground mt-1">Last 30 days</div>
            </div>
            <ArrowRight className="h-6 w-6 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-sm font-medium mb-2">Created First Post</div>
              <div className="text-3xl font-bold">{data.firstPostCreated}</div>
              <div className="text-xs text-success mt-1">
                {data.conversionRate.toFixed(1)}% conversion
              </div>
            </div>
          </div>

          <KpiBar
            label="Conversion Rate"
            value={data.conversionRate}
            max={100}
            color={data.conversionRate > 40 ? 'success' : 'warning'}
          />
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-start gap-4">
          <Clock className="h-5 w-5 text-primary mt-1" />
          <div>
            <h4 className="font-semibold mb-2">Average Time to First Post</h4>
            <div className="text-3xl font-bold mb-1">
              {data.avgTimeToFirstPost < 24 
                ? `${data.avgTimeToFirstPost.toFixed(1)}h`
                : `${(data.avgTimeToFirstPost / 24).toFixed(1)}d`
              }
            </div>
            <p className="text-sm text-muted-foreground">
              {data.avgTimeToFirstPost < 1 
                ? "🎉 Users are creating posts within an hour!"
                : data.avgTimeToFirstPost < 24
                ? "✅ Same-day activation rate is good"
                : "⚠️ Consider improving onboarding to speed up activation"
              }
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
