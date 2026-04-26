import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type NLEFormat = 'fcpxml' | 'edl' | 'bundle';

export interface NLEExportRecord {
  id: string;
  project_id: string;
  format: NLEFormat;
  storage_path: string;
  file_size_bytes: number;
  scene_count: number;
  total_duration_sec: number;
  warnings: string[];
  expires_at: string;
  created_at: string;
}

interface ExportResult {
  success: true;
  exportId: string;
  downloadUrl: string;
  expiresAt: string;
  warnings: string[];
  format: NLEFormat;
  sizeBytes: number;
}

const FN_MAP: Record<NLEFormat, string> = {
  fcpxml: 'composer-export-fcpxml',
  edl: 'composer-export-edl',
  bundle: 'composer-export-bundle',
};

const triggerDownload = (url: string, filename: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

export function useNLEExport(projectId?: string) {
  const [exporting, setExporting] = useState<NLEFormat | null>(null);
  const [history, setHistory] = useState<NLEExportRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!projectId) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('composer_nle_exports')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      setHistory((data ?? []) as NLEExportRecord[]);
    } catch (err) {
      console.error('[useNLEExport] history error:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const runExport = useCallback(
    async (format: NLEFormat, opts?: { fps?: number }) => {
      if (!projectId) {
        toast.error('Kein Projekt ausgewählt');
        return null;
      }
      setExporting(format);
      const toastId = toast.loading(
        format === 'bundle'
          ? 'Bundle wird gepackt — kann 30–60 s dauern…'
          : `${format.toUpperCase()} wird exportiert…`,
      );
      try {
        const { data, error } = await supabase.functions.invoke<ExportResult>(FN_MAP[format], {
          body: { projectId, fps: opts?.fps ?? 30 },
        });
        if (error) throw new Error(error.message);
        if (!data?.success || !data.downloadUrl) {
          throw new Error('Kein Download-Link erhalten');
        }

        const ext = format === 'bundle' ? 'zip' : format === 'fcpxml' ? 'fcpxml' : 'edl';
        triggerDownload(data.downloadUrl, `composer-${projectId.slice(0, 8)}.${ext}`);

        toast.success(
          `${format.toUpperCase()} bereit (${(data.sizeBytes / 1024).toFixed(1)} KB)`,
          {
            id: toastId,
            description:
              data.warnings.length > 0 ? `${data.warnings.length} Hinweis(e) — siehe Datei` : undefined,
          },
        );
        await loadHistory();
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Export fehlgeschlagen';
        console.error('[useNLEExport] error:', err);
        toast.error(msg, { id: toastId });
        return null;
      } finally {
        setExporting(null);
      }
    },
    [projectId, loadHistory],
  );

  const reDownload = useCallback(async (record: NLEExportRecord) => {
    try {
      const { data, error } = await supabase.storage
        .from('composer-nle-exports')
        .createSignedUrl(record.storage_path, 3600);
      if (error || !data?.signedUrl) throw new Error('Datei nicht mehr verfügbar');
      const ext = record.format === 'bundle' ? 'zip' : record.format;
      triggerDownload(data.signedUrl, `composer-${record.project_id.slice(0, 8)}.${ext}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download fehlgeschlagen');
    }
  }, []);

  return {
    exporting,
    history,
    loadingHistory,
    exportFCPXML: (opts?: { fps?: number }) => runExport('fcpxml', opts),
    exportEDL: (opts?: { fps?: number }) => runExport('edl', opts),
    exportBundle: (opts?: { fps?: number }) => runExport('bundle', opts),
    reDownload,
    refreshHistory: loadHistory,
  };
}
