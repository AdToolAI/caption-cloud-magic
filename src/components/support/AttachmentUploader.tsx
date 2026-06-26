import { useCallback, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, X, Paperclip, Image as ImageIcon, FileText, Film, Video, Square, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useScreenRecorder } from "@/hooks/useScreenRecorder";
import { useTranslation } from "@/hooks/useTranslation";


export interface UploadedAttachment {
  path: string;
  name: string;
  size: number;
  type: string;
  preview_url?: string;
}

interface AttachmentUploaderProps {
  userId: string;
  draftId: string;
  attachments: UploadedAttachment[];
  onChange: (atts: UploadedAttachment[]) => void;
  maxFiles?: number;
  maxBytes?: number;
  variant?: "compact" | "full";
}

const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_TYPES = [
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "video/mp4", "video/quicktime", "video/webm",
  "application/pdf", "text/plain",
];

const STRINGS = {
  en: {
    badge: "Tickets with media are resolved",
    badgeBold: "60% faster",
    recordScreen: "Record screen",
    stop: "Stop",
    dropTitle: "Drop files here",
    dropHint: "paste with ⌘V or click to browse",
    dropMeta: (max: number, mb: number) => `Images, videos (MP4/MOV/WebM), PDF · max ${max} files · up to ${mb} MB each`,
    choose: "Choose files",
    max: "Maximum reached",
    maxDesc: (n: number) => `You can upload up to ${n} files per ticket.`,
    tooLarge: "File too large",
    tooLargeDesc: (name: string, mb: number) => `${name} exceeds ${mb} MB.`,
    unsupported: "Unsupported file type",
    failed: "Upload failed",
    recAdded: "Recording added",
    quickTitle: "Quick evidence",
    quickHint: "Drop a screenshot, paste with ⌘V, record a clip — or skip and add later.",
  },
  de: {
    badge: "Tickets mit Medien werden",
    badgeBold: "60% schneller gelöst",
    recordScreen: "Bildschirm aufnehmen",
    stop: "Stopp",
    dropTitle: "Dateien hier ablegen",
    dropHint: "mit ⌘V einfügen oder klicken zum Durchsuchen",
    dropMeta: (max: number, mb: number) => `Bilder, Videos (MP4/MOV/WebM), PDF · max ${max} Dateien · bis ${mb} MB`,
    choose: "Dateien wählen",
    max: "Maximum erreicht",
    maxDesc: (n: number) => `Du kannst maximal ${n} Dateien pro Ticket hochladen.`,
    tooLarge: "Datei zu groß",
    tooLargeDesc: (name: string, mb: number) => `${name} überschreitet ${mb} MB.`,
    unsupported: "Dateityp nicht unterstützt",
    failed: "Upload fehlgeschlagen",
    recAdded: "Aufnahme angehängt",
    quickTitle: "Schnell-Beweis",
    quickHint: "Screenshot ablegen, mit ⌘V einfügen, Clip aufnehmen — oder später hinzufügen.",
  },
  es: {
    badge: "Los tickets con medios se resuelven",
    badgeBold: "60% más rápido",
    recordScreen: "Grabar pantalla",
    stop: "Detener",
    dropTitle: "Suelta archivos aquí",
    dropHint: "pega con ⌘V o haz clic para explorar",
    dropMeta: (max: number, mb: number) => `Imágenes, vídeos (MP4/MOV/WebM), PDF · máx ${max} · hasta ${mb} MB`,
    choose: "Elegir archivos",
    max: "Máximo alcanzado",
    maxDesc: (n: number) => `Puedes subir hasta ${n} archivos por ticket.`,
    tooLarge: "Archivo demasiado grande",
    tooLargeDesc: (name: string, mb: number) => `${name} supera ${mb} MB.`,
    unsupported: "Tipo de archivo no permitido",
    failed: "Subida fallida",
    recAdded: "Grabación añadida",
    quickTitle: "Prueba rápida",
    quickHint: "Suelta una captura, pega con ⌘V, graba un clip — o añade más tarde.",
  },
} as const;

