import { Card } from "@/components/ui/card";
import { KpiBar } from "@/components/ui/KpiBar";
import { ArrowRight, TrendingUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface UpgradeFunnelData {
  freeUsers: number;
  limitReached: number;
  upgradeClicked: number;
  paymentCompleted: number;
  conversionRates: {
    limitToClick: number;
    clickToPayment: number;
    overallConversion: number;
  };
  topTriggers: Array<{ feature: string; count: number }>;
}

interface UpgradeFunnelProps {
  data?: UpgradeFunnelData;
}

export function UpgradeFunnel({ data }: UpgradeFunnelProps) {
  if (!data) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground text-center">No data available</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Funnel Overview */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-6">Free to Paid Conversion Funnel</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-3xl font-bold">{data.freeUsers}</div>
            <div className="text-sm text-muted-foreground mt-1">Free Users</div>
          </div>
          <div className="flex items-center justify-center">
            <ArrowRight className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold">{data.limitReached}</div>
            <div className="text-sm text-muted-foreground mt-1">Hit Limit</div>
          </div>
          <div className="flex items-center justify-center">
            <ArrowRight className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold">{data.upgradeClicked}</div>
            <div className="text-sm text-muted-foreground mt-1">Clicked Upgrade</div>
            <div className="text-xs text-success mt-1">
              {data.conversionRates.limitToClick.toFixed(1)}%
            </div>
          </div>
          <div className="flex items-center justify-center">
            <ArrowRight className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-success">{data.paymentCompleted}</div>
            <div className="text-sm text-muted-foreground mt-1">Paid</div>
            <div className="text-xs text-success mt-1">
              {data.conversionRates.clickToPayment.toFixed(1)}%
            </div>
          </div>
        </div>

        <KpiBar
          label="Overall Conversion (Free → Paid)"
          value={data.conversionRates.overallConversion}
          max={100}
          color={data.conversionRates.overallConversion > 5 ? 'success' : 'warning'}
        />
      </Card>

      {/* Conversion Rate Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm text-muted-foreground">Limit → Click</div>
              <div className="text-2xl font-bold">{data.conversionRates.limitToClick.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground mt-1">
                {data.conversionRates.limitToClick > 15 ? '✅ Strong interest' : '⚠️ Low interest in upgrade'}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-success" />
            <div>
              <div className="text-sm text-muted-foreground">Click → Payment</div>
              <div className="text-2xl font-bold">{data.conversionRates.clickToPayment.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground mt-1">
                {data.conversionRates.clickToPayment > 70 ? '✅ Smooth checkout' : '⚠️ Checkout issues?'}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm text-muted-foreground">Overall Conversion</div>
              <div className="text-2xl font-bold text-success">{data.conversionRates.overallConversion.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground mt-1">Free → Paid</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Top Upgrade Triggers */}
      {data.topTriggers && data.topTriggers.length > 0 && (
        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-4">Top Upgrade Triggers</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Features that motivate users to upgrade
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead className="text-right">Upgrades Triggered</TableHead>
                <TableHead className="text-right">Percentage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.topTriggers.map((trigger, i) => {
                const total = data.topTriggers.reduce((sum, t) => sum + t.count, 0);
                const percentage = (trigger.count / total) * 100;
                
                return (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{trigger.feature}</TableCell>
                    <TableCell className="text-right">{trigger.count}</TableCell>
                    <TableCell className="text-right">{percentage.toFixed(1)}%</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
