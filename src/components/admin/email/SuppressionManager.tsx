import { useCallback, useEffect, useState } from 'react';
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
import { Loader2, Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';

type Sup = {
  email: string;
  reason: 'bounce' | 'complaint' | 'unsubscribe' | 'manual';
  suppressed_at: string;
  details: any;
};

export function SuppressionManager() {
  const [rows, setRows] = useState<Sup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newReason, setNewReason] = useState<Sup['reason']>('manual');
  const [newNote, setNewNote] = useState('');
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('email_suppression_list')
      .select('*')
      .order('suppressed_at', { ascending: false })
      .limit(500);
    if (search.trim()) q = q.ilike('email', `%${search.trim()}%`);
    const { data, error } = await q;
    if (error) { console.error(error); setRows([]); }
    else setRows((data ?? []) as Sup[]);
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const reasonBadge = (r: Sup['reason']) => {
    const map: Record<Sup['reason'], string> = {
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
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? 'Aktion fehlgeschlagen');
      return false;
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

  return (
    <Card className="p-5 bg-card/60 backdrop-blur">
      <div className="flex flex-col md:flex-row gap-3 mb-4 md:items-center md:justify-between">
        <Input
          placeholder="Email suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="md:max-w-sm"
        />
        <Button onClick={() => setAdding(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Adresse hinzufügen
        </Button>
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
              {rows.map((r) => (
                <TableRow key={r.email}>
                  <TableCell className="text-xs">{r.email}</TableCell>
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
              ))}
            </TableBody>
          </Table>
        </div>
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
            <Select value={newReason} onValueChange={(v) => setNewReason(v as Sup['reason'])}>
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
    </Card>
  );
}