function iconFor(type: string) {
  if (type.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (type.startsWith("video/")) return <Film className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

export interface AttachmentUploaderHandle {
  addFiles: (files: File[]) => Promise<void>;
}

export const AttachmentUploader = forwardRef<AttachmentUploaderHandle, AttachmentUploaderProps>(function AttachmentUploader({
  userId,
  draftId,
  attachments,
  onChange,
  maxFiles = DEFAULT_MAX_FILES,
  maxBytes = DEFAULT_MAX_BYTES,
  variant = "full",
}, ref) {
  const { language } = useTranslation();
  const t = STRINGS[(language as keyof typeof STRINGS)] || STRINGS.en;
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;

    const remaining = maxFiles - attachments.length;
    if (remaining <= 0) {
      toast({ title: t.max, description: t.maxDesc(maxFiles), variant: "destructive" });
      return;
    }

    const toUpload = arr.slice(0, remaining);
    setUploading(true);
    const next: UploadedAttachment[] = [...attachments];

    for (const file of toUpload) {
      if (file.size > maxBytes) {
        toast({ title: t.tooLarge, description: t.tooLargeDesc(file.name, Math.round(maxBytes / 1024 / 1024)), variant: "destructive" });
        continue;
      }
      if (file.type && !ALLOWED_TYPES.includes(file.type)) {
        toast({ title: t.unsupported, description: `${file.name} (${file.type || "unknown"})`, variant: "destructive" });
        continue;
      }

      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
      const path = `${userId}/${draftId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from("support-attachments")
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });

      if (error) {
        toast({ title: t.failed, description: error.message, variant: "destructive" });
        continue;
      }

      let previewUrl: string | undefined;
      if (file.type.startsWith("image/")) {
        const { data } = await supabase.storage
          .from("support-attachments")
          .createSignedUrl(path, 60 * 60);
        previewUrl = data?.signedUrl;
      }

      next.push({ path, name: file.name, size: file.size, type: file.type, preview_url: previewUrl });
    }

    onChange(next);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }, [attachments, draftId, maxBytes, maxFiles, onChange, userId, t]);

  useImperativeHandle(ref, () => ({
    addFiles: (files: File[]) => handleFiles(files),
  }), [handleFiles]);

  const recorder = useScreenRecorder({
    maxSeconds: 60,
    onComplete: (file) => {
      handleFiles([file]);
      toast({ title: t.recAdded, description: `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)` });
    },
  });

  const removeAt = useCallback(async (idx: number) => {
    const att = attachments[idx];
    if (!att) return;
    try {
      await supabase.storage.from("support-attachments").remove([att.path]);
    } catch { /* ignore */ }
    onChange(attachments.filter((_, i) => i !== idx));
  }, [attachments, onChange]);

  // ─── COMPACT VARIANT ──────────────────────────────────────────────────
  if (variant === "compact") {
    return (
      <div className="space-y-3">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
          }}
          className={`relative rounded-xl border border-dashed transition-all overflow-hidden ${
            dragOver
              ? "border-primary bg-primary/10 shadow-[0_0_24px_hsl(var(--primary)/0.3)]"
              : "border-primary/40 bg-gradient-to-br from-primary/[0.06] via-transparent to-cyan-500/[0.04] hover:border-primary/60 hover:bg-primary/[0.08]"
          }`}
        >
          <div className="absolute -top-6 -right-6 h-20 w-20 rounded-full bg-primary/20 blur-2xl pointer-events-none" />
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept={ALLOWED_TYPES.join(",")}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <div className="relative flex items-center gap-3 p-3 sm:p-4">
            <div className="rounded-lg bg-primary/15 border border-primary/30 p-2.5 shrink-0">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Upload className="h-5 w-5 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate">{t.quickTitle}</p>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wider font-mono text-primary">
                  <Zap className="h-2.5 w-2.5" /> {t.badgeBold}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{t.quickHint}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading || attachments.length >= maxFiles}
                onClick={() => inputRef.current?.click()}
                className="border-white/15 bg-white/[0.03] hover:bg-white/[0.06] gap-1.5"
              >
                <Paperclip className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t.choose}</span>
              </Button>
              {recorder.supported && (
                recorder.recording ? (
                  <Button type="button" variant="destructive" size="sm" onClick={recorder.stop} className="gap-1.5 animate-pulse">
                    <Square className="h-3.5 w-3.5 fill-current" />
                    {recorder.elapsed}s
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={recorder.start}
                    disabled={uploading || attachments.length >= maxFiles}
                    className="border-primary/40 text-primary hover:bg-primary/10 gap-1.5"
                  >
                    <Video className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t.recordScreen}</span>
                  </Button>
                )
              )}
            </div>
          </div>
        </div>

        {recorder.error && <p className="text-xs text-red-400">{recorder.error}</p>}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((att, idx) => (
              <div key={att.path} className="relative group rounded-lg border border-white/10 bg-white/[0.04] overflow-hidden w-20 h-20">
                {att.preview_url && att.type.startsWith("image/") ? (
                  <img src={att.preview_url} alt={att.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-black/40 text-primary">
                    {iconFor(att.type)}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                  aria-label={`Remove ${att.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── FULL VARIANT ─────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-foreground/85">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span>{t.badge} <strong className="text-primary">{t.badgeBold}</strong>.</span>
        </div>
        {recorder.supported && (
          recorder.recording ? (
            <Button type="button" variant="destructive" size="sm" onClick={recorder.stop} className="gap-1.5 animate-pulse">
              <Square className="h-3.5 w-3.5 fill-current" />
              {t.stop} · {recorder.elapsed}s / {recorder.maxSeconds}s
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={recorder.start}
              disabled={uploading || attachments.length >= maxFiles}
              className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
            >
              <Video className="h-3.5 w-3.5" />
              {t.recordScreen}
            </Button>
          )
        )}
      </div>

      {recorder.error && <p className="text-xs text-red-400">{recorder.error}</p>}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
        className={`relative rounded-xl border-2 border-dashed transition-all overflow-hidden ${
          dragOver
            ? "border-primary bg-primary/10 shadow-[0_0_32px_hsl(var(--primary)/0.35)]"
            : "border-primary/30 bg-gradient-to-br from-primary/[0.04] via-transparent to-cyan-500/[0.03] hover:border-primary/50 hover:bg-primary/[0.06]"
        } p-6 text-center`}
      >
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={ALLOWED_TYPES.join(",")}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <div className="relative flex flex-col items-center gap-2">
          <div className="rounded-xl bg-primary/15 border border-primary/30 p-3 mb-1">
            {uploading
              ? <Loader2 className="h-7 w-7 animate-spin text-primary" />
              : <Upload className="h-7 w-7 text-primary" />}
          </div>
          <p className="text-sm text-foreground/85">
            <span className="font-medium text-foreground">{t.dropTitle}</span> — {t.dropHint}
          </p>
          <p className="text-xs text-muted-foreground">
            {t.dropMeta(maxFiles, Math.round(maxBytes / 1024 / 1024))}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading || attachments.length >= maxFiles}
            onClick={() => inputRef.current?.click()}
            className="mt-2 border-primary/40 text-primary hover:bg-primary/10"
          >
            <Paperclip className="h-4 w-4 mr-2" />
            {t.choose}
          </Button>
        </div>
      </div>

      {attachments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {attachments.map((att, idx) => (
            <div
              key={att.path}
              className="relative group rounded-lg border border-white/10 bg-white/[0.04] overflow-hidden"
            >
              {att.preview_url && att.type.startsWith("image/") ? (
                <img src={att.preview_url} alt={att.name} className="w-full h-24 object-cover" />
              ) : att.type.startsWith("video/") ? (
                <div className="w-full h-24 flex items-center justify-center bg-black/60 text-primary">
                  <Film className="h-6 w-6" />
                </div>
              ) : (
                <div className="w-full h-24 flex items-center justify-center bg-black/30 text-primary">
                  {iconFor(att.type)}
                </div>
              )}
              <div className="p-2">
                <p className="text-xs truncate text-foreground/80">{att.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {(att.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                aria-label={`Remove ${att.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
