/**
 * AnchorPreviewGate — v263 Anchor-Preview-Gate
 *
 * A self-contained "compose anchor first, ask the user to confirm, THEN spend
 * on Hailuo + Sync.so" flow. Solves the class of Nano-Banana identity-drift
 * bugs (character cloned, character missing) that only surface AFTER the
 * expensive video render — by putting a preview step in front of the full
 * pipeline, we let the user re-roll cheaply and stop refunding the entire
 * Hailuo+Sync stack for a broken anchor.
 *
 * Flow:
 *  1. Open the gate → invokes `compose-video-clips` with `previewOnly: true`.
 *     Server composes + audits the anchor and persists it to
 *     `composer_scenes.preview_anchor_url` + `preview_audit`, then STOPS.
 *  2. Component polls `composer_scenes` for that URL and renders it with the
 *     audit summary (identity ok / clone / missing).
 *  3. User picks one of:
 *      - "Bestätigen & rendern" → set `anchor_confirmed_at`, re-invoke
 *        `compose-video-clips` WITHOUT `previewOnly` (pinned anchor is reused
 *        via the existing prevAuditOk cache path).
 *      - "Neuen Preview erstellen" → clear anchor + re-invoke `previewOnly`.
 *
 * Wiring: opt-in. Import + render alongside an existing render button. Does
 * NOT hijack existing invocation paths.
 */

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

interface PreviewAudit {
  reason?: string;
  missing?: string[];
  duplicated?: string[];
  mismatched?: string[];
  face_count?: number | null;
  human_count?: number | null;
  expected_faces?: number | null;
  soft_pass?: boolean;
}

interface AnchorPreviewGateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sceneId: string;
  /** Payload forwarded to `compose-video-clips` (both preview + confirm). */
  composeBody: Record<string, unknown>;
  /** Called once the user confirms and the real render is dispatched. */
  onConfirmed?: () => void;
}

type Phase = "composing" | "ready" | "confirming" | "error";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 90_000;

export function AnchorPreviewGate({
  open,
  onOpenChange,
  sceneId,
  composeBody,
  onConfirmed,
}: AnchorPreviewGateProps) {
  const [phase, setPhase] = useState<Phase>("composing");
  const [anchorUrl, setAnchorUrl] = useState<string | null>(null);
  const [audit, setAudit] = useState<PreviewAudit | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const invokePreview = useCallback(async () => {
    setPhase("composing");
    setAnchorUrl(null);
    setAudit(null);
    setErrMsg(null);

    // Clear any stale preview state so the poll picks up the fresh one.
    await supabase
      .from("composer_scenes")
      .update({
        preview_anchor_url: null,
        preview_audit: null,
        anchor_confirmed_at: null,
        clip_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);

    const { error } = await supabase.functions.invoke("compose-video-clips", {
      body: { ...composeBody, previewOnly: true },
    });
    if (error) {
      setPhase("error");
      setErrMsg(error.message || "Preview konnte nicht gestartet werden.");
      return;
    }

    // Poll until preview_anchor_url is set or the scene fails.
    const started = Date.now();
    while (Date.now() - started < POLL_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const { data } = await supabase
        .from("composer_scenes")
        .select(
          "preview_anchor_url, preview_audit, clip_status, clip_error",
        )
        .eq("id", sceneId)
        .maybeSingle();
      const row = data as any;
      if (!row) continue;
      if (row.clip_status === "failed") {
        setPhase("error");
        setErrMsg(row.clip_error || "Anchor konnte nicht komponiert werden.");
        return;
      }
      if (row.preview_anchor_url) {
        setAnchorUrl(row.preview_anchor_url);
        setAudit(row.preview_audit ?? null);
        setPhase("ready");
        return;
      }
    }
    setPhase("error");
    setErrMsg("Zeitüberschreitung beim Erstellen der Vorschau.");
  }, [sceneId, composeBody]);

  useEffect(() => {
    if (open) invokePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleConfirm = async () => {
    setPhase("confirming");
    try {
      await supabase
        .from("composer_scenes")
        .update({
          anchor_confirmed_at: new Date().toISOString(),
          clip_status: "generating",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      const { error } = await supabase.functions.invoke("compose-video-clips", {
        body: composeBody, // no previewOnly → full render, pinned anchor reused
      });
      if (error) throw error;
      toast.success("Render gestartet — Vorschau bestätigt.");
      onConfirmed?.();
      onOpenChange(false);
    } catch (e: any) {
      setPhase("error");
      setErrMsg(e?.message || "Render konnte nicht gestartet werden.");
    }
  };

  const auditReason = audit?.reason ?? "ok";
  const auditOk = auditReason === "ok";
  const missing = audit?.missing ?? [];
  const duplicated = audit?.duplicated ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Anchor-Vorschau bestätigen</DialogTitle>
          <DialogDescription>
            Sieh dir das komponierte Anchor-Bild an, bevor Video + Lip-Sync
            gerendert werden. So sparst du dir teure Re-Rolls, wenn Identitäten
            vom Bildmodell verwechselt wurden.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[280px] flex flex-col items-center justify-center gap-3">
          {phase === "composing" && (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              <div className="text-sm text-muted-foreground">
                Anchor wird komponiert & Identitäten geprüft…
              </div>
            </>
          )}

          {phase === "error" && (
            <>
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <div className="text-sm text-red-300 text-center max-w-md">
                {errMsg}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={invokePreview}
                className="mt-2"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Erneut versuchen
              </Button>
            </>
          )}

          {phase === "ready" && anchorUrl && (
            <>
              <img
                src={anchorUrl}
                alt="Anchor preview"
                className="rounded-md border border-white/10 max-h-[360px] object-contain"
              />
              <div
                className={`text-xs rounded px-2 py-1 flex items-center gap-2 ${
                  auditOk
                    ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                }`}
              >
                {auditOk ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                {auditOk
                  ? `Identität ok — ${audit?.face_count ?? "?"}/${audit?.expected_faces ?? "?"} Gesichter erkannt.`
                  : `Prüfung: ${auditReason}${missing.length ? ` · fehlend: ${missing.join(", ")}` : ""}${duplicated.length ? ` · doppelt: ${duplicated.join(", ")}` : ""}`}
              </div>
              {!auditOk && (
                <div className="text-[11px] text-muted-foreground text-center max-w-md">
                  Wenn du trotzdem bestätigst, wird der Render normal
                  abgerechnet — ein automatischer Refund für Identitäts­drift
                  entfällt dann.
                </div>
              )}
            </>
          )}

          {phase === "confirming" && (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <div className="text-sm text-muted-foreground">
                Render wird gestartet…
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex sm:justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={phase === "confirming"}
          >
            Abbrechen
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={invokePreview}
              disabled={phase === "composing" || phase === "confirming"}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Neuer Preview
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={phase !== "ready" || !anchorUrl}
            >
              Bestätigen & rendern
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AnchorPreviewGate;
