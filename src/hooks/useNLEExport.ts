import { tx } from "@/lib/i18nText";
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
        toast.error(tx({ de: 'Kein Projekt ausgewählt', en: 'No project selected', es: 'Ningún proyecto seleccionado' }));
        return null;
      }
      setExporting(format);
      const toastId = toast.loading(
        format === 'bundle'
          ? tx({ de: 'Bundle wird gepackt — kann 30–60 s dauern…', en: 'Bundle is being packaged — may take 30–60 s…', es: 'El paquete se está empaquetando — puede tardar 30–60 s…' })
          : tx({ de: `${format.toUpperCase()} wird exportiert…`, en: `${format.toUpperCase()} is exported…`, es: `${format.toUpperCase()} se exporta...` }),
      );
      try {
        const { data, error } = await supabase.functions.invoke<ExportResult>(FN_MAP[format], {
          body: { projectId, fps: opts?.fps ?? 30 },
        });
        if (error) throw new Error(error.message);
        if (!data?.success || !data.downloadUrl) {
          throw new Error(tx({ de: 'Kein Download-Link erhalten', en: 'No download link received', es: 'No se recibió ningún enlace de descarga' }));
        }

        const ext = format === 'bundle' ? 'zip' : format === 'fcpxml' ? 'fcpxml' : 'edl';
        triggerDownload(data.downloadUrl, `composer-${projectId.slice(0, 8)}.${ext}`);

        toast.success(
          tx({ de: `${format.toUpperCase()} bereit (${(data.sizeBytes / 1024).toFixed(1)} KB)`, en: `${format.toUpperCase()} ready (${(data.sizeBytes / 1024).toFixed(1)} KB)`, es: `${format.toUpperCase()} listo (${(data.sizeBytes / 1024).toFixed(1)} KB)` }),
          {
            id: toastId,
            description:
              data.warnings.length > 0 ? tx({ de: `${data.warnings.length} Hinweis(e) — siehe Datei`, en: `${data.warnings.length} Note(s) — see file`, es: `${data.warnings.length} Nota(s) — ver archivo` }) : undefined,
          },
        );
        await loadHistory();
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : tx({ de: 'Export fehlgeschlagen', en: 'Export failed', es: 'Error de exportación' });
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
      if (error || !data?.signedUrl) throw new Error(tx({ de: 'Datei nicht mehr verfügbar', en: 'File no longer available', es: 'Archivo no disponible' }));
      const ext = record.format === 'bundle' ? 'zip' : record.format;
      triggerDownload(data.signedUrl, `composer-${record.project_id.slice(0, 8)}.${ext}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx({ de: 'Download fehlgeschlagen', en: 'Download failed', es: 'Descarga fallida' }));
    }
  }, []);

  const previewImport = useCallback(
    async (file: File) => {
      if (!projectId) {
        toast.error(tx({ de: 'Kein Projekt ausgewählt', en: 'No project selected', es: 'Ningún proyecto seleccionado' }));
        return null;
      }
      try {
        const fcpxmlContent = await file.text();
        const { data, error } = await supabase.functions.invoke('composer-import-fcpxml', {
          body: { projectId, fcpxmlContent, apply: false },
        });
        if (error) throw new Error(error.message);
        if (!data?.success) throw new Error(data?.error || tx({ de: 'Import-Vorschau fehlgeschlagen', en: 'Import preview failed', es: 'Error en la vista previa de importación' }));
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : tx({ de: 'Import-Vorschau fehlgeschlagen', en: 'Import preview failed', es: 'Error en la vista previa de importación' });
        toast.error(msg);
        return null;
      }
    },
    [projectId],
  );

  const applyImport = useCallback(
    async (file: File) => {
      if (!projectId) return null;
      const toastId = toast.loading(tx({ de: 'Änderungen werden übernommen…', en: 'Changes are being applied…', es: 'Se están aplicando los cambios…' }));
      try {
        const fcpxmlContent = await file.text();
        const { data, error } = await supabase.functions.invoke('composer-import-fcpxml', {
          body: { projectId, fcpxmlContent, apply: true },
        });
        if (error) throw new Error(error.message);
        if (!data?.success) throw new Error(data?.error || tx({ de: 'Import fehlgeschlagen', en: 'Import failed', es: 'Importación fallida' }));
        const a = data.applied;
        toast.success(
          tx({ de: `Übernommen: ${a?.reordered ?? 0} umsortiert, ${a?.trimmed ?? 0} getrimmt`, en: `Applied: ${a?.reordered ?? 0} reordered, ${a?.trimmed ?? 0} trimmed`, es: `Aplicado: ${a?.reordered ?? 0} reordenado, ${a?.trimmed ?? 0} recortado` }),
          { id: toastId },
        );
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : tx({ de: 'Import fehlgeschlagen', en: 'Import failed', es: 'Importación fallida' });
        toast.error(msg, { id: toastId });
        return null;
      }
    },
    [projectId],
  );

  return {
    exporting,
    history,
    loadingHistory,
    exportFCPXML: (opts?: { fps?: number }) => runExport('fcpxml', opts),
    exportEDL: (opts?: { fps?: number }) => runExport('edl', opts),
    exportBundle: (opts?: { fps?: number }) => runExport('bundle', opts),
    reDownload,
    refreshHistory: loadHistory,
    previewImport,
    applyImport,
  };
}
