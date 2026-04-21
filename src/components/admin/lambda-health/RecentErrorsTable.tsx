import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';

interface ErrorRow {
  created_at: string;
  error_message: string;
  render_id: string | null;
  status: string;
}

const statusVariant = (s: string): 'destructive' | 'secondary' | 'outline' => {
  if (s === 'oom') return 'destructive';
  if (s === 'timeout') return 'secondary';
  return 'outline';
};

export const RecentErrorsTable = ({ errors }: { errors: ErrorRow[] }) => {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <h3 className="font-semibold">Recent Errors (last 10)</h3>
      </div>
      {errors.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          🎉 No errors recorded
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Time</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="w-[120px]">Render ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {errors.map((e, i) => (
              <TableRow key={i}>
                <TableCell className="text-xs">
                  {new Date(e.created_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(e.status)}>{e.status}</Badge>
                </TableCell>
                <TableCell className="text-sm font-mono max-w-md truncate">
                  {e.error_message}
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground truncate">
                  {e.render_id?.slice(0, 12) || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
};
