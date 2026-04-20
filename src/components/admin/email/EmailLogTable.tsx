import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

type Row = {
  id: string;
  to_email: string;
  from_email: string;
  subject: string;
  template: string | null;
  category: string;
  status: 'sent' | 'failed' | 'suppressed';
  resend_id: string | null;
  error: string | null;
  created_at: string;
};

interface Props {
  range: '24h' | '7d' | '30d';
}

const PAGE_SIZE = 50;

export function EmailLogTable({ range }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [templates, setTemplates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => { setPage(0); }, [range, templateFilter, statusFilter, search]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const since = new Date();
      if (range === '24h') since.setHours(since.getHours() - 24);
      else if (range === '7d') since.setDate(since.getDate() - 7);
      else since.setDate(since.getDate() - 30);

      let q = supabase
        .from('email_send_log')
        .select('*', { count: 'exact' })
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (templateFilter !== 'all') q = q.eq('template', templateFilter);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (search.trim()) q = q.ilike('to_email', `%${search.trim()}%`);

      const { data, count, error } = await q;
      if (cancelled) return;
      if (error) {
        console.error(error);
        setRows([]); setTotal(0);
      } else {
        setRows((data ?? []) as Row[]);
        setTotal(count ?? 0);
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [range, page, templateFilter, statusFilter, search]);

  // Distinct templates (lightweight, separate query, last 30d only)
  useEffect(() => {
    const loadTemplates = async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from('email_send_log')
        .select('template')
        .gte('created_at', since.toISOString())
        .not('template', 'is', null)
        .limit(1000);
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => { if (r.template) set.add(r.template); });
      setTemplates(Array.from(set).sort());
    };
    loadTemplates();
  }, [range]);

  const statusBadge = (s: Row['status']) => {
    if (s === 'sent') return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">Sent</Badge>;
    if (s === 'suppressed') return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/20">Suppressed</Badge>;
    return <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/20">Failed</Badge>;
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card className="p-5 bg-card/60 backdrop-blur">
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <Input
          placeholder="Empfänger suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="md:max-w-xs"
        />
        <Select value={templateFilter} onValueChange={setTemplateFilter}>
          <SelectTrigger className="md:w-56"><SelectValue placeholder="Template" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Templates</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="md:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="suppressed">Suppressed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <AlertCircle className="h-6 w-6 mb-2" />
          Keine Einträge im gewählten Zeitraum.
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Zeitpunkt</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Empfänger</TableHead>
                  <TableHead>Betreff</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead>Fehler / Resend-ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(r.created_at), 'dd.MM. HH:mm:ss', { locale: de })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.template ?? '–'}</TableCell>
                    <TableCell className="text-xs">{r.to_email}</TableCell>
                    <TableCell className="text-xs max-w-[260px] truncate" title={r.subject}>{r.subject}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate" title={r.error ?? r.resend_id ?? ''}>
                      {r.error ?? r.resend_id ?? '–'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
            <span>{total.toLocaleString('de-DE')} Einträge · Seite {page + 1} / {totalPages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Zurück</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Weiter</Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
