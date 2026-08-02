/**
 * FaceMapReviewDialog (v274)
 *
 * When AWS Rekognition cannot resolve every speaker on the anchor plate to
 * a distinct face (similarity < 55 or fewer matches than speakers), the
 * scene is parked in `clip_status = 'awaiting_manual_face_map'`. This
 * dialog lets the user finish the mapping by hand BEFORE the provider
 * clip spends credits on the wrong routing.
 *
 * Data source
 * -----------
 *   scene.audioPlan.twoshot.anchor_identity = {
 *     dims: { width, height },
 *     faces: [{ slot, bbox: [x1,y1,x2,y2], characterId | null, similarity }],
 *     assignmentLock: { [speakerIdx]: characterId },
 *     anchor_url: string,
 *   }
 *
 * Save flow
 * ---------
 *   1) Persist the corrected `assignmentLock` back to both:
 *      - `audio_plan.twoshot.anchor_identity.assignmentLock`
 *      - `dialog_shots.plate_identity.assignmentLock`
 *   2) Clear `clip_error`, flip `clip_status` back to `pending`.
 *   3) Re-invoke `compose-video-clips` for this scene.
 */

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { ComposerScene } from "@/types/video-composer";
import { prepareSceneRuns, startSceneGeneration } from "@/lib/composer/startSceneGeneration";

interface FaceMapReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scene: ComposerScene;
}

interface AnchorFace {
  slot: number;
  bbox: [number, number, number, number];
  characterId: string | null;
  similarity: number | null;
}

interface AnchorIdentity {
  dims?: { width?: number; height?: number };
  faces?: AnchorFace[];
  assignmentLock?: Record<string, string>;
  anchor_url?: string;
}

