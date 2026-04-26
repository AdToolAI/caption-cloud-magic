import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileCode, FileText, Package, Loader2, Clock, AlertTriangle, Upload } from 'lucide-react';
import { useNLEExport, type NLEExportRecord } from '@/hooks/useNLEExport';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NLEImportDiffDialog, type NLEDiffPayload } from './NLEImportDiffDialog';

interface NLEExportPanelProps {
  projectId?: string;
  className?: string;
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatRelative = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} h`;
  return `vor ${Math.floor(h / 24)} d`;
};

const formatLabel: Record<string, string> = {
  fcpxml: 'FCPXML',
  edl: 'EDL',
  bundle: 'Bundle',
};

export const NLEExportPanel: React.FC<NLEExportPanelProps> = ({ projectId, className }) => {
  const {
    exporting,
    history,
    loadingHistory,
    exportFCPXML,
    exportEDL,
    exportBundle,
    reDownload,
    previewImport,
    applyImport,
  } = useNLEExport(projectId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [diff, setDiff] = useState<NLEDiffPayload | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportFile(file);
    setPreviewing(true);
    setDiff(null);
    setDialogOpen(true);
    const result = await previewImport(file);
    setPreviewing(false);
    if (result?.diff) setDiff(result.diff);
    else setDialogOpen(false);
  };

  const handleConfirmApply = async () => {
    if (!importFile) return;
    setApplying(true);
    const result = await applyImport(importFile);
    setApplying(false);
    if (result) {
      setDialogOpen(false);
      setImportFile(null);
      setDiff(null);
    }
  };

  const disabled = !projectId;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          NLE-Export (Premiere / Resolve / FCP)
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Exportiere als professionelle Sequenz-Datei und schneide in deinem NLE weiter.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Export Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || exporting !== null}
            onClick={() => exportFCPXML()}
            className="justify-start"
          >
            {exporting === 'fcpxml' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileCode className="h-4 w-4" />
            )}
            FCPXML
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || exporting !== null}
            onClick={() => exportEDL()}
            className="justify-start"
          >
            {exporting === 'edl' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            EDL
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={disabled || exporting !== null}
            onClick={() => exportBundle()}
            className="justify-start"
          >
            {exporting === 'bundle' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Package className="h-4 w-4" />
            )}
            Bundle (ZIP)
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong>FCPXML</strong> öffnet Resolve / Premiere / FCP mit allen Clips & Audio.{' '}
          <strong>EDL</strong> ist Legacy (Avid). <strong>Bundle</strong> packt alle Medien lokal in ein ZIP — ideal zum Verschicken oder Offline-Schnitt.
        </p>

        {/* Roundtrip Re-Import */}
        <div className="pt-2 border-t border-border/40 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Upload className="h-3 w-3" />
            Roundtrip — geänderte Sequenz importieren
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".fcpxml,application/xml,text/xml"
            className="hidden"
            onChange={handleFilePick}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || previewing}
            onClick={() => fileInputRef.current?.click()}
            className="w-full justify-start"
          >
            {previewing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            FCPXML hochladen & Diff prüfen
          </Button>
          <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
            Lade die in Resolve/Premiere geänderte <code>.fcpxml</code> hoch — wir zeigen dir alle Trims, Reorder & gelöschten Szenen vor der Übernahme.
          </p>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/40">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Clock className="h-3 w-3" />
              Letzte Exporte
            </div>
            <ScrollArea className="max-h-48">
              <div className="space-y-1.5">
                {history.map((rec: NLEExportRecord) => {
                  const expired = new Date(rec.expires_at).getTime() < Date.now();
                  return (
                    <div
                      key={rec.id}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-muted/40 hover:bg-muted/70 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-primary">
                            {formatLabel[rec.format] ?? rec.format}
                          </span>
                          <span className="text-muted-foreground">{formatBytes(rec.file_size_bytes)}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">{formatRelative(rec.created_at)}</span>
                          {rec.warnings && rec.warnings.length > 0 && (
                            <AlertTriangle
                              className="h-3 w-3 text-warning"
                              aria-label={`${rec.warnings.length} Hinweis(e)`}
                            />
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground/70">
                          {rec.scene_count} Szenen · {rec.total_duration_sec.toFixed(1)}s
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        disabled={expired}
                        onClick={() => reDownload(rec)}
                        title={expired ? 'Abgelaufen' : 'Erneut herunterladen'}
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {loadingHistory && history.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
            Lade History…
          </p>
        )}
      </CardContent>

      <NLEImportDiffDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setImportFile(null);
            setDiff(null);
          }
        }}
        diff={diff}
        onConfirm={handleConfirmApply}
        applying={applying}
      />
    </Card>
  );
};
