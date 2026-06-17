/**
 * SyncsoForensicsSheet — v129.6
 *
 * Admin-only forensic UI for failed Sync.so dialog passes.
 *
 * v129.6: Bundle-Tab zeigt jetzt Verdict + Provider Truth + Reproducer
 * statt SHA256-Theater. Optionaler Face-Probe-Toggle (~€0.001).
 *
 * Strictly informational — never affects live scene state.
 */
import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Download,
  FlaskConical,
  FileJson,
  AlertCircle,
  Copy,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { extractFunctionsErrorDetails } from '@/lib/functionsError';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sceneId: string;
  defaultPassIndex?: number;
}

interface PresetOption {
  value: string;
  label: string;
  description: string;
  warn?: string;
}

const PRESETS: PresetOption[] = [
  { value: 'exact', label: '1. Exact Reproducer', description: 'Original-Payload byte-nah. Reproduziert provider_unknown_error?' },
  { value: 'omit_sync_mode', label: '2. Omit sync_mode', description: 'Ist cut_off der Trigger?' },
  { value: 'loop', label: '3. sync_mode: loop', description: 'Timing-Experiment — ändert Output-Dauer-Logik', warn: 'Output-Dauer kann anders sein als bei cut_off.' },
  { value: 'bboxes', label: '4. bounding_boxes', description: 'Per-Frame Boxes statt frame_number+coordinates.' },
  { value: 'auto_detect', label: '5. auto_detect', description: 'Sync.so detektiert Sprecher selbst.', warn: 'NICHT für Produktion — multi-speaker unsicher.' },
  { value: 'lipsync_2_pro', label: '6. lipsync-2-pro', description: 'Modellwechsel-Vergleich.' },
  { value: 'lipsync_2', label: '7. lipsync-2', description: 'Modellwechsel-Vergleich.' },
];

const VERDICT_STYLE: Record<string, string> = {
  red: 'border-red-500/40 bg-red-500/10 text-red-200',
  yellow: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
  orange: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
  blue: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
  gray: 'border-muted bg-muted/30 text-muted-foreground',
};