export function FaceMapReviewDialog({ open, onOpenChange, scene }: FaceMapReviewDialogProps) {
  const anchorIdentity: AnchorIdentity =
    ((scene as any)?.audioPlan?.twoshot?.anchor_identity ??
      (scene as any)?.audio_plan?.twoshot?.anchor_identity ??
      {}) as AnchorIdentity;

  const anchorUrl: string =
    anchorIdentity.anchor_url ||
    (scene.referenceImageUrl as string) ||
    "";

  const faces: AnchorFace[] = Array.isArray(anchorIdentity.faces) ? anchorIdentity.faces : [];
  const dims = {
    width: Number(anchorIdentity.dims?.width) || 1024,
    height: Number(anchorIdentity.dims?.height) || 1024,
  };

  // Speakers = characterShots order (the same order compose-dialog-segments
  // uses as speakerIdx). Show the character name + portrait for context.
  const speakers = useMemo(() => {
    const shots = (scene.characterShots ?? []).filter((s) => s?.characterId);
    return shots.map((s, i) => ({
      idx: i,
      characterId: s.characterId as string,
      name: (s as any)?.characterName || (s as any)?.name || `Sprecher ${i + 1}`,
      portraitUrl: (s as any)?.referenceImageUrl || (s as any)?.portraitUrl || null,
    }));
  }, [scene.characterShots]);

  const initialMap = useMemo<Record<number, number | null>>(() => {
    // Prefer already-assigned faces (from Rekognition partial match).
    const out: Record<number, number | null> = {};
    for (const sp of speakers) {
      const preAssigned = faces.find((f) => f.characterId === sp.characterId);
      out[sp.idx] = preAssigned ? preAssigned.slot : null;
    }
    return out;
  }, [speakers, faces]);

  const [assignments, setAssignments] = useState<Record<number, number | null>>(initialMap);
  const [saving, setSaving] = useState(false);

  const setSlot = (speakerIdx: number, slot: number | null) => {
    setAssignments((prev) => {
      const next = { ...prev, [speakerIdx]: slot };
      // Enforce 1:1 — if another speaker held this slot, clear them.
      if (slot !== null) {
        for (const k of Object.keys(next)) {
          const kk = Number(k);
          if (kk !== speakerIdx && next[kk] === slot) next[kk] = null;
        }
      }
      return next;
    });
  };

  const unresolvedCount = speakers.filter((s) => assignments[s.idx] === null || assignments[s.idx] === undefined).length;

  const handleSave = async () => {
    if (saving) return;
    if (unresolvedCount > 0) {
      toast({
        title: "Zuordnung unvollständig",
        description: `${unresolvedCount} Sprecher haben noch keinen Face-Slot.`,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      // The run reset must happen before persisting the approved face map;
      // otherwise dispatch would purge the user's correction again.
      await prepareSceneRuns({
        sceneIds: [scene.id],
        reason: "manual_face_map_regenerate",
      });
      // Build the new assignmentLock.
      const nextLock: Record<string, string> = {};
      const facesById = new Map<number, AnchorFace>(faces.map((f) => [f.slot, f]));
      const nextFaces = faces.map((f) => ({ ...f, characterId: null as string | null, similarity: null as number | null }));
      for (const sp of speakers) {
        const slot = assignments[sp.idx];
        if (slot === null || slot === undefined) continue;
        nextLock[String(sp.idx)] = sp.characterId;
        const idx = nextFaces.findIndex((f) => f.slot === slot);
        if (idx >= 0) {
          nextFaces[idx].characterId = sp.characterId;
          nextFaces[idx].similarity = 100; // manual assignment
        }
        void facesById;
      }

      // Load fresh row to avoid stomping unrelated fields.
      const { data: sceneRow, error: readErr } = await supabase
        .from("composer_scenes")
        .select("audio_plan, dialog_shots")
        .eq("id", scene.id)
        .single();
      if (readErr) throw readErr;

      const baseAudioPlan = (sceneRow?.audio_plan ?? {}) as Record<string, any>;
      const baseTwoshot = (baseAudioPlan.twoshot ?? {}) as Record<string, any>;
      const baseAnchorIdentity = (baseTwoshot.anchor_identity ?? {}) as Record<string, any>;
      const existingDs = (sceneRow?.dialog_shots ?? null) as Record<string, any> | null;

      const patch: Record<string, any> = {
        audio_plan: {
          ...baseAudioPlan,
          twoshot: {
            ...baseTwoshot,
            anchor_identity: {
              ...baseAnchorIdentity,
              faces: nextFaces,
              assignmentLock: nextLock,
              resolvedCount: Object.keys(nextLock).length,
              expectedCount: speakers.length,
              minSimilarity: 100,
              method: "manual-face-map-v274",
              manual_review_at: new Date().toISOString(),
            },
          },
        },
        updated_at: new Date().toISOString(),
      };
      if (existingDs && typeof existingDs === "object") {
        patch.dialog_shots = {
          ...existingDs,
          plate_identity: {
            ...(existingDs.plate_identity ?? {}),
            method: "manual-face-map-v274",
            faces: nextFaces,
            assignmentLock: nextLock,
            resolvedCount: Object.keys(nextLock).length,
          },
        };
      }

      const { error: updErr } = await supabase
        .from("composer_scenes")
        .update(patch)
        .eq("id", scene.id);
      if (updErr) throw updErr;

      // Re-dispatch the scene now that the mapping is user-approved.
      await startSceneGeneration({
        sceneIds: [scene.id],
        reason: "manual_face_map_regenerate",
        useExistingRun: true,
        compose: {
          projectId: scene.projectId,
          scenes: [
            {
              id: scene.id,
              projectId: scene.projectId,
              sceneType: scene.sceneType,
              clipSource: scene.clipSource,
              clipQuality: scene.clipQuality || "standard",
              aiPrompt: scene.aiPrompt || "",
              referenceImageUrl: scene.referenceImageUrl,
              durationSeconds: scene.durationSeconds,
              characterShot: scene.characterShot,
              characterShots: scene.characterShots,
              dialogScript: scene.dialogScript,
              dialogVoices: scene.dialogVoices,
              engineOverride: scene.engineOverride ?? "cinematic-sync",
              lipSyncWithVoiceover: true,
              dialogMode: scene.dialogMode === true,
              withAudio: scene.withAudio !== false,
            },
          ],
        },
      });

      toast({
        title: "Face-Map gespeichert",
        description: "Der Clip wird jetzt mit der korrigierten Sprecher-Zuordnung neu gerendert.",
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Speichern fehlgeschlagen",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Render overlay boxes over the anchor image, scaled by container width.
  const containerW = 640;
  const scale = dims.width > 0 ? containerW / dims.width : 1;
  const containerH = dims.height * scale;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Sprecher ↔ Gesicht zuordnen</DialogTitle>
          <DialogDescription>
            Auf dem Anker wurden {faces.length} Gesichter erkannt, aber die automatische
            Zuordnung konnte nicht alle {speakers.length} Sprecher eindeutig zuordnen.
            Bitte weise jedem Sprecher das passende Gesicht (Slot 1…{faces.length}) zu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {anchorUrl ? (
            <div
              className="relative mx-auto border rounded overflow-hidden bg-black"
              style={{ width: containerW, height: containerH }}
            >
              <img
                src={anchorUrl}
                alt="Anchor plate"
                className="absolute inset-0 w-full h-full object-cover"
              />
              {faces.map((f) => {
                const [x1, y1, x2, y2] = f.bbox;
                const assignedSp = speakers.find((sp) => assignments[sp.idx] === f.slot);
                return (
                  <div
                    key={f.slot}
                    className={`absolute border-2 ${assignedSp ? "border-emerald-400" : "border-amber-400"} bg-black/20`}
                    style={{
                      left: x1 * scale,
                      top: y1 * scale,
                      width: (x2 - x1) * scale,
                      height: (y2 - y1) * scale,
                    }}
                  >
                    <div className="absolute -top-5 left-0 text-[10px] font-semibold px-1 rounded bg-black/70 text-white">
                      Slot {f.slot + 1}{assignedSp ? ` — ${assignedSp.name}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">Anker-Bild nicht verfügbar.</div>
          )}

          <div className="space-y-2">
            {speakers.map((sp) => (
              <div key={sp.idx} className="flex items-center gap-3 border rounded p-2">
                {sp.portraitUrl ? (
                  <img src={sp.portraitUrl} alt={sp.name} className="w-10 h-10 rounded object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded bg-muted" />
                )}
                <div className="flex-1">
                  <div className="text-sm font-medium">Sprecher {sp.idx + 1}: {sp.name}</div>
                </div>
                <select
                  className="border rounded px-2 py-1 text-sm bg-background"
                  value={assignments[sp.idx] === null || assignments[sp.idx] === undefined ? "" : String(assignments[sp.idx])}
                  onChange={(e) => setSlot(sp.idx, e.target.value === "" ? null : Number(e.target.value))}
                >
                  <option value="">— Slot wählen —</option>
                  {faces.map((f) => (
                    <option key={f.slot} value={f.slot}>Slot {f.slot + 1}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving || unresolvedCount > 0}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Zuordnung speichern & rendern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FaceMapReviewDialog;
