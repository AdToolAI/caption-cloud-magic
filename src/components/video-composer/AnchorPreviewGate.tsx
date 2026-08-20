import { tx } from "@/lib/i18nText";
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

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  prepareSceneRuns,
  startSceneGeneration,
} from "@/lib/composer/startSceneGeneration";

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
import { sceneState } from "@/lib/composer/sceneState";

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
  /** True once this gate owns an active server-side run for the scene. */
  const runReadyRef = useRef(false);


  const invokePreview = useCallback(async () => {
    setPhase("composing");
    setAnchorUrl(null);
    setAudit(null);
    setErrMsg(null);
    runReadyRef.current = false;

    // v377 — den Run HIER übernehmen, nicht erst beim Bestätigen.
    // Dieses Gate war der Pfad, der bisher komplett am harten Neustart
    // vorbeilief. Der Teardown muss vor der Anchor-Vorschau laufen, weil er
    // sonst genau den Anchor löschen würde, den der Nutzer gerade bestätigt.
    try {
      await prepareSceneRuns({ sceneIds: [sceneId], reason: "anchor_preview" });
      runReadyRef.current = true;
    } catch (e: any) {
      setPhase("error");
      setErrMsg(
        e?.message || tx({ de: tx({ de: "Der vorherige Lauf dieser Szene konnte nicht beendet werden.", en: "The previous run of this scene could not be finished.", es: "No se pudo finalizar la ejecución anterior de esta escena." }), en: "The previous run of this scene could not be completed.", es: "La ejecución anterior de esta escena no pudo completarse." }),
      );
      return;
    }

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

    try {
      await startSceneGeneration({
        sceneIds: [sceneId],
        compose: { ...composeBody, previewOnly: true },
        reason: "anchor_preview",
        useExistingRun: true,
      });
    } catch (error: any) {
      setPhase("error");
      setErrMsg(error.message || tx({ de: "Preview konnte nicht gestartet werden.", en: "Preview could not be started.", es: "No se pudo iniciar la vista previa." }));
      return;
    }

    // Poll until preview_anchor_url is set or the scene fails.
    const started = Date.now();
    while (Date.now() - started < POLL_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const { data } = await supabase
        .from("composer_scenes")
        .select(
          "preview_anchor_url, preview_audit, clip_status, pipeline_state, lip_sync_status, twoshot_stage, clip_error",
        )
        .eq("id", sceneId)
        .maybeSingle();
      const row = data as any;
      if (!row) continue;
      if (sceneState(row) === "failed") {
        setPhase("error");
        setErrMsg(row.clip_error || tx({ de: "Anchor konnte nicht komponiert werden.", en: "Anchor could not be composed.", es: "No se pudo componer el ancla." }));
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
    setErrMsg(tx({ de: "Zeitüberschreitung beim Erstellen der Vorschau.", en: "Preview creation timed out.", es: "Tiempo de espera agotado al crear la vista previa." }));
  }, [sceneId, composeBody]);

  useEffect(() => {
    if (open) invokePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleConfirm = async () => {
    if (!runReadyRef.current) {
      // Ohne übernommenen Run darf hier nichts starten — genau dieser Pfad
      // hat früher am harten Neustart vorbei gerendert.
      setPhase("error");
      setErrMsg(tx({ de: "Kein aktiver Lauf für diese Szene. Bitte Vorschau neu erstellen.", en: "No active run for this scene. Please regenerate preview.", es: "No hay ninguna ejecución activa para esta escena. Por favor, regenera la vista previa." }));
      return;
    }
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
      // v377 — Dispatch gegen den beim Vorschau-Start übernommenen Run.
      // Kein zweiter Teardown: der würde den gerade bestätigten Anchor löschen.
      await startSceneGeneration({
        sceneIds: [sceneId],
        compose: composeBody, // no previewOnly → full render, pinned anchor reused
        reason: "anchor_confirm",
        useExistingRun: true,
      });

      toast.success(tx({ de: "Render gestartet — Vorschau bestätigt.", en: "Render started — preview confirmed.", es: "Renderizado iniciado — vista previa confirmada." }));
      onConfirmed?.();
      onOpenChange(false);
    } catch (e: any) {
      setPhase("error");
      setErrMsg(e?.message || tx({ de: tx({ de: "Render konnte nicht gestartet werden.", en: "Render could not be started.", es: "No se pudo iniciar el renderizado." }), en: "Render could not be started.", es: "No se pudo iniciar el renderizado." }));
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
          <DialogTitle>{tx({ de: "Anchor-Vorschau bestätigen", en: "Confirm anchor preview", es: "Confirmar vista previa del ancla" })}</DialogTitle>
          <DialogDescription>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[280px] flex flex-col items-center justify-center gap-3">
          {phase === "composing" && (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              <div className="text-sm text-muted-foreground">
                {tx({ de: "Anchor wird komponiert & Identitäten geprüft…", en: "Anchor is being composed & identities checked…", es: "Anclaje componiéndose e identidades verificándose…" })}
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
                {tx({ de: "Erneut versuchen", en: "Try again", es: "Inténtalo de nuevo" })}
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
                  ? tx({ de: `Identität ok — ${audit?.face_count ?? "?"}/${audit?.expected_faces ?? "?"} Gesichter erkannt.`, en: `Identity ok — ${audit?.face_count ?? "?"}/${audit?.expected_faces ?? "?"} Faces detected.`, es: `Identidad correcta: ${audit?.face_count?? "?"}/${audit?.expected_faces ?? "?"} Rostros detectados.` })
                  : tx({
                      de: `Prüfung: ${auditReason}${missing.length ? ` · fehlend: ${missing.join(", ")}` : ""}${duplicated.length ? ` · doppelt: ${duplicated.join(", ")}` : ""}`,
                      en: `Check: ${auditReason}${missing.length ? ` · missing: ${missing.join(", ")}` : ""}${duplicated.length ? ` · duplicated: ${duplicated.join(", ")}` : ""}`,
                      es: `Comprobación: ${auditReason}${missing.length ? ` · faltan: ${missing.join(", ")}` : ""}${duplicated.length ? ` · duplicados: ${duplicated.join(", ")}` : ""}`,
                    })}
              </div>
              {!auditOk && (
                <div className="text-[11px] text-muted-foreground text-center max-w-md">
                </div>
              )}
            </>
          )}

          {phase === "confirming" && (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <div className="text-sm text-muted-foreground">
                {tx({ de: "Render wird gestartet…", en: "Render is starting…", es: "El render está comenzando…" })}
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
            {tx({ de: "Abbrechen", en: "Cancel", es: "Cancelar" })}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={invokePreview}
              disabled={phase === "composing" || phase === "confirming"}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              {tx({ de: 'Neuer Preview', en: 'New preview', es: 'Nueva vista previa' })}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={phase !== "ready" || !anchorUrl}
            >
              {tx({ de: "Bestätigen & rendern", en: "Confirm & Render", es: "Confirmar y Renderizar" })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AnchorPreviewGate;
