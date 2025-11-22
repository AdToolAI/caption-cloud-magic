import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PostHogMetrics } from '@/hooks/usePostHogMetrics';
import { format } from 'date-fns';

interface Props {
  metrics: PostHogMetrics | null;
  dateRange: { from: Date; to: Date };
  compareEnabled: boolean;
}

export function AnalyticsExportButton({ metrics, dateRange, compareEnabled }: Props) {
  const { toast } = useToast();

  const exportToCSV = (fullReport: boolean) => {
    if (!metrics) {
      toast({
        title: 'No data available',
        description: 'Please wait for metrics to load',
        variant: 'destructive'
      });
      return;
    }

    try {
      let csv = `Analytics Report - ${format(dateRange.from, 'yyyy-MM-dd')} to ${format(dateRange.to, 'yyyy-MM-dd')}\n`;
      csv += `Exported: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}\n`;
      csv += `Compare Mode: ${compareEnabled ? 'Enabled' : 'Disabled'}\n\n`;

      // Key Metrics Overview
      csv += 'KEY METRICS\n';
      csv += 'Metric,Current Value,Previous Value,Trend\n';
      
      const addMetric = (label: string, current: number | string, previous?: number, trend?: { value: number; isPositive: boolean }) => {
        const trendStr = trend ? `${trend.isPositive ? '+' : ''}${trend.value.toFixed(1)}%` : 'N/A';
        const prevStr = previous !== undefined ? previous.toString() : 'N/A';
        csv += `"${label}","${current}","${prevStr}","${trendStr}"\n`;
      };

      addMetric('Signup → First Post Rate', `${metrics.signupToPostRate}%`, undefined, metrics.signupToPostTrend);
      addMetric('Onboarding Completion Rate', `${metrics.onboardingCompletionRate}%`, undefined, metrics.onboardingTrend);
      addMetric('Upgrade Conversion Rate', `${metrics.upgradeConversionRate}%`, undefined, metrics.upgradeTrend);
      addMetric('Active Users (30d)', metrics.activeUsers);

      if (fullReport) {
        // Signup Funnel
        if (metrics.signupFunnel) {
          csv += '\n\nSIGNUP CONVERSION FUNNEL\n';
          csv += 'Stage,Count,Rate\n';
          csv += `Signups,${metrics.signupFunnel.signups},100%\n`;
          csv += `First Post Created,${metrics.signupFunnel.firstPostCreated},${metrics.signupFunnel.conversionRate.toFixed(1)}%\n`;
          csv += `Avg Time to First Post,${(metrics.signupFunnel.avgTimeToFirstPost / 60).toFixed(1)} hours,\n`;
        }

        // Onboarding Metrics
        if (metrics.onboardingMetrics) {
          csv += '\n\nONBOARDING METRICS\n';
          csv += 'Metric,Value\n';
          csv += `Started,${metrics.onboardingMetrics.started}\n`;
          csv += `Completed,${metrics.onboardingMetrics.completed}\n`;
          csv += `Completion Rate,${metrics.onboardingMetrics.completionRate.toFixed(1)}%\n`;
          csv += `Avg Duration,${(metrics.onboardingMetrics.avgDuration / 60).toFixed(1)} minutes\n`;
          
          if (metrics.onboardingMetrics.dropoffByStep) {
            csv += '\n\nONBOARDING DROPOFF BY STEP\n';
            csv += 'Step,Name,Dropoff\n';
            metrics.onboardingMetrics.dropoffByStep.forEach(step => {
              csv += `${step.step},"${step.name}",${step.dropoff}\n`;
            });
          }
        }

        // Upgrade Funnel
        if (metrics.upgradeFunnel) {
          csv += '\n\nUPGRADE FUNNEL\n';
          csv += 'Stage,Count\n';
          csv += `Free Users,${metrics.upgradeFunnel.freeUsers}\n`;
          csv += `Limit Reached,${metrics.upgradeFunnel.limitReached}\n`;
          csv += `Upgrade Clicked,${metrics.upgradeFunnel.upgradeClicked}\n`;
          csv += `Payment Completed,${metrics.upgradeFunnel.paymentCompleted}\n`;
          
          csv += '\n\nUPGRADE CONVERSION RATES\n';
          csv += 'Stage,Rate\n';
          csv += `Limit → Click,${metrics.upgradeFunnel.conversionRates.limitToClick.toFixed(1)}%\n`;
          csv += `Click → Payment,${metrics.upgradeFunnel.conversionRates.clickToPayment.toFixed(1)}%\n`;
          csv += `Overall Conversion,${metrics.upgradeFunnel.conversionRates.overallConversion.toFixed(1)}%\n`;

          if (metrics.upgradeFunnel.topTriggers) {
            csv += '\n\nTOP UPGRADE TRIGGERS\n';
            csv += 'Feature,Count\n';
            metrics.upgradeFunnel.topTriggers.forEach(trigger => {
              csv += `"${trigger.feature}",${trigger.count}\n`;
            });
          }
        }

        // Retention Metrics
        if (metrics.retentionMetrics) {
          csv += '\n\nRETENTION METRICS\n';
          csv += 'Period,Rate,Trend\n';
          csv += `Day 1,${metrics.retentionMetrics.day1Retention.toFixed(1)}%,${metrics.retentionMetrics.day1Trend.isPositive ? '+' : ''}${metrics.retentionMetrics.day1Trend.value.toFixed(1)}%\n`;
          csv += `Day 7,${metrics.retentionMetrics.day7Retention.toFixed(1)}%,${metrics.retentionMetrics.day7Trend.isPositive ? '+' : ''}${metrics.retentionMetrics.day7Trend.value.toFixed(1)}%\n`;
          csv += `Day 30,${metrics.retentionMetrics.day30Retention.toFixed(1)}%,${metrics.retentionMetrics.day30Trend.isPositive ? '+' : ''}${metrics.retentionMetrics.day30Trend.value.toFixed(1)}%\n`;

          if (metrics.retentionMetrics.cohorts && metrics.retentionMetrics.cohorts.length > 0) {
            csv += '\n\nCOHORT ANALYSIS\n';
            csv += 'Cohort Date,Signups,Day 1 Retention,Day 7 Retention,Day 30 Retention\n';
            metrics.retentionMetrics.cohorts.forEach(cohort => {
              csv += `${cohort.cohortDate},${cohort.signups},${cohort.day1}%,${cohort.day7}%,${cohort.day30}%\n`;
            });
          }
        }

        // Recent Events
        if (metrics.recentEvents && metrics.recentEvents.length > 0) {
          csv += '\n\nRECENT EVENTS (Last 50)\n';
          csv += 'Timestamp,Event,User ID,Properties\n';
          metrics.recentEvents.forEach(event => {
            const props = JSON.stringify(event.properties).replace(/"/g, '""');
            csv += `${event.timestamp},"${event.event}","${event.distinctId}","${props}"\n`;
          });
        }
      }

      // Download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      const filename = `analytics_${fullReport ? 'full-report' : 'overview'}_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.csv`;
      
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Export successful',
        description: `${fullReport ? 'Full report' : 'Overview'} downloaded as CSV`
      });
    } catch (error) {
      console.error('CSV Export Error:', error);
      toast({
        title: 'Export failed',
        description: 'Could not create CSV file',
        variant: 'destructive'
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportToCSV(false)}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export Overview (CSV)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportToCSV(true)}>
          <FileText className="h-4 w-4 mr-2" />
          Export Full Report (CSV)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
