import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight,
  Scissors,
  ArrowUpDown,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

export interface SceneDiffEntry {
  sceneId: string;
  matchedAssetUrl: string;
  oldOrderIndex: number;
  newOrderIndex: number;
  oldDuration: number;
  newDuration: number;
  oldTrimStart: number;
  newTrimStart: number;
  reordered: boolean;
  trimmed: boolean;
}

export interface NLEDiffPayload {
  reordered: SceneDiffEntry[];
  trimmed: SceneDiffEntry[];
  unchanged: SceneDiffEntry[];
  deleted: { sceneId: string; orderIndex: number; clipUrl: string | null }[];
  unknownAssets: { assetId: string; url: string | null; spineOrder: number }[];
  warnings: string[];
}

interface NLEImportDiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diff: NLEDiffPayload | null;
  onConfirm: () => void;
  applying: boolean;
}

const fmtSec = (s: number) => `${s.toFixed(2)}s`;
const shortId = (id: string) => id.slice(0, 8);
const shortUrl = (url: string | null) =>
  url ? url.split('/').pop()?.split('?')[0]?.slice(0, 40) ?? '—' : '—';

export const NLEImportDiffDialog: React.FC<NLEImportDiffDialogProps> = ({
  open,
  onOpenChange,
  diff,
  onConfirm,
  applying,
}) => {
  const totalChanges = diff
    ? diff.reordered.length + diff.trimmed.length
    : 0;
  const hasIssues = diff
    ? diff.deleted.length + diff.unknownAssets.length + diff.warnings.length > 0
    : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpDown className="h-5 w-5 text-primary" />
            FCPXML Roundtrip — Änderungen prüfen
          </DialogTitle>
          <DialogDescription>
            Vergleich der hochgeladenen Sequenz mit deinen aktuellen Composer-Szenen.
          </DialogDescription>
        </DialogHeader>

        {!diff ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-3 -mr-3">
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <SummaryCard
                  icon={<ArrowUpDown className="h-3.5 w-3.5" />}
                  label="Umsortiert"
                  value={diff.reordered.length}
                  tone={diff.reordered.length > 0 ? 'primary' : 'muted'}
                />
                <SummaryCard
                  icon={<Scissors className="h-3.5 w-3.5" />}
                  label="Getrimmt"
                  value={diff.trimmed.length}
                  tone={diff.trimmed.length > 0 ? 'primary' : 'muted'}
                />
                <SummaryCard
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  label="Fehlend"
                  value={diff.deleted.length}
                  tone={diff.deleted.length > 0 ? 'warning' : 'muted'}
                />
                <SummaryCard
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  label="Unverändert"
                  value={diff.unchanged.length}
                  tone="muted"
                />
              </div>

              {/* Reordered */}
              {diff.reordered.length > 0 && (
                <Section
                  title="Umsortiert"
                  icon={<ArrowUpDown className="h-4 w-4" />}
                >
                  {diff.reordered.map((d) => (
                    <DiffRow
                      key={`re-${d.sceneId}`}
                      sceneId={d.sceneId}
                      url={d.matchedAssetUrl}
                      left={`Position ${d.oldOrderIndex + 1}`}
                      right={`Position ${d.newOrderIndex + 1}`}
                    />
                  ))}
                </Section>
              )}

              {/* Trimmed */}
              {diff.trimmed.length > 0 && (
                <Section title="Getrimmt" icon={<Scissors className="h-4 w-4" />}>
                  {diff.trimmed.map((d) => (
                    <DiffRow
                      key={`tr-${d.sceneId}`}
                      sceneId={d.sceneId}
                      url={d.matchedAssetUrl}
                      left={`${fmtSec(d.oldDuration)} (in ${fmtSec(d.oldTrimStart)})`}
                      right={`${fmtSec(d.newDuration)} (in ${fmtSec(d.newTrimStart)})`}
                    />
                  ))}
                </Section>
              )}

              {/* Deleted (warning, not applied) */}
              {diff.deleted.length > 0 && (
                <Section
                  title="Fehlend in FCPXML — werden NICHT gelöscht"
                  icon={<Trash2 className="h-4 w-4 text-warning" />}
                  tone="warning"
                >
                  <p className="text-xs text-muted-foreground mb-2">
                    Diese Szenen sind nicht in der hochgeladenen Datei enthalten. Aus Sicherheitsgründen werden sie nicht automatisch entfernt.
                  </p>
                  {diff.deleted.map((d) => (
                    <div
                      key={`del-${d.sceneId}`}
                      className="text-xs px-2 py-1.5 rounded bg-muted/50 font-mono"
                    >
                      Szene {d.orderIndex + 1} · {shortId(d.sceneId)} · {shortUrl(d.clipUrl)}
                    </div>
                  ))}
                </Section>
              )}

              {/* Unknown assets */}
              {diff.unknownAssets.length > 0 && (
                <Section
                  title="Unbekannte Clips im FCPXML"
                  icon={<AlertTriangle className="h-4 w-4 text-warning" />}
                  tone="warning"
                >
                  <p className="text-xs text-muted-foreground mb-2">
                    Diese Clips referenzieren Dateien, die nicht zu deinem Projekt gehören (z. B. extern hinzugefügt). Sie werden ignoriert.
                  </p>
                  {diff.unknownAssets.map((u, i) => (
                    <div
                      key={`unk-${i}`}
                      className="text-xs px-2 py-1.5 rounded bg-muted/50 font-mono"
                    >
                      Spine #{u.spineOrder + 1} · {shortUrl(u.url)}
                    </div>
                  ))}
                </Section>
              )}

              {/* Warnings */}
              {diff.warnings.length > 0 && (
                <Section
                  title="Hinweise"
                  icon={<AlertTriangle className="h-4 w-4 text-warning" />}
                  tone="warning"
                >
                  <ul className="space-y-1">
                    {diff.warnings.map((w, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        • {w}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {totalChanges === 0 && !hasIssues && (
                <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8" />
                  <p className="text-sm">Keine Änderungen erkannt.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={applying}
          >
            Abbrechen
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!diff || totalChanges === 0 || applying}
          >
            {applying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Übernehme…
              </>
            ) : (
              <>Änderungen übernehmen ({totalChanges})</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ----- Subcomponents ----- */

const SummaryCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'primary' | 'warning' | 'muted';
}> = ({ icon, label, value, tone }) => {
  const toneClass =
    tone === 'primary'
      ? 'border-primary/40 bg-primary/5 text-primary'
      : tone === 'warning'
      ? 'border-warning/40 bg-warning/5 text-warning'
      : 'border-border/40 bg-muted/30 text-muted-foreground';
  return (
    <div className={`rounded-md border px-2 py-2 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="text-xl font-semibold mt-0.5">{value}</div>
    </div>
  );
};

const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  tone?: 'warning';
  children: React.ReactNode;
}> = ({ title, icon, tone, children }) => (
  <div
    className={`rounded-md border p-3 space-y-2 ${
      tone === 'warning' ? 'border-warning/30 bg-warning/5' : 'border-border/40'
    }`}
  >
    <div className="flex items-center gap-2 text-sm font-medium">
      {icon}
      {title}
    </div>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const DiffRow: React.FC<{
  sceneId: string;
  url: string;
  left: string;
  right: string;
}> = ({ sceneId, url, left, right }) => (
  <div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-muted/40">
    <Badge variant="outline" className="font-mono text-[10px]">
      {shortId(sceneId)}
    </Badge>
    <span className="text-muted-foreground truncate flex-1 font-mono">
      {shortUrl(url)}
    </span>
    <span className="text-muted-foreground">{left}</span>
    <ArrowRight className="h-3 w-3 text-primary shrink-0" />
    <span className="font-medium text-primary">{right}</span>
  </div>
);