export function SyncsoForensicsSheet({
  open,
  onOpenChange,
  sceneId,
  defaultPassIndex = 0,
}: Props) {
  const [passIndex, setPassIndex] = useState(defaultPassIndex);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleResult, setBundleResult] = useState<any>(null);
  const [includeFaceProbe, setIncludeFaceProbe] = useState(false);

  const [preset, setPreset] = useState('exact');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayResult, setReplayResult] = useState<any>(null);
  const [curlCopied, setCurlCopied] = useState(false);

  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightResult, setPreflightResult] = useState<any>(null);

  const runPreflight = async () => {
    setPreflightLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('syncso-preflight', {
        body: { scene_id: sceneId, pass_index: passIndex },
      });
      if (error) throw error;
      setPreflightResult(data);
    } catch (e: any) {
      const details = await extractFunctionsErrorDetails(e);
      setPreflightResult({ verdict: 'fail', error: details.message, edge_status: details.status });
      toast.error(`Preflight: ${details.message}`);
    } finally {
      setPreflightLoading(false);
    }
  };

  // Auto-run preflight when sheet opens or pass changes
  useEffect(() => {
    if (!open) return;
    setPreflightResult(null);
    runPreflight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sceneId, passIndex]);

  const generateBundle = async () => {
    setBundleLoading(true);
    setBundleResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('syncso-support-bundle', {
        body: { scene_id: sceneId, pass_index: passIndex, include_face_probe: includeFaceProbe },
      });
      if (error) throw error;
      setBundleResult(data);
      toast.success('Bundle erzeugt');
    } catch (e: any) {
      toast.error(`Bundle-Fehler: ${e?.message ?? e}`);
    } finally {
      setBundleLoading(false);
    }
  };

  const runReplay = async () => {
    if (!confirm) {
      toast.error('Bitte Bestätigungs-Checkbox setzen');
      return;
    }
    if (reason.trim().length < 5) {
      toast.error('Grund benötigt (min. 5 Zeichen)');
      return;
    }
    setReplayLoading(true);
    setReplayResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('syncso-replay', {
        body: {
          scene_id: sceneId,
          pass_index: passIndex,
          preset,
          reason: reason.trim(),
          confirm: true,
        },
      });
      if (error) throw error;
      setReplayResult(data);
      const code = data?.provider_error_code;
      const status = data?.provider_status;
      if (status === 'dispatched' && data?.replay_provider_job_id) {
        toast.success(`Replay dispatched — Job ${data.replay_provider_job_id}`);
      } else if (code) {
        toast.warning(`Provider Error Code: ${code}`);
      } else if (data?.provider_error) {
        toast.error(`Provider Error: ${data.provider_error}`);
      } else {
        toast.message(`Status: ${status}`);
      }
    } catch (e: any) {
      const details = await extractFunctionsErrorDetails(e);
      setReplayResult({
        provider_status: 'edge_function_error',
        provider_error: details.message,
        provider_error_code: (details.body as any)?.error ?? undefined,
        duration_ms: 0,
        response: details.body ?? details.rawBody ?? null,
        edge_status: details.status ?? null,
      });
      toast.error(`Replay-Fehler: ${details.message}`);
    } finally {
      setReplayLoading(false);
    }
  };

  const copyCurl = async () => {
    const curl = bundleResult?.bundle?.curl_snippet;
    if (!curl) return;
    await navigator.clipboard.writeText(curl);
    setCurlCopied(true);
    setTimeout(() => setCurlCopied(false), 2000);
  };

  const presetMeta = PRESETS.find((p) => p.value === preset);
  const b = bundleResult?.bundle;
  const verdict = b?.verdict;
  const pt = b?.provider_truth;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            Sync.so Forensik
            <Badge variant="outline" className="ml-2">v129.6</Badge>
          </SheetTitle>
          <SheetDescription>
            Admin-Werkzeug. Strikt isoliert von Produktion: keine Mutation an
            composer_scenes / dialog_shots / Wallet / Watchdog.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex items-center gap-2">
          <label className="text-sm font-medium">Pass-Index</label>
          <Input
            type="number"
            min={0}
            value={passIndex}
            onChange={(e) => setPassIndex(Number(e.target.value))}
            className="w-20"
          />
          <span className="text-xs text-muted-foreground">scene: {sceneId.slice(0, 8)}…</span>
        </div>

        <Tabs defaultValue="bundle" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="bundle">
              <FileJson className="h-4 w-4 mr-1" />
              Diagnose-Bundle
            </TabsTrigger>
            <TabsTrigger value="replay">
              <FlaskConical className="h-4 w-4 mr-1" />
              Replay
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bundle" className="space-y-3">
            <div className="flex items-start gap-2 rounded border border-muted p-2">
              <Checkbox
                id="include-face"
                checked={includeFaceProbe}
                onCheckedChange={(v) => setIncludeFaceProbe(!!v)}
              />
              <label htmlFor="include-face" className="text-xs leading-tight">
                <span className="font-medium">Face-Probe</span> mit Gemini Vision (~€0.001)
                — zählt Gesichter im ersten Frame. Beantwortet 50%+ der
                <code className="mx-1">generation_unknown_error</code>-Fälle direkt.
              </label>
            </div>

            <Button onClick={generateBundle} disabled={bundleLoading} className="w-full">
              {bundleLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileJson className="h-4 w-4 mr-2" />
              )}
              Bundle erzeugen
            </Button>

            {b && (
              <div className="space-y-3 text-xs">
                {/* Verdict-Banner */}
                {verdict && (
                  <div className={`rounded border p-3 ${VERDICT_STYLE[verdict.level] ?? VERDICT_STYLE.gray}`}>
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        <div className="font-semibold text-sm">{verdict.headline}</div>
                        <div className="text-xs opacity-90">{verdict.suggestion}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Header: job id + download */}
                <div className="flex items-center justify-between rounded border bg-muted/20 p-2">
                  <div className="font-mono text-[11px] truncate">
                    job: {b.provider_job_id ?? '—'}
                  </div>
                  {bundleResult.bundle_url && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={bundleResult.bundle_url} target="_blank" rel="noreferrer">
                        <Download className="h-3 w-3 mr-1" />
                        Download JSON
                      </a>
                    </Button>
                  )}
                </div>

                {/* Provider Truth */}
                <details open className="rounded border bg-muted/20 p-2">
                  <summary className="cursor-pointer font-medium text-xs">
                    Provider Truth
                    {pt?.status && <Badge variant="outline" className="ml-2 text-[10px]">{pt.status}</Badge>}
                    {pt?.worker_ms != null && <span className="ml-2 text-muted-foreground">{pt.worker_ms}ms</span>}
                  </summary>
                  <div className="mt-2 space-y-1">
                    <Field label="error_details" value={JSON.stringify(pt?.error_details ?? null)} mono />
                    <Field label="model" value={pt?.model ?? '—'} />
                    <Field label="options" value={JSON.stringify(pt?.options ?? null)} mono />
                    {pt?.fetch_error && (
                      <Field label="fetch_error" value={pt.fetch_error} danger />
                    )}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[10px] text-muted-foreground">Raw JSON</summary>
                      <pre className="mt-1 overflow-x-auto bg-background p-2 rounded text-[10px]">
                        {JSON.stringify(pt?.raw ?? null, null, 2)}
                      </pre>
                    </details>
                  </div>
                </details>

                {/* Reproducer */}
                {b.curl_snippet && (
                  <details className="rounded border bg-muted/20 p-2">
                    <summary className="cursor-pointer font-medium text-xs flex items-center justify-between">
                      <span>Reproducer (curl)</span>
                    </summary>
                    <div className="mt-2 space-y-1">
                      <Button size="sm" variant="outline" onClick={copyCurl} className="h-7 text-[10px]">
                        {curlCopied ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                        {curlCopied ? 'Kopiert' : 'Copy'}
                      </Button>
                      <pre className="overflow-x-auto bg-background p-2 rounded text-[10px] whitespace-pre-wrap break-all">
                        {b.curl_snippet}
                      </pre>
                    </div>
                  </details>
                )}

                {/* Asset reachability (kompakt) */}
                <div className="rounded border bg-muted/20 p-2 grid grid-cols-2 gap-2">
                  <Field
                    label="video reachable"
                    value={b.asset_reachable?.video?.reachable ? `✓ ${b.asset_reachable.video.http_status}` : `✗ ${b.asset_reachable?.video?.error ?? 'unknown'}`}
                    danger={!b.asset_reachable?.video?.reachable}
                  />
                  <Field
                    label="audio reachable"
                    value={b.asset_reachable?.audio?.reachable ? `✓ ${b.asset_reachable.audio.http_status}` : `✗ ${b.asset_reachable?.audio?.error ?? 'unknown'}`}
                    danger={!b.asset_reachable?.audio?.reachable}
                  />
                </div>

                {/* Face Probe */}
                {b.face_probe && (
                  <div className="rounded border bg-muted/20 p-2 space-y-1">
                    <div className="font-medium text-xs">Face-Probe (Frame 0)</div>
                    <Field
                      label="faces detected"
                      value={String(b.face_probe.frame_0?.faces ?? '—')}
                      danger={b.face_probe.frame_0?.faces === 0 || (b.face_probe.frame_0?.faces ?? 0) > 1}
                    />
                    {b.face_probe.frame_0?.error && (
                      <Field label="probe error" value={b.face_probe.frame_0.error} danger />
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="replay" className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Preset</label>
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {presetMeta && (
                <p className="text-xs text-muted-foreground">{presetMeta.description}</p>
              )}
              {presetMeta?.warn && (
                <p className="text-xs text-amber-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {presetMeta.warn}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Grund (Pflicht, min. 5 Zeichen)</label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="z.B. Reproduktion provider_unknown_error mit cut_off"
                rows={2}
              />
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="confirm-replay"
                checked={confirm}
                onCheckedChange={(v) => setConfirm(!!v)}
              />
              <label htmlFor="confirm-replay" className="text-xs leading-tight">
                Ich bestätige: dieser Replay erzeugt einen Sync.so-Job, kostet Geld,
                und das Ergebnis landet ausschließlich in <code>syncso_replay_log</code>.
                Keine Produktions-Mutation.
              </label>
            </div>

            <Button
              onClick={runReplay}
              disabled={replayLoading || !confirm || reason.trim().length < 5}
              className="w-full"
              variant="destructive"
            >
              {replayLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FlaskConical className="h-4 w-4 mr-2" />
              )}
              Replay dispatchen
            </Button>

            {replayResult && (
              <div className="rounded border bg-muted/30 p-3 space-y-2 text-xs">
                <Field label="replay job" value={replayResult.replay_provider_job_id ?? '—'} mono />
                <Field label="original job" value={replayResult.original_provider_job_id ?? '—'} mono />
                <Field label="status" value={replayResult.provider_status ?? '—'} />
                <Field
                  label="error_code"
                  value={replayResult.provider_error_code ?? '— (missing)'}
                  danger={!replayResult.provider_error_code && !!replayResult.provider_error}
                />
                <Field label="error" value={replayResult.provider_error ?? '—'} />
                {replayResult.edge_status && (
                  <Field label="edge status" value={String(replayResult.edge_status)} danger />
                )}
                <Field label="duration" value={`${replayResult.duration_ms ?? 0} ms`} />
                <details className="mt-2">
                  <summary className="cursor-pointer text-muted-foreground">
                    Raw response / Edge details
                  </summary>
                  <pre className="mt-1 overflow-x-auto bg-background p-2 rounded text-[10px]">
                    {JSON.stringify(replayResult.response, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  value,
  danger,
  mono,
}: {
  label: string;
  value: string;
  danger?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={`text-xs break-all ${mono ? 'font-mono' : ''} ${
          danger ? 'text-red-400 font-semibold' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}
