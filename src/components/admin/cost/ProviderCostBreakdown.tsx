import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface ProviderRow {
  provider: string;
  calls: number;
  failures: number;
  avg_response_ms: number;
  est_cost_usd: number;
}

export function ProviderCostBreakdown({ providers }: { providers: ProviderRow[] }) {
  const maxCost = Math.max(...providers.map((p) => p.est_cost_usd), 0.0001);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>API-Calls per Provider</span>
          <Badge variant="outline" className="text-xs">Estimated · based on call volume</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {providers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Noch keine Provider-Calls geloggt im Zeitraum.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Failures</TableHead>
                <TableHead className="text-right">Avg ms</TableHead>
                <TableHead className="w-[200px]">Est. Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((p) => (
                <TableRow key={p.provider}>
                  <TableCell className="font-medium">{p.provider}</TableCell>
                  <TableCell className="text-right">{p.calls.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    {p.failures > 0 ? (
                      <span className="text-destructive">{p.failures}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{p.avg_response_ms}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={(p.est_cost_usd / maxCost) * 100} className="h-1.5 flex-1" />
                      <span className="text-xs font-mono w-16 text-right">${p.est_cost_usd.toFixed(4)}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
