import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RefreshCw, Bug, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface BugReport {
  id: string;
  user_email: string | null;
  title: string;
  description: string;
  severity: string;
  status: string;
  route: string | null;
  user_agent: string | null;
  viewport: string | null;
  screenshot_url: string | null;
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

const severityColors: Record<string, string> = {
  low: 'bg-green-500/10 text-green-700 border-green-500/30',
  medium: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30',
  high: 'bg-orange-500/10 text-orange-700 border-orange-500/30',
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
};

const statusColors: Record<string, string> = {
  open: 'bg-blue-500/10 text-blue-700',
  in_progress: 'bg-yellow-500/10 text-yellow-700',
  resolved: 'bg-green-500/10 text-green-700',
  wont_fix: 'bg-muted text-muted-foreground',
  duplicate: 'bg-muted text-muted-foreground',
};

export function BugReportsAdmin() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<BugReport | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from('bug_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (filter !== 'all') {
      query = query.eq('status', filter);
    }
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setReports((data ?? []) as BugReport[]);
    setLoading(false);
  };

  const updateStatus = async (id: string, status: string) => {
    setUpdatingStatus(id);
    const updates: Record<string, unknown> = { status };
    if (status === 'resolved') {
      updates.resolved_at = new Date().toISOString();
    }
    const { error } = await supabase.from('bug_reports').update(updates).eq('id', id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Status aktualisiert');
      await load();
    }
    setUpdatingStatus(null);
  };

  const saveNotes = async () => {
    if (!selected) return;
    const { error } = await supabase
      .from('bug_reports')
      .update({ admin_notes: adminNotes })
      .eq('id', selected.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Notizen gespeichert');
      setSelected(null);
      await load();
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Bug className="h-6 w-6" />
                Bug Reports
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                User-eingereichte Bug-Meldungen aus der App
              </p>
            </div>
            <div className="flex gap-2">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="open">🔵 Offen</SelectItem>
                  <SelectItem value="in_progress">🟡 In Arbeit</SelectItem>
                  <SelectItem value="resolved">🟢 Gelöst</SelectItem>
                  <SelectItem value="wont_fix">Won't Fix</SelectItem>
                  <SelectItem value="duplicate">Duplicate</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={load} variant="outline" size="icon">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Lade...</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bug className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Keine Bug-Reports im Filter „{filter}"</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => {
                    setSelected(r);
                    setAdminNotes(r.admin_notes ?? '');
                  }}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline" className={severityColors[r.severity]}>
                          {r.severity}
                        </Badge>
                        <Badge className={statusColors[r.status]}>{r.status}</Badge>
                        {r.route && (
                          <code className="text-xs text-muted-foreground">{r.route}</code>
                        )}
                      </div>
                      <h4 className="font-semibold text-sm">{r.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {r.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {r.user_email ?? 'Anonym'} •{' '}
                        {formatDistanceToNow(new Date(r.created_at), {
                          addSuffix: true,
                          locale: de,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Bug className="h-5 w-5" />
                  {selected.title}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={severityColors[selected.severity]}>
                    {selected.severity}
                  </Badge>
                  <Badge className={statusColors[selected.status]}>{selected.status}</Badge>
                </div>

                <div>
                  <p className="text-sm font-medium mb-1">Beschreibung</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {selected.description}
                  </p>
                </div>

                {selected.screenshot_url && (
                  <div>
                    <p className="text-sm font-medium mb-1">Screenshot</p>
                    <a href={selected.screenshot_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={selected.screenshot_url}
                        alt="Bug screenshot"
                        className="rounded border border-border max-h-80"
                      />
                    </a>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="font-medium">User</p>
                    <p className="text-muted-foreground">{selected.user_email ?? 'Anonym'}</p>
                  </div>
                  <div>
                    <p className="font-medium">Route</p>
                    <p className="text-muted-foreground">{selected.route ?? '–'}</p>
                  </div>
                  <div>
                    <p className="font-medium">Viewport</p>
                    <p className="text-muted-foreground">{selected.viewport ?? '–'}</p>
                  </div>
                  <div>
                    <p className="font-medium">Erstellt</p>
                    <p className="text-muted-foreground">
                      {new Date(selected.created_at).toLocaleString('de-DE')}
                    </p>
                  </div>
                </div>

                {selected.user_agent && (
                  <div>
                    <p className="text-xs font-medium mb-1">User Agent</p>
                    <code className="text-xs text-muted-foreground break-all">
                      {selected.user_agent}
                    </code>
                  </div>
                )}

                <div>
                  <p className="text-sm font-medium mb-1">Admin Notizen</p>
                  <Textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Interne Notizen, Lösungsschritte..."
                    rows={3}
                  />
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Select
                    value={selected.status}
                    onValueChange={(s) => updateStatus(selected.id, s)}
                    disabled={updatingStatus === selected.id}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Offen</SelectItem>
                      <SelectItem value="in_progress">In Arbeit</SelectItem>
                      <SelectItem value="resolved">Gelöst</SelectItem>
                      <SelectItem value="wont_fix">Won't Fix</SelectItem>
                      <SelectItem value="duplicate">Duplicate</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={saveNotes}>Notizen speichern</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
