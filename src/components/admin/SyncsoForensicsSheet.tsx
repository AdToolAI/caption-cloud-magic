/**
 * SyncsoForensicsSheet — v129.5
 *
 * Admin-only forensic UI for failed Sync.so dialog passes. Lets an admin:
 *   - Generate a support bundle (read-only) for a failed pass.
 *   - Replay one of 7 documented presets to a STRICTLY ISOLATED endpoint
 *     (separate webhook, no production-state mutation, no refund).
 *
 * Strictly informational — never affects live scene state.
 */
import { useState } from 'react';
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
import { Loader2, Download, FlaskConical, FileJson, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

export function SyncsoForensicsSheet({
  open,
  onOpenChange,
  sceneId,
  defaultPassIndex = 0,
}: Props) {
  const [passIndex, setPassIndex] = useState(defaultPassIndex);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleResult, setBundleResult] = useState<any>(null);

  const [preset, setPreset] = useState('exact');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayResult, setReplayResult] = useState<any>(null);

  const generateBundle = async () => {
    setBundleLoading(true);
    setBundleResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('syncso-support-bundle', {
        body: { scene_id: sceneId, pass_index: passIndex },
      });
      if (error) throw error;
      setBundleResult(data);
      toast.success('Support-Bundle erzeugt');
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
      toast.error(`Replay-Fehler: ${e?.message ?? e}`);
    } finally {
      setReplayLoading(false);
    }
  };

  const presetMeta = PRESETS.find((p) => p.value === preset);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            Sync.so Forensik
            <Badge variant="outline" className="ml-2">v129.5</Badge>
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
              Support-Bundle
            </TabsTrigger>
            <TabsTrigger value="replay">
              <FlaskConical className="h-4 w-4 mr-1" />
              Replay
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bundle" className="space-y-3">
            <Button onClick={generateBundle} disabled={bundleLoading} className="w-full">
              {bundleLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileJson className="h-4 w-4 mr-2" />
              )}
              Bundle erzeugen
            </Button>

            {bundleResult && (
              <div className="rounded border bg-muted/30 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono">{bundleResult.pass_id}</span>
                  {bundleResult.bundle_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      asChild
                    >
                      <a href={bundleResult.bundle_url} target="_blank" rel="noreferrer">
                        <Download className="h-3 w-3 mr-1" />
                        Download JSON
                      </a>
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="provider error_code"
                    value={bundleResult.summary?.provider_error_code ?? '— (missing)'}
                    danger={!bundleResult.summary?.provider_error_code_present}
                  />
                  <Field
                    label="provider error"
                    value={bundleResult.summary?.provider_error ?? '—'}
                  />
                  <Field
                    label="video sha256"
                    value={(bundleResult.summary?.video_sha256 ?? '—').slice(0, 16) + '…'}
                  />
                  <Field
                    label="audio sha256"
                    value={(bundleResult.summary?.audio_sha256 ?? '—').slice(0, 16) + '…'}
                  />
                  <Field
                    label="audio meta"
                    value={JSON.stringify(bundleResult.summary?.audio_meta ?? null)}
                  />
                  <Field
                    label="video meta"
                    value={JSON.stringify(bundleResult.summary?.video_meta ?? null)}
                  />
                </div>
                {!bundleResult.summary?.provider_error_code_present && (
                  <div className="flex items-start gap-1 text-amber-500 text-[11px]">
                    <AlertCircle className="h-3 w-3 mt-0.5" />
                    Provider liefert keinen error_code — wichtiger Befund für Sync.so-Support.
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
                <Field label="duration" value={`${replayResult.duration_ms ?? 0} ms`} />
                <details className="mt-2">
                  <summary className="cursor-pointer text-muted-foreground">
                    Raw response
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
        className={`text-xs ${mono ? 'font-mono' : ''} ${
          danger ? 'text-red-500 font-semibold' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}
