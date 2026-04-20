import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Flame } from 'lucide-react';

interface EndpointRow {
  endpoint: string;
  provider: string;
  calls: number;
  avg_response_ms: number;
  est_cost_usd: number;
}

export function TopExpensiveFunctionsCard({ endpoints }: { endpoints: EndpointRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          Top 5 teuerste Endpoints
        </CardTitle>
      </CardHeader>
      <CardContent>
        {endpoints.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Keine Daten im Zeitraum.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Avg ms</TableHead>
                <TableHead className="text-right">Est. Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpoints.map((e, i) => (
                <TableRow key={`${e.endpoint}-${i}`}>
                  <TableCell className="font-mono text-xs max-w-[280px] truncate">{e.endpoint}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.provider}</TableCell>
                  <TableCell className="text-right">{e.calls.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{e.avg_response_ms}</TableCell>
                  <TableCell className="text-right font-mono">${e.est_cost_usd.toFixed(4)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
