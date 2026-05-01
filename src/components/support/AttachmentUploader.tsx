import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, X, Paperclip, Image as ImageIcon, FileText, Film } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
}

const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_TYPES = [
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "video/mp4", "video/quicktime", "video/webm",
  "application/pdf", "text/plain",
];

function iconFor(type: string) {
  if (type.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (type.startsWith("video/")) return <Film className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

export function AttachmentUploader({
  userId,
  draftId,
  attachments,
  onChange,
  maxFiles = DEFAULT_MAX_FILES,
  maxBytes = DEFAULT_MAX_BYTES,
}: AttachmentUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;

    const remaining = maxFiles - attachments.length;
    if (remaining <= 0) {
      toast({
        title: "Maximum reached",
        description: `You can upload up to ${maxFiles} files per ticket.`,
        variant: "destructive",
      });
      return;
    }

    const toUpload = arr.slice(0, remaining);
    setUploading(true);
    const next: UploadedAttachment[] = [...attachments];

    for (const file of toUpload) {
      if (file.size > maxBytes) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`,
          variant: "destructive",
        });
        continue;
      }
      if (file.type && !ALLOWED_TYPES.includes(file.type)) {
        toast({
          title: "Unsupported file type",
          description: `${file.name} (${file.type || "unknown"}) is not allowed.`,
          variant: "destructive",
        });
        continue;
      }

      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
      const path = `${userId}/${draftId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from("support-attachments")
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });

      if (error) {
        toast({ title: "Upload failed", description: error.message, variant: "destructive" });
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
  }, [attachments, draftId, maxBytes, maxFiles, onChange, userId]);

  const removeAt = useCallback(async (idx: number) => {
    const att = attachments[idx];
    if (!att) return;
    try {
      await supabase.storage.from("support-attachments").remove([att.path]);
    } catch {
      /* ignore — UI removal is what matters most */
    }
    onChange(attachments.filter((_, i) => i !== idx));
  }, [attachments, onChange]);

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
        className={`relative rounded-xl border-2 border-dashed transition-all ${
          dragOver
            ? "border-primary bg-primary/10"
            : "border-white/15 bg-white/[0.02] hover:bg-white/[0.04]"
        } p-6 text-center`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={ALLOWED_TYPES.join(",")}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-2">
          {uploading
            ? <Loader2 className="h-8 w-8 animate-spin text-primary" />
            : <Upload className="h-8 w-8 text-primary" />}
          <p className="text-sm text-foreground/80">
            <span className="font-medium">Drop files here</span> or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            Images, videos (MP4/MOV), PDF · max {maxFiles} files · up to {(maxBytes / 1024 / 1024).toFixed(0)} MB each
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading || attachments.length >= maxFiles}
            onClick={() => inputRef.current?.click()}
            className="mt-2"
          >
            <Paperclip className="h-4 w-4 mr-2" />
            Choose files
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
                <img
                  src={att.preview_url}
                  alt={att.name}
                  className="w-full h-24 object-cover"
                />
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
}
