import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Users, TrendingUp, Calendar } from "lucide-react";

interface RetentionMetrics {
  day1Retention: number;
  day1Trend: { value: number; isPositive: boolean };
  day7Retention: number;
  day7Trend: { value: number; isPositive: boolean };
  day30Retention: number;
  day30Trend: { value: number; isPositive: boolean };
  cohorts: Array<{
    cohortDate: string;
    signups: number;
    day1: number;
    day7: number;
    day30: number;
  }>;
}

interface Props {
  data?: RetentionMetrics;
}

export function RetentionDashboard({ data }: Props) {
  if (!data) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">Keine Retention-Daten verfügbar</p>
      </Card>
    );
  }

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  const TrendIndicator = ({ trend }: { trend: { value: number; isPositive: boolean } }) => (
    <div className={`flex items-center gap-1 text-sm ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
      {trend.isPositive ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      {formatPercent(trend.value)}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Key Retention Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Day 1 Retention</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(data.day1Retention)}</div>
            <TrendIndicator trend={data.day1Trend} />
            <p className="text-xs text-muted-foreground mt-2">
              User, die nach 1 Tag zurückkehren
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Day 7 Retention</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(data.day7Retention)}</div>
            <TrendIndicator trend={data.day7Trend} />
            <p className="text-xs text-muted-foreground mt-2">
              User, die nach 7 Tagen zurückkehren
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Day 30 Retention</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(data.day30Retention)}</div>
            <TrendIndicator trend={data.day30Trend} />
            <p className="text-xs text-muted-foreground mt-2">
              User, die nach 30 Tagen zurückkehren
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Retention Cohort Table */}
      <Card>
        <CardHeader>
          <CardTitle>Cohort Analysis</CardTitle>
          <CardDescription>
            Retention nach Signup-Woche
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4 font-medium">Signup-Woche</th>
                  <th className="text-right py-2 px-4 font-medium">Signups</th>
                  <th className="text-right py-2 px-4 font-medium">Day 1</th>
                  <th className="text-right py-2 px-4 font-medium">Day 7</th>
                  <th className="text-right py-2 px-4 font-medium">Day 30</th>
                </tr>
              </thead>
              <tbody>
                {data.cohorts.map((cohort, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-4">{cohort.cohortDate}</td>
                    <td className="text-right py-2 px-4 font-medium">{cohort.signups}</td>
                    <td className="text-right py-2 px-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs ${
                        cohort.day1 >= 50 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {formatPercent(cohort.day1)}
                      </span>
                    </td>
                    <td className="text-right py-2 px-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs ${
                        cohort.day7 >= 30 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {formatPercent(cohort.day7)}
                      </span>
                    </td>
                    <td className="text-right py-2 px-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs ${
                        cohort.day30 >= 20 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {formatPercent(cohort.day30)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">Interpretation</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• <strong>Day 1 Retention &gt; 50%:</strong> Sehr gut - User finden sofort Wert</li>
              <li>• <strong>Day 7 Retention &gt; 30%:</strong> Gut - User bilden Habit</li>
              <li>• <strong>Day 30 Retention &gt; 20%:</strong> Exzellent - Langfristige Nutzer</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Retention Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Key Insights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm mb-1">Retention Benchmark</h4>
              <p className="text-sm text-muted-foreground">
                Durchschnittliche SaaS-Retention: Day 1: 40%, Day 7: 25%, Day 30: 15%
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
            <Calendar className="h-5 w-5 text-purple-600 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm mb-1">Beste Cohort</h4>
              <p className="text-sm text-muted-foreground">
                {data.cohorts.length > 0 && (
                  <>
                    {data.cohorts.reduce((best, current) => 
                      current.day30 > best.day30 ? current : best
                    ).cohortDate} mit {formatPercent(
                      data.cohorts.reduce((best, current) => 
                        current.day30 > best.day30 ? current : best
                      ).day30
                    )} Day 30 Retention
                  </>
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
