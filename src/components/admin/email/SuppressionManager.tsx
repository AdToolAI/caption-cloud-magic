import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Trash2, Plus, Download, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';
import { isTestAddress } from '@/lib/email/testAddress';

type Reason = 'bounce' | 'complaint' | 'unsubscribe' | 'manual';
type Sup = {
  email: string;
  reason: Reason;
  suppressed_at: string;
  details: any;
};

const PAGE_SIZE = 25;

export function SuppressionManager() {
  const [rows, setRows] = useState<Sup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState<'all' | Reason>('all');
  const [page, setPage] = useState(0);

  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newReason, setNewReason] = useState<Reason>('manual');
  const [newNote, setNewNote] = useState('');
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('email_suppression_list')
      .select('*')
      .order('suppressed_at', { ascending: false })
      .limit(2000);
    if (search.trim()) q = q.ilike('email', `%${search.trim()}%`);
    if (reasonFilter !== 'all') q = q.eq('reason', reasonFilter);
    const { data, error } = await q;
    if (error) { console.error(error); setRows([]); }
    else setRows((data ?? []) as Sup[]);
    setLoading(false);
    setPage(0);
  }, [search, reasonFilter]);

  useEffect(() => { load(); }, [load]);

  const testCount = useMemo(() => rows.filter((r) => isTestAddress(r.email)).length, [rows]);
  const pageRows = useMemo(
    () => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [rows, page],
  );
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const reasonBadge = (r: Reason) => {
    const map: Record<Reason, string> = {
      bounce: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      complaint: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
      unsubscribe: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      manual: 'bg-muted/40 text-muted-foreground border-border',
    };
    return <Badge className={`${map[r]} hover:opacity-80`}>{r}</Badge>;
  };

  const callManage = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-suppression-manage', { body });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    } catch (e: any) {
      toast.error(e?.message ?? 'Aktion fehlgeschlagen');
      return null;
    } finally { setBusy(false); }
  };

  const handleAdd = async () => {
    if (!newEmail.trim()) return;
    const ok = await callManage({ action: 'add', email: newEmail, reason: newReason, note: newNote || undefined });
    if (ok) {
      toast.success(`${newEmail} wurde zur Suppression-Liste hinzugefügt`);
      setAdding(false); setNewEmail(''); setNewNote(''); setNewReason('manual');
      load();
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    const ok = await callManage({ action: 'remove', email: removeTarget });
    if (ok) {
      toast.success(`${removeTarget} wurde entfernt`);
      setRemoveTarget(null);
      load();
    }
  };

  const handleBulkRemoveTest = async () => {
    const result = await callManage({ action: 'bulk_remove_test' });
    if (result) {
      const removed = (result as any)?.removed ?? 0;
      toast.success(`${removed} Test-Adressen entfernt`);
      setBulkConfirm(false);
      load();
    }
  };

  const handleExportCsv = () => {
    const header = ['email', 'reason', 'suppressed_at', 'is_test', 'details'];
    const lines = [header.join(',')];
    for (const r of rows) {
      const details = r.details ? JSON.stringify(r.details).replace(/"/g, '""') : '';
      lines.push([
        r.email,
        r.reason,
        r.suppressed_at,
        isTestAddress(r.email) ? 'true' : 'false',
        `"${details}"`,
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suppression-list-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-5 bg-card/60 backdrop-blur">
      <div className="flex flex-col md:flex-row gap-3 mb-4 md:items-center md:justify-between">
        <div className="flex flex-1 gap-2 flex-col sm:flex-row">
          <Input
            placeholder="Email suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:max-w-xs"
          />
          <Select value={reasonFilter} onValueChange={(v) => setReasonFilter(v as 'all' | Reason)}>
            <SelectTrigger className="md:max-w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Gründe</SelectItem>
              <SelectItem value="bounce">Bounce</SelectItem>
              <SelectItem value="complaint">Complaint</SelectItem>
              <SelectItem value="unsubscribe">Unsubscribe</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 flex-wrap">
          {testCount > 0 && (
            <Button
              variant="outline"
              onClick={() => setBulkConfirm(true)}
              className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            >
              <Sparkles className="h-4 w-4" /> {testCount} Test-Adressen entfernen
            </Button>
          )}
          <Button variant="outline" onClick={handleExportCsv} className="gap-2" disabled={!rows.length}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button onClick={() => setAdding(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Adresse hinzufügen
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-muted-foreground text-center py-12 text-sm">
          Keine Einträge in der Suppression-Liste.
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[140px]">Grund</TableHead>
                  <TableHead className="w-[180px]">Hinzugefügt</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-[110px] text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r) => {
                  const test = isTestAddress(r.email);
                  return (
                    <TableRow key={r.email}>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-2">
                          <span>{r.email}</span>
                          {test && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-400">
                              TEST
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{reasonBadge(r.reason)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(r.suppressed_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[320px] truncate" title={JSON.stringify(r.details)}>
                        {r.details ? JSON.stringify(r.details) : '–'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(r.email)} className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
              <span>
                Seite {page + 1} von {totalPages} · {rows.length} Einträge gesamt
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add Dialog */}
      <AlertDialog open={adding} onOpenChange={setAdding}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Adresse zur Suppression-Liste hinzufügen</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Adresse erhält keine Mails mehr — auch keine transaktionalen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="email@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              type="email"
            />
            <Select value={newReason} onValueChange={(v) => setNewReason(v as Reason)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">manual</SelectItem>
                <SelectItem value="complaint">complaint</SelectItem>
                <SelectItem value="bounce">bounce</SelectItem>
                <SelectItem value="unsubscribe">unsubscribe</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Notiz (optional)"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleAdd} disabled={busy || !newEmail.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Hinzufügen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Adresse entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono">{removeTarget}</span> wird aus der Suppression-Liste entfernt
              und kann zukünftig wieder Mails empfangen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={busy} className="bg-rose-500 hover:bg-rose-600">
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Remove Test Confirmation */}
      <AlertDialog open={bulkConfirm} onOpenChange={setBulkConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alle Test-Adressen entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              Es werden alle Resend-Test-Adressen (<span className="font-mono">*@resend.dev</span>) aus der
              Suppression-Liste gelöscht. Echte Bounces bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkRemoveTest} disabled={busy} className="bg-amber-500 hover:bg-amber-600 text-amber-950">
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Alle entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
