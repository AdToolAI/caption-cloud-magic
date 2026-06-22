import { useEffect, useMemo, useRef, useState } from "react";
const isUuid = (v?: string | null) =>
  !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  GripVertical,
  Sparkles,
  Upload,
  Video,
  Image as ImageIcon,
  Wand2,
  Beaker,
  ArrowRight,
  ArrowLeft,
  Link2,
  Palette,
  Volume2,
  VolumeX,
  MessageSquareQuote,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import CompareLabGrid from "@/components/compare-lab/CompareLabGrid";
import type {
  ComposerScene,
  SceneType,
  ClipSource,
  ClipQuality,
  TransitionStyle,
  ComposerCharacter,
} from "@/types/video-composer";
import {
  SCENE_TYPE_LABELS,
  CLIP_SOURCE_LABELS,
  getClipCost,
  getClipRate,
  QUALITY_LABELS,
} from "@/types/video-composer";

import SceneMediaUpload from "./SceneMediaUpload";
import StockMediaBrowser, { type StockMediaItem } from "./StockMediaBrowser";
import SceneReferenceImageUpload from "./SceneReferenceImageUpload";
import { CharacterShotBadge } from "./CharacterShotBadge";
import { CharacterCastPicker } from "./CharacterCastPicker";
import { UnifiedAssetPicker } from "./UnifiedAssetPicker";
import { SceneDirectorBox } from "./SceneDirectorBox";
import { RealismPresetPicker } from "./RealismPresetPicker";
import { useBrandLocations } from "@/hooks/useBrandLocations";
import { useBrandBuildings } from "@/hooks/useBrandBuildings";
import { useBrandProps } from "@/hooks/useBrandProps";
import { useWorldCatalog } from "@/hooks/useWorldCatalog";
// Phase 2 (Studio Set v2) — DirectorPresetPicker, CinematicStylePresets and
// SceneShotDirectorPanel are no longer rendered inline; they live behind
// SceneStyleSheet (one dialog, three tabs). The chip + sheet replace ~50
// lines of always-visible JSX.
import SceneStyleSheet from "./SceneStyleSheet";
import SceneStyleChip from "./SceneStyleChip";
import SceneSecondaryToggle from "./SceneSecondaryToggle";
import { buildShotPromptSuffix } from "@/lib/shotDirector/buildShotPromptSuffix";
import PromptMentionEditor from "@/components/motion-studio/PromptMentionEditor";
import StructuredPromptBuilder from "@/components/motion-studio/StructuredPromptBuilder";
import StylePresetPicker from "@/components/motion-studio/StylePresetPicker";
import MultiEnginePromptPreview from "@/components/motion-studio/MultiEnginePromptPreview";
import { applyDirectorModifiers } from "@/lib/motion-studio/directorPresets";
import {
  resolveMentions,
  findMentions,
} from "@/lib/motion-studio/mentionParser";
import { composePromptLayers } from "@/lib/motion-studio/composePromptLayers";
import { markLipSyncPending, clearLipSyncPending, markDialogModePending, clearDialogModePending, markEngineOverridePending, clearEngineOverridePending } from "@/lib/video-composer/lipSyncPending";
import { sceneFeaturesCharacter } from "@/lib/motion-studio/sceneFeaturesCharacter";
import {
  useBrandCharacters,
  buildCharacterPromptInjection,
} from "@/hooks/useBrandCharacters";
import {
  stitchSlots,
  naiveSplitToSlots,
  hasAnySlot,
  type PromptSlots,
} from "@/lib/motion-studio/structuredPromptStitcher";
import { clipSourceToModelKey } from "@/lib/motion-studio/promptTokenLimits";
import { ModelSelector } from "@/components/ai-video/ModelSelector";
import {
  COMPOSER_AVAILABLE_MODELS,
  COMPOSER_DIALOG_MODELS,
  NATIVE_DIALOGUE_CLIP_SOURCES,
  DIALOG_FALLBACK_CLIP_SOURCE,
  DIALOG_FALLBACK_CLIP_QUALITY,
  modelIdToSource,
  sourceToModelId,
} from "@/lib/video-composer/modelMapping";
import { AI_VIDEO_TOOLKIT_MODELS } from "@/config/aiVideoModelRegistry";
import { useUnifiedMentionLibrary } from "@/hooks/useUnifiedMentionLibrary";
import { useStylePresets } from "@/hooks/useStylePresets";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { extractFunctionsError } from "@/lib/functionsError";
import SceneCommentBadge from "./SceneCommentBadge";
import SceneCommentSheet from "./SceneCommentSheet";
import { useSceneCommentCounts } from "@/hooks/useComposerCollaboration";
import { resolveSceneCharacterAnchor } from "@/lib/motion-studio/resolveSceneCharacterAnchor";
import { resolveSceneWorldRefs } from "@/lib/motion-studio/prepareSceneAnchor";
import { applyCastToPrompt } from "@/lib/motion-studio/applyCastToPrompt";
import { syncCastFromPrompt } from "@/lib/motion-studio/syncCastFromPrompt";
import { applyDialogToPrompt } from "@/lib/motion-studio/applyDialogToPrompt";
import { applyActionsToPrompt, type CastActionEntry } from "@/lib/motion-studio/applyActionsToPrompt";
import SceneActionField from "./SceneActionField";
import {
  removeCharactersFromPrompt,
  removeCharactersFromDialogScript,
} from "@/lib/motion-studio/removeCharacterFromPrompt";
import { parseDialogScript } from "@/lib/talking-head/parseDialogScript";
import SceneStillFrameStudio from "./SceneStillFrameStudio";
import SceneAnchorLibrary from "./SceneAnchorLibrary";
import { cn } from "@/lib/utils";
import SceneDialogStudio from "./SceneDialogStudio";
import DirectorQualityCoach from "./director-console/DirectorQualityCoach";
import ScenePromptDetailsSheet from "./ScenePromptDetailsSheet";
import SceneCardSummaryHeader from "./SceneCardSummaryHeader";
import SceneStudioTabBar, {
  SceneStudioSectionHeader,
} from "./SceneStudioTabBar";
import ScenePerformancePanel from "./ScenePerformancePanel";
import {
  derivePerformanceEntries,
  countDirectedPerformances,
} from "@/lib/motion-studio/buildPerformanceBlock";


import {
  recommendEngineForScene,
  estimateHeygenCostEur,
} from "@/lib/video-composer/sceneEngineRouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSceneRenderConfirm } from "@/lib/composer/sceneRenderConfirm";

interface SceneCardProps {
  scene: ComposerScene;
  index: number;
  totalScenes: number;
  projectId?: string;
  characters?: ComposerCharacter[];
  /** Aspect ratio from briefing — used to filter Stock Library results. */
  preferredAspect?: "16:9" | "9:16" | "1:1" | "4:5";
  onUpdate: (updates: Partial<ComposerScene>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /**
   * Block M — opens the Hybrid Extend dialog for this scene.
   * Parent owns the dialog state because it needs to refetch scenes after success.
   */
  onHybridExtend?: (
    mode: "forward" | "backward" | "bridge" | "style-ref",
  ) => void;
  /** True if at least one OTHER scene in the project has a clip_url (enables Bridge button). */
  hasOtherReadyScenes?: boolean;
  /** Allows the per-scene Dialog Studio to spawn shot-reverse-shot sub-scenes. */
  onAddScene?: (
    partial: Partial<ComposerScene>,
  ) => Promise<string | undefined> | void;
  /** Inserts SRS sub-scenes at the parent's slot (replaces the dialog scene). */
  onInsertScenesAfter?: (
    parentSceneId: string,
    partials: Partial<ComposerScene>[],
    opts?: { removeParent?: boolean },
  ) => Promise<(string | undefined)[]>;
  /** Propagates a newly-picked library character into the project briefing cast
   *  so prompt injection / anchor resolution finds it. */
  onAddCharacter?: (character: ComposerCharacter) => void;
  language: string;
  /** Auto-persist hook for the per-scene Dialog Studio (voiceover generation). */
  onEnsurePersisted?: () => Promise<{
    projectId: string;
    scenes: ComposerScene[];
  }>;
  /** Phase 2 — last_frame_url of the previous scene, surfaced as Quick Anchor. */
  previousSceneLastFrameUrl?: string;
  /** Phase 2 — 1-based index of previous scene for the chip label. */
  previousSceneIndex?: number;
  /** Phase 2 — when true, the Frame-First Studio is highlighted as Step 1. */
  frameFirstMode?: boolean;
  /**
   * Stage 17b — when true, this card is rendered inside the persistent
   * Studio Pane (storyboard split-view). It is always fully expanded and
   * drops its own card chrome to avoid double borders.
   */
  embedded?: boolean;
  /**
   * Sum of `durationSeconds` of all OTHER scenes in the project. Used to
   * clamp this scene's duration slider so the total project never exceeds
   * the 10-minute hard budget (see `src/lib/composer/budget.ts`).
   */
  siblingsDurationSec?: number;
}

const SCENE_TYPES: SceneType[] = [
  "hook",
  "problem",
  "solution",
  "demo",
  "social-proof",
  "cta",
  "custom",
];

const sceneTypeColor: Record<SceneType, string> = {
  hook: "bg-red-500/20 text-red-400",
  problem: "bg-orange-500/20 text-orange-400",
  solution: "bg-green-500/20 text-green-400",
  demo: "bg-blue-500/20 text-blue-400",
  "social-proof": "bg-purple-500/20 text-purple-400",
  cta: "bg-primary/20 text-primary",
  custom: "bg-muted text-muted-foreground",
};

// Text overlay editing has moved to the dedicated "Text & Subtitles" tab.

export default function SceneCard({
  scene,
  index,
  totalScenes,
  projectId,
  characters,
  preferredAspect,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onHybridExtend,
  hasOtherReadyScenes,
  onAddScene,
  onInsertScenesAfter,
  onAddCharacter,
  language,
  onEnsurePersisted,
  previousSceneLastFrameUrl,
  previousSceneIndex,
  frameFirstMode,
  embedded,
  siblingsDurationSec = 0,
}: SceneCardProps) {
  const lang = (language === "es" ? "es" : language === "en" ? "en" : "de") as
    | "de"
    | "en"
    | "es";
  const confirmRender = useSceneRenderConfirm();
  const isStock =
    scene.clipSource === "stock" || scene.clipSource === "stock-image";
  const clipSourceIcon = scene.clipSource.startsWith("ai-")
    ? Sparkles
    : isStock
      ? Video
      : Upload;
  const ClipIcon = clipSourceIcon;
  const activeChar = scene.characterShot
    ? characters?.find((c) => c.id === scene.characterShot!.characterId)
    : undefined;
  // Library for live mention resolution preview
  const { characters: libCharacters, locations: libLocations } =
    useUnifiedMentionLibrary();
  // World-asset pools for the UnifiedAssetPicker (Locations / Buildings / Props).
  const { locations: brandLocations } = useBrandLocations();
  const { buildings: brandBuildings } = useBrandBuildings();
  const { props: brandProps } = useBrandProps();
  // Curated catalog (admin-seeded preview rows) — surfaced directly in the
  // picker so users can use real-image assets without saving to their library.
  const { catalogLocations, catalogBuildings, catalogProps } =
    useWorldCatalog();
  // Library-first dedupe by lowercased name: a saved Brand asset always wins
  // over a catalog row with the same label so user edits / identity cards stick.
  const mergeWithCatalog = <T extends { name: string }>(
    saved: T[],
    catalog: T[],
  ): T[] => {
    const safeSaved = (saved ?? []).filter(
      (s): s is T =>
        !!s && typeof s.name === "string" && s.name.trim().length > 0,
    );
    const safeCatalog = (catalog ?? []).filter(
      (c): c is T =>
        !!c && typeof c.name === "string" && c.name.trim().length > 0,
    );
    const seen = new Set(safeSaved.map((s) => s.name.trim().toLowerCase()));
    return [
      ...safeSaved,
      ...safeCatalog.filter((c) => !seen.has(c.name.trim().toLowerCase())),
    ];
  };
  // Phase 2 — auto-inject the user's favorite Brand Character into the preview.
  const { characters: brandChars } = useBrandCharacters();
  const activeBrandChar =
    brandChars.find((c) => c.is_favorite) ?? brandChars[0];
  const _brandApplies = activeBrandChar
    ? sceneFeaturesCharacter(scene, { name: activeBrandChar.name })
    : false;
  const brandCharacterInput = activeBrandChar
    ? {
        name: activeBrandChar.name,
        identityCardPrompt: buildCharacterPromptInjection(activeBrandChar),
        referenceImageUrl: activeBrandChar.reference_image_url,
        appliesToScene: _brandApplies,
        // When the scene features the character, surface the portrait as the
        // i2v anchor so the live preview's "i2v ref" badge reflects what the
        // engine will actually receive (Hailuo first_frame_image, etc.).
        usePortraitAsFirstFrame: _brandApplies,
      }
    : undefined;
  // Phase 6 — Live Prompt Preview expanded state.
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);
  // Stock browser open state
  const [stockBrowserOpen, setStockBrowserOpen] = useState(false);
  // Block K — Style Preset Picker open state
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  // Block K-5 — Inspire-Me loading flag
  const [inspiring, setInspiring] = useState(false);
  // Block K-6 — Multi-Engine Preview open state
  const [multiEngineOpen, setMultiEngineOpen] = useState(false);
  // Block L — Inline Compare Lab dialog open state
  const [compareLabOpen, setCompareLabOpen] = useState(false);
  // Phase 1 (Studio Set v2) — single Sheet that consolidates the former
  // DirectorConsolePreview, "Finaler Prompt (Vorschau)", Multi-Engine and
  // Compare-Lab launcher. Replaces the old `advancedOpen` toggle for prompts.
  const [promptDetailsOpen, setPromptDetailsOpen] = useState(false);
  // Phase 2 (Studio Set v2) — single Sheet for Looks/Feintuning/Modifier.
  const [styleSheetOpen, setStyleSheetOpen] = useState(false);
  // Phase 3 (Studio Set v2) — single drawer collapsing Effects, Anchor + Face-
  // Lock, Lip-Sync, Reference image + Still-Frame Studio and the hard-cut hint.
  // Default closed → SceneCard reads as a focussed prompt + cast surface.
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  // Real-Time Collaboration — comment thread for this scene
  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const { data: commentCounts } = useSceneCommentCounts(projectId);
  const sceneCounts = (scene.id && commentCounts?.[scene.id]) || {
    total: 0,
    open: 0,
  };
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(
    undefined,
  );
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id));
  }, []);

  // Scene Dialog Studio — toggleable per-scene script editor (monolog from 1 cast,
  // dialog from 2+). Hidden by default; opened via the "Skript schreiben" button
  // in the cast row. Initial open if a script already exists.
  const [dialogStudioOpen, setDialogStudioOpen] = useState<boolean>(
    Boolean((scene.dialogScript ?? "").trim()),
  );
  const dialogStudioRef = useRef<HTMLDivElement | null>(null);
  const [splitConfirmOpen, setSplitConfirmOpen] = useState(false);
  const [autoSplitArmed, setAutoSplitArmed] = useState(false);

  const cleanRestartLipSync = async (opts: { force?: boolean } = {}) => {
    const { data, error } = await supabase.functions.invoke("reset-lipsync-scene", {
      body: { scene_id: scene.id, force: opts.force === true },
    });
    if (error) throw new Error(await extractFunctionsError(error));
    if ((data as any)?.status === "already_applied") {
      toast({
        title: "Lip-Sync bereits fertig",
        description: "Für einen neuen Versuch bitte den Clip + Lip-Sync neu rendern.",
      });
      return;
    }
    (onUpdate as (updates: any) => void)({
      lipSyncStatus: "pending" as any,
      lipSyncAppliedAt: null as any,
      lipSyncSourceClipUrl: null as any,
      twoshotStage: null as any,
      clipError: null as any,
    });
    toast({
      title: "Lip-Sync sauber neu gestartet",
      description: "Alte Jobs und Pipeline-Daten sind entfernt. v69 startet automatisch neu.",
    });
  };

  // Studio-Set UX: collapse-by-default for already-configured scenes so the
  // storyboard reads as a scannable list. Newly-created (empty) scenes start
  // expanded so the user lands in the editor immediately.
  const [isExpandedState, setIsExpanded] = useState<boolean>(() => {
    if (embedded) return true;
    const hasContent =
      Boolean((scene.aiPrompt ?? "").trim()) ||
      Boolean((scene.dialogScript ?? "").trim()) ||
      Boolean(scene.clipUrl) ||
      Boolean(scene.uploadUrl);
    return !hasContent;
  });
  // When embedded inside the persistent Studio Pane, the editor is always
  // fully open — the strip on the left handles selection/collapse.
  const isExpanded = embedded ? true : isExpandedState;

  const { systemPresets } = useStylePresets();

  const promptMode: "free" | "structured" = scene.promptMode ?? "free";
  const promptSlots: PromptSlots = scene.promptSlots ?? {};
  const promptSlotOrder = scene.promptSlotOrder;

  // K-P1 — Cmd/Ctrl + Shift + S toggles Free ↔ Structured for the focused card.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const isMac = useMemo(
    () => typeof navigator !== "undefined" && /Mac/i.test(navigator.platform),
    [],
  );
  const shortcutLabel = isMac ? "⌘⇧S" : "Ctrl+Shift+S";

  const togglePromptMode = () => {
    if (promptMode === "free") {
      // Free → Structured: naive split (KI-Extractor optional, später)
      const nextSlots = hasAnySlot(promptSlots)
        ? promptSlots
        : naiveSplitToSlots(scene.aiPrompt || "");
      onUpdate({ promptMode: "structured", promptSlots: nextSlots });
    } else {
      // Structured → Free: deterministic stitch (respect custom slot order)
      const stitched = stitchSlots(promptSlots, promptSlotOrder);
      onUpdate({ promptMode: "free", aiPrompt: stitched || scene.aiPrompt });
    }
  };

  useEffect(() => {
    if (!scene.clipSource.startsWith("ai-")) return;
    const handler = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || !e.shiftKey) return;
      if (e.key.toLowerCase() !== "s") return;
      // Only fire when focus is inside this card
      if (!cardRef.current?.contains(document.activeElement)) return;
      e.preventDefault();
      togglePromptMode();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    promptMode,
    promptSlots,
    promptSlotOrder,
    scene.aiPrompt,
    scene.clipSource,
    isMac,
  ]);

  // Auto-sync: when the scene prompt mentions a known character (e.g. the
  // storyboard LLM wrote "Sarah Dusatko wipes sweat…" but only added Matthew
  // to characterShots), append the missing character with shotType 'full'.
  // Idempotent — `syncCastFromPrompt` returns the same reference when nothing
  // changes, so no render loop. Must run BEFORE the cast-marker backfill below
  // so the marker picks up the auto-added slots in the same pass.
  useEffect(() => {
    if (!characters || characters.length === 0) return;
    const current =
      scene.characterShots ??
      (scene.characterShot ? [scene.characterShot] : []);
    const next = syncCastFromPrompt(
      scene.aiPrompt || "",
      current,
      characters,
      scene.dismissedCharacterIds,
    );
    if (next === current) return;
    onUpdate({
      characterShots: next,
      characterShot: next[0] ?? scene.characterShot,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.aiPrompt, characters?.length, scene.dismissedCharacterIds?.length]);

  // Backfill: ensure scenes with a cast also carry the cast marker in the
  // prompt. `applyCastToPrompt` is idempotent (strips the existing marker
  // first), so we can safely re-run on every cast / character-list change to
  // catch storyboard refreshes and late-arriving brand characters.
  useEffect(() => {
    if (!scene.clipSource.startsWith("ai-")) return;
    if (!characters || characters.length === 0) return;
    const cast =
      scene.characterShots ??
      (scene.characterShot ? [scene.characterShot] : []);
    if (cast.length === 0) return;
    if (promptMode === "structured") {
      const currentSubject = (promptSlots.subject as string) || "";
      const newSubject = applyCastToPrompt(
        currentSubject,
        cast,
        characters,
        lang,
      );
      if (newSubject !== currentSubject) {
        const nextSlots: PromptSlots = { ...promptSlots, subject: newSubject };
        onUpdate({
          promptSlots: nextSlots,
          aiPrompt: stitchSlots(nextSlots, promptSlotOrder),
        });
      }
    } else {
      const newPrompt = applyCastToPrompt(
        scene.aiPrompt || "",
        cast,
        characters,
        lang,
      );
      if (newPrompt !== (scene.aiPrompt || ""))
        onUpdate({ aiPrompt: newPrompt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scene.id,
    characters?.length,
    scene.characterShots?.length,
    scene.characterShot?.characterId,
    scene.characterShots
      ?.map((s) => `${s.characterId}:${s.shotType}`)
      .join("|"),
  ]);

  // Sync scene.dialogScript → scene.aiPrompt (and promptSlots.subject in
  // structured mode). Without this the [Dialog] marker written into aiPrompt
  // alone would be wiped on the next stitchSlots() call.
  //
  // IMPORTANT: If the prompt already contains a timed "Audio plan (exact, do
  // not deviate)" marker (written by SceneDialogStudio after TTS finished),
  // we treat that as the canonical source of truth and do NOT downgrade it
  // back to the text-only fallback. Otherwise the per-speaker start–end
  // timestamps would get wiped every time this effect re-runs (DB reload,
  // character refresh, promptMode change…).
  useEffect(() => {
    if (!scene.clipSource.startsWith("ai-")) return;
    if (!characters || characters.length === 0) return;
    // Gate re-injection on the marker wrapper — Action-First intent mode
    // no longer emits the "Audio plan" string, so we check for the
    // canonical `[Dialog]` block instead.
    const hasDialogMarker = (txt: string) => /\[Dialog\][\s\S]*?\[\/Dialog\]/i.test(txt || "");
    const cast =
      scene.characterShots ??
      (scene.characterShot ? [scene.characterShot] : []);
    const sceneCastChars = cast
      .map((cs) => characters.find((c) => c.id === cs.characterId))
      .filter((c): c is ComposerCharacter => !!c);
    const blocks = parseDialogScript(scene.dialogScript ?? "", sceneCastChars);
    // Native-dialogue providers (Veo 3.1 / HappyHorse / Kling 3) read the
    // verbatim text from the prompt — keep the legacy mode there.
    const isNativeDialogue = scene.engineOverride === "native-dialogue";
    const mode: "intent" | "verbatim" = isNativeDialogue ? "verbatim" : "intent";
    if (promptMode === "structured") {
      const currentSubject = (promptSlots.subject as string) || "";
      if (hasDialogMarker(currentSubject)) return;
      const newSubject = applyDialogToPrompt(currentSubject, blocks, lang, mode);
      if (newSubject !== currentSubject) {
        const nextSlots: PromptSlots = { ...promptSlots, subject: newSubject };
        onUpdate({
          promptSlots: nextSlots,
          aiPrompt: stitchSlots(nextSlots, promptSlotOrder),
        });
      }
    } else {
      if (hasDialogMarker(scene.aiPrompt || "")) return;
      const newPrompt = applyDialogToPrompt(scene.aiPrompt || "", blocks, lang, mode);
      if (newPrompt !== (scene.aiPrompt || ""))
        onUpdate({ aiPrompt: newPrompt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.dialogScript, characters?.length, promptMode, scene.engineOverride]);


  // ── Action overrides → prompt sync ────────────────────────────────────
  // Inject `[SceneAction]` + `[CastActions]` marker blocks whenever the user
  // edits the manual action fields. `applyActionsToPrompt` is idempotent
  // (strips the existing markers before rewriting), so this is safe to run
  // on every relevant change. Empty inputs → markers disappear → Director
  // output regains control. Locked overrides survive Director re-rolls
  // because this effect re-applies them right after `onApply` writes the
  // new `aiPrompt`.
  useEffect(() => {
    if (!scene.clipSource.startsWith("ai-")) return;
    const sceneActionEn = (scene.sceneActionEn ?? "").trim();
    const cast = scene.characterShots ?? (scene.characterShot ? [scene.characterShot] : []);
    const castActions: CastActionEntry[] = cast
      .map((slot) => {
        const ch = characters?.find((c) => c.id === slot.characterId);
        const en = (slot.actionEn ?? "").trim();
        if (!ch || !en) return null;
        return { name: ch.name, actionEn: en };
      })
      .filter((x): x is CastActionEntry => !!x);

    if (promptMode === "structured") {
      const currentSubject = (promptSlots.subject as string) || "";
      const next = applyActionsToPrompt(currentSubject, sceneActionEn, castActions);
      if (next !== currentSubject) {
        const nextSlots: PromptSlots = { ...promptSlots, subject: next };
        onUpdate({
          promptSlots: nextSlots,
          aiPrompt: stitchSlots(nextSlots, promptSlotOrder),
        });
      }
    } else {
      const next = applyActionsToPrompt(scene.aiPrompt || "", sceneActionEn, castActions);
      if (next !== (scene.aiPrompt || "")) onUpdate({ aiPrompt: next });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scene.sceneActionEn,
    scene.aiPrompt,
    promptMode,
    characters?.length,
    scene.characterShots?.map((s) => `${s.characterId}:${s.actionEn ?? ""}`).join("|"),
    scene.characterShot?.actionEn,
  ]);

  const handleSlotsChange = (next: PromptSlots) => {
    const stitched = stitchSlots(next, promptSlotOrder);
    onUpdate({ promptSlots: next, aiPrompt: stitched });
  };

  const handleOrderChange = (order: Array<keyof PromptSlots>) => {
    const safeOrder = order.filter((k) => k !== "negative") as NonNullable<
      typeof scene.promptSlotOrder
    >;
    const stitched = stitchSlots(promptSlots, safeOrder);
    onUpdate({ promptSlotOrder: safeOrder, aiPrompt: stitched });
  };

  // Block K-5 — Inspire Me: roll a random scene idea via the edge function.
  // Optionally seeds the AI with a random system preset's name for variation.
  const handleInspireMe = async () => {
    setInspiring(true);
    try {
      const seed =
        systemPresets && systemPresets.length > 0
          ? systemPresets[Math.floor(Math.random() * systemPresets.length)]
          : null;
      const targetModel = clipSourceToModelKey(scene.clipSource) ?? "ai-sora";
      const { data, error } = await supabase.functions.invoke(
        "structured-prompt-compose",
        {
          body: {
            mode: "inspire",
            language: lang,
            targetModel,
            seedStyle: seed?.name,
            contextHint: scene.aiPrompt?.slice(0, 400) ?? "",
          },
        },
      );
      if (error) throw error;
      const newSlots: PromptSlots | undefined = data?.slots;
      if (!newSlots || Object.keys(newSlots).length === 0) {
        throw new Error("Empty inspire response");
      }
      // Apply slots + flip to structured mode + sync free-text via stitcher.
      onUpdate({
        promptMode: "structured",
        promptSlots: newSlots,
        aiPrompt: stitchSlots(newSlots, promptSlotOrder),
        // If the seed brought director modifiers along, apply them too.
        ...(seed?.director_modifiers
          ? { directorModifiers: seed.director_modifiers }
          : {}),
      });
      toast({
        title:
          lang === "de"
            ? "🎲 Neue Szenenidee"
            : lang === "es"
              ? "🎲 Nueva idea de escena"
              : "🎲 Fresh scene idea",
        description: seed?.name
          ? lang === "de"
            ? `Inspiriert von „${seed.name}"`
            : lang === "es"
              ? `Inspirado en "${seed.name}"`
              : `Inspired by "${seed.name}"`
          : undefined,
      });
    } catch (e: any) {
      console.error("[SceneCard] inspire failed", e);
      toast({
        title:
          lang === "de"
            ? "Inspire fehlgeschlagen"
            : lang === "es"
              ? "Falló la inspiración"
              : "Inspire failed",
        description: e?.message ?? "",
        variant: "destructive",
      });
    } finally {
      setInspiring(false);
    }
  };

  const handleStockSelect = (item: StockMediaItem) => {
    onUpdate({
      clipSource: item.type === "video" ? "stock" : "stock-image",
      clipUrl: item.url,
      clipStatus: "ready",
      stockMediaThumb: item.thumbnailUrl || undefined,
      stockMediaSource: item.source === "upload" ? undefined : item.source,
      stockMediaAuthor: item.authorName
        ? { name: item.authorName, url: item.authorUrl }
        : undefined,
      uploadType: item.type,
    });
  };

  return (
    <Card
      ref={cardRef as any}
      id={`scene-card-${scene.id || index}`}
      className={
        embedded
          ? "relative border-0 bg-transparent shadow-none rounded-none"
          : "relative border-border/40 bg-gradient-to-b from-card/90 to-card/60 group overflow-hidden transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_24px_-8px_hsl(var(--primary)/0.25)]"
      }
    >
      {/* Bond-style vertical gold accent on hover (hidden when embedded) */}
      {!embedded && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-3 bottom-3 w-px bg-gradient-to-b from-transparent via-primary/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        />
      )}
      <CardContent
        className={
          embedded
            ? "p-0 overflow-visible"
            : isExpanded
              ? "p-4 overflow-hidden"
              : "p-2.5 overflow-hidden"
        }
      >
        <SceneCardSummaryHeader
          scene={scene}
          index={index}
          totalScenes={totalScenes}
          isExpanded={isExpanded}
          onToggleExpand={embedded ? undefined : () => setIsExpanded((v) => !v)}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDelete={onDelete}
          language={lang}
        />
        {isExpanded && (
          <div className="min-w-0">
            <SceneStudioTabBar
              cardId={`scene-card-${scene.id || index}`}
              language={lang}
              badges={{
                performance: countDirectedPerformances(
                  derivePerformanceEntries(scene, characters ?? []),
                ),
              }}
            />

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-4">
              <SceneStudioSectionHeader tab="story" language={lang} />
              {/* Top row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Select
                    value={scene.sceneType}
                    onValueChange={(v) =>
                      onUpdate({ sceneType: v as SceneType })
                    }
                  >
                    <SelectTrigger className="h-7 w-auto gap-1 text-xs border-none p-0 px-2">
                      <Badge
                        className={`${sceneTypeColor[scene.sceneType]} text-[10px] border-none`}
                      >
                        {SCENE_TYPE_LABELS[scene.sceneType]?.[lang] ||
                          scene.sceneType}
                      </Badge>
                    </SelectTrigger>
                    <SelectContent>
                      {SCENE_TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">
                          {SCENE_TYPE_LABELS[t]?.[lang] || t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <span className="text-xs text-muted-foreground">
                    {scene.durationSeconds}s
                  </span>
                  <span className="text-[10px] text-primary">
                    €
                    {getClipCost(
                      scene.clipSource,
                      scene.clipQuality || "standard",
                      scene.durationSeconds,
                    ).toFixed(2)}
                  </span>
                  {(() => {
                    const rec = recommendEngineForScene(scene);
                    const override = scene.engineOverride ?? "auto";
                    // Multi-speaker hint: HeyGen MVP renders only first speaker per scene.
                    // Surface a clickable warning that opens the Dialog Studio with
                    // "Als getrennte Szenen rendern" pre-armed.
                    const speakerLines = (scene.dialogScript ?? "")
                      .split("\n")
                      .map((l) =>
                        l
                          .match(
                            /^\s*\[?([A-Za-zÀ-ÿ][\w\s.'-]{1,40}?)\]?\s*[:：]/,
                          )?.[1]
                          ?.trim()
                          .toLowerCase(),
                      )
                      .filter(Boolean) as string[];
                    const speakerCount = new Set(speakerLines).size;
                    const showSplitHint =
                      rec.engine === "heygen-talking-head" && speakerCount >= 2;
                    return (
                      <>
                        {showSplitHint && (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[9px] gap-1 cursor-pointer border-emerald-500/60 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                            title={
                              lang === "de"
                                ? `${speakerCount} Sprecher erkannt. Beim Generieren läuft die Dialog-Shot Pipeline: pro Sprecher-Turn ein eigener Hailuo-Plate (Mund frei, eigenes Portrait) + dedizierter Sync.so Lip-Sync, danach zu einem Clip gestitcht. Skaliert auf beliebig viele Sprecher. Klick öffnet das Dialog-Studio.`
                                : lang === "es"
                                  ? `${speakerCount} hablantes detectados. Al renderizar se ejecuta el pipeline Dialog-Shot: un plate Hailuo + lip-sync Sync.so dedicado por turno, después concat a un clip. Escala a N hablantes. Click abre el Dialog Studio.`
                                  : `${speakerCount} speakers detected. Generating runs the Dialog-Shot pipeline: one dedicated Hailuo plate + Sync.so lip-sync per speaker turn, then concatenated to one clip. Scales to N speakers. Click opens Dialog Studio.`
                            }
                            onClick={() => setSplitConfirmOpen(true)}
                          >
                            🎭{" "}
                            {lang === "de"
                              ? `Dialog-Shots · ${speakerCount} Sprecher`
                              : lang === "es"
                                ? `Dialog-Shots · ${speakerCount} hablantes`
                                : `Dialog-Shots · ${speakerCount} speakers`}
                          </Badge>
                        )}
                        <Select
                          value={override}
                          onValueChange={(v) =>
                            onUpdate({ engineOverride: v as any })
                          }
                        >
                          <SelectTrigger
                            className={`h-5 w-auto gap-1 px-1.5 border-none p-0 text-[9px] [&_svg]:h-2.5 [&_svg]:w-2.5 ${
                              rec.engine === "heygen-talking-head"
                                ? "text-primary bg-primary/10 border border-primary/60"
                                : rec.engine === "cinematic-sync"
                                  ? "text-emerald-300 bg-emerald-500/10 border border-emerald-500/50"
                                  : rec.engine === "sync-polish"
                                    ? "text-amber-300 bg-amber-500/10 border border-amber-500/40"
                                    : "text-muted-foreground bg-transparent border border-border/50"
                            } rounded-md`}
                            title={rec.reason}
                          >
                            <SelectValue>{rec.label}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto" className="text-xs">
                              ⚙️ Auto (empfohlen)
                            </SelectItem>
                            <SelectItem
                              value="sync-segments"
                              className="text-xs"
                            >
                              ⚡ Fast Dialog · 1-Call (Sync.so Segments) — Default
                            </SelectItem>
                            <SelectItem value="heygen" className="text-xs">
                              🎙️ HeyGen Talking-Head
                            </SelectItem>
                            <SelectItem value="broll" className="text-xs">
                              📺 B-Roll (Off-Screen-VO)
                            </SelectItem>
                            <SelectItem value="sync-polish" className="text-xs">
                              ✨ Sync.so Polish
                            </SelectItem>
                            {/* v70: cinematic-sync-legacy option removed — all
                                dialog scenes use v69 unified single-face preclip. */}
                          </SelectContent>
                        </Select>
                        {/* Cinematic-Sync quick-switch lives in ClipsTab as a prominent action button — kept out of here to avoid duplication. */}
                      </>
                    );
                  })()}
                  {(() => {
                    const slots =
                      scene.characterShots && scene.characterShots.length > 0
                        ? scene.characterShots
                        : scene.characterShot
                          ? [scene.characterShot]
                          : [];
                    return slots
                      .filter((s) => s.shotType !== "absent")
                      .map((s) => {
                        const ch = characters?.find(
                          (c) => c.id === s.characterId,
                        );
                        return (
                          <CharacterShotBadge
                            key={s.characterId}
                            shot={s}
                            characterName={ch?.name}
                          />
                        );
                      });
                  })()}
                  {scene.hybridMode && (
                    <Badge
                      variant="outline"
                      className="text-[9px] h-4 px-1.5 gap-1 border-primary/40 text-primary"
                      title={
                        lang === "de"
                          ? "Hybrid-Szene: Frame-anker zur Quellszene"
                          : lang === "es"
                            ? "Escena híbrida: anclada por frame a la escena fuente"
                            : "Hybrid scene: frame-anchored to source"
                      }
                    >
                      {scene.hybridMode === "bridge" ? (
                        <Link2 className="h-2.5 w-2.5" />
                      ) : scene.hybridMode === "style-ref" ? (
                        <Palette className="h-2.5 w-2.5" />
                      ) : (
                        <Link2 className="h-2.5 w-2.5" />
                      )}
                      {scene.hybridMode === "forward"
                        ? "Sequel"
                        : scene.hybridMode === "backward"
                          ? "Prequel"
                          : scene.hybridMode === "bridge"
                            ? "Crossfade"
                            : scene.hybridMode === "style-ref"
                              ? "Style-Echo"
                              : scene.hybridMode}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {scene.id && projectId && (
                    <SceneCommentBadge
                      total={sceneCounts.total}
                      open={sceneCounts.open}
                      onClick={() => setCommentSheetOpen(true)}
                    />
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                    onClick={onDelete}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Duration slider — clamped by 10-min project budget */}
              {(() => {
                const MAX_PROJECT_SEC = 600;
                const MIN_SCENE = 3;
                const PROVIDER_MAX = 15;
                const remaining = Math.max(0, MAX_PROJECT_SEC - siblingsDurationSec);
                const sliderMax = Math.max(MIN_SCENE, Math.min(PROVIDER_MAX, remaining));
                const budgetCapped = sliderMax < PROVIDER_MAX;
                // Defensive: if persisted scene already exceeds the new cap, allow current
                // value (so the slider can render) but show a warning.
                const effectiveMax = Math.max(sliderMax, scene.durationSeconds);
                return (
                  <div className="space-y-1">
                    <Slider
                      value={[scene.durationSeconds]}
                      onValueChange={([v]) =>
                        onUpdate({ durationSeconds: Math.min(v, sliderMax) })
                      }
                      min={MIN_SCENE}
                      max={effectiveMax}
                      step={1}
                      className="w-full"
                    />
                    {budgetCapped && (
                      <p className="text-[10px] text-amber-300/80 leading-snug">
                        Projekt-Budget fast voll · max. {sliderMax}s für diese Szene.
                        Kürze oder lösche eine andere Szene, um mehr Zeit freizugeben.
                      </p>
                    )}
                  </div>
                );
              })()}


              {/* 🎬 Director Mode — Hybrid Production actions (only when source clip is ready) */}
              {onHybridExtend &&
                scene.clipStatus === "ready" &&
                scene.clipUrl && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 rounded-md border border-primary/20 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 px-2 py-1.5">
                    <span className="text-[9px] uppercase tracking-wider font-semibold text-primary flex items-center gap-1">
                      🎬{" "}
                      {lang === "de"
                        ? "Director Mode"
                        : lang === "es"
                          ? "Director Mode"
                          : "Director Mode"}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] gap-1.5"
                      onClick={() => onHybridExtend("backward")}
                      title={
                        lang === "de"
                          ? "Prequel — was passierte vor dieser Szene?"
                          : lang === "es"
                            ? "Prequel — ¿qué pasó antes de esta escena?"
                            : "Prequel — what happened before this scene?"
                      }
                    >
                      <ArrowLeft className="h-3 w-3" />
                      {lang === "de"
                        ? "Prequel"
                        : lang === "es"
                          ? "Prequel"
                          : "Prequel"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] gap-1.5"
                      onClick={() => onHybridExtend("forward")}
                      title={
                        lang === "de"
                          ? "Sequel — wie geht die Szene weiter?"
                          : lang === "es"
                            ? "Sequel — ¿cómo continúa la escena?"
                            : "Sequel — how does the scene continue?"
                      }
                    >
                      <ArrowRight className="h-3 w-3" />
                      {lang === "de"
                        ? "Sequel"
                        : lang === "es"
                          ? "Sequel"
                          : "Sequel"}
                    </Button>
                    {hasOtherReadyScenes && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] gap-1.5"
                        onClick={() => onHybridExtend("bridge")}
                        title={
                          lang === "de"
                            ? "Crossfade — morphender Übergang in eine andere Szene"
                            : lang === "es"
                              ? "Crossfade — transición con morphing hacia otra escena"
                              : "Crossfade — morphing transition to another scene"
                        }
                      >
                        <Link2 className="h-3 w-3" />
                        {lang === "de"
                          ? "Crossfade"
                          : lang === "es"
                            ? "Crossfade"
                            : "Crossfade"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] gap-1.5"
                      onClick={() => onHybridExtend("style-ref")}
                      title={
                        lang === "de"
                          ? "Style-Echo — neue Szene, gleiche Bildsprache"
                          : lang === "es"
                            ? "Style-Echo — nueva escena, mismo lenguaje visual"
                            : "Style-Echo — new scene, same visual language"
                      }
                    >
                      <Palette className="h-3 w-3" />
                      {lang === "de"
                        ? "Style-Echo"
                        : lang === "es"
                          ? "Style-Echo"
                          : "Style-Echo"}
                    </Button>
                  </div>
                )}
              {/* Clip source — 3 compact tabs (Stock / KI / Upload) + KI-Modell-Dropdown */}
              {(() => {
                const isAi = scene.clipSource.startsWith("ai-");
                const isStockImage = scene.clipSource === "stock-image";
                const isUpload = scene.clipSource === "upload";
                const sourceMode: "stock" | "ai" | "upload" = isAi
                  ? "ai"
                  : isUpload
                    ? "upload"
                    : "stock";
                const currentModelId = isAi
                  ? sourceToModelId(scene.clipSource, scene.clipQuality)
                  : "";

                const tabs: Array<{
                  id: "stock" | "ai" | "upload";
                  label: string;
                }> = [
                  {
                    id: "stock",
                    label:
                      lang === "de"
                        ? "🎁 Stock"
                        : lang === "es"
                          ? "🎁 Stock"
                          : "🎁 Stock",
                  },
                  {
                    id: "ai",
                    label:
                      lang === "de"
                        ? "🤖 KI-Generiert"
                        : lang === "es"
                          ? "🤖 IA"
                          : "🤖 AI-Generated",
                  },
                  {
                    id: "upload",
                    label:
                      lang === "de"
                        ? "⬆ Eigenes"
                        : lang === "es"
                          ? "⬆ Propio"
                          : "⬆ Upload",
                  },
                ];

                const handleTabChange = (id: "stock" | "ai" | "upload") => {
                  if (id === "stock") {
                    const next: ClipSource = isStockImage
                      ? "stock-image"
                      : "stock";
                    onUpdate({ clipSource: next });
                    setStockBrowserOpen(true);
                  } else if (id === "upload") {
                    onUpdate({ clipSource: "upload" });
                  } else if (!isAi) {
                    onUpdate({
                      clipSource: "ai-hailuo",
                      clipQuality: scene.clipQuality ?? "standard",
                    });
                  }
                };

                return (
                  <div className="space-y-2">
                    <div className="flex gap-1.5 p-1 rounded-lg bg-card/40 border border-border/40">
                      {tabs.map((tab) => {
                        const active = sourceMode === tab.id;
                        const isStockTab = tab.id === "stock";
                        return (
                          <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={`flex-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all flex items-center justify-center gap-1.5 ${
                              active
                                ? isStockTab
                                  ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
                                  : tab.id === "ai"
                                    ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                                    : "bg-muted text-foreground ring-1 ring-border"
                                : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                            }`}
                          >
                            {tab.label}
                            {isStockTab && active && (
                              <span className="ml-0.5 px-1 rounded bg-emerald-500/25 text-emerald-200 text-[8px] font-semibold uppercase tracking-wide">
                                Free
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {sourceMode === "stock" && (
                      <div className="flex gap-1.5">
                        {[
                          {
                            src: "stock" as ClipSource,
                            label:
                              lang === "de"
                                ? "Video"
                                : lang === "es"
                                  ? "Vídeo"
                                  : "Video",
                            icon: Video,
                          },
                          {
                            src: "stock-image" as ClipSource,
                            label:
                              lang === "de"
                                ? "Bild"
                                : lang === "es"
                                  ? "Imagen"
                                  : "Image",
                            icon: ImageIcon,
                          },
                        ].map((opt) => {
                          const active = scene.clipSource === opt.src;
                          const Icon = opt.icon;
                          return (
                            <button
                              key={opt.src}
                              onClick={() => {
                                onUpdate({ clipSource: opt.src });
                                setStockBrowserOpen(true);
                              }}
                              className={`px-2.5 py-1 rounded-md text-[10px] border transition-all flex items-center gap-1.5 ${
                                active
                                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                                  : "border-border/40 text-muted-foreground hover:border-border"
                              }`}
                            >
                              <Icon className="h-2.5 w-2.5" />
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {sourceMode === "ai" && (() => {
                      const dialogMode = scene.dialogMode === true;
                      const modelsForPicker = dialogMode
                        ? COMPOSER_DIALOG_MODELS
                        : COMPOSER_AVAILABLE_MODELS;
                      const toggleOnLabel =
                        lang === "de"
                          ? "Dialog & Lip-Sync"
                          : lang === "es"
                            ? "Diálogo y Lip-Sync"
                            : "Dialog & Lip-Sync";
                      const toggleHint =
                        lang === "de"
                          ? "Nur Modelle mit professionellem nativem Dialog & Lippensync (Kling 3, Veo 3.1, HappyHorse 1.0)."
                          : lang === "es"
                            ? "Solo modelos con diálogo nativo y lip-sync profesional (Kling 3, Veo 3.1, HappyHorse 1.0)."
                            : "Only models with professional native dialog & lip-sync (Kling 3, Veo 3.1, HappyHorse 1.0).";
                      return (
                        <div className="space-y-2">
                          {/* Dialog & Lip-Sync toggle — James-Bond-2028 gold accent */}
                          <div
                            className={cn(
                              "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 transition-all",
                              dialogMode
                                ? "border-amber-400/50 bg-amber-500/[0.06] shadow-[inset_2px_0_0_0_hsl(43_90%_60%/0.7)]"
                                : "border-border/40 bg-card/40",
                            )}
                            title={toggleHint}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <MessageSquareQuote
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0",
                                  dialogMode ? "text-amber-300" : "text-muted-foreground",
                                )}
                              />
                              <div className="flex flex-col min-w-0">
                                <span
                                  className={cn(
                                    "text-[11px] font-medium leading-tight",
                                    dialogMode ? "text-amber-200" : "text-foreground",
                                  )}
                                >
                                  {toggleOnLabel}
                                </span>
                                <span className="text-[9px] text-muted-foreground leading-tight truncate">
                                  {dialogMode
                                    ? lang === "de"
                                      ? "3 Modelle · Skript & Lip-Sync aktiv"
                                      : lang === "es"
                                        ? "3 modelos · Guion y lip-sync activos"
                                        : "3 models · Script & lip-sync active"
                                    : lang === "de"
                                      ? "B-Roll-Modus · 11 Modelle verfügbar"
                                      : lang === "es"
                                        ? "Modo B-roll · 11 modelos disponibles"
                                        : "B-roll mode · 11 models available"}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={dialogMode}
                              onClick={async () => {
                                const next = !dialogMode;
                                const updates: Partial<ComposerScene> = { dialogMode: next };
                                let dbClipSource: ClipSource | undefined;
                                let dbClipQuality: ClipQuality | undefined;
                                // Snapshot previous engine + lipsync flag for rollback.
                                const prevEngine = scene.engineOverride ?? "auto";
                                const prevLipSync = scene.lipSyncWithVoiceover === true;
                                // When the user turns Dialog & Lip-Sync ON we MUST also
                                // route the scene through the Cinematic-Sync pipeline
                                // (Hailuo plate → Sync.so lipsync overlay) — otherwise
                                // `compose-video-clips` auto-routes single-speaker
                                // dialog scenes to HeyGen, which produces an isolated
                                // avatar bust instead of integrating the dialogue into
                                // the actual scene visual.
                                const nextEngine: ComposerScene["engineOverride"] = next
                                  ? "cinematic-sync"
                                  : prevEngine === "cinematic-sync"
                                    ? "auto"
                                    : prevEngine;
                                const nextLipSync = next ? true : false;
                                const engineChanged = nextEngine !== prevEngine;
                                const lipSyncChanged = nextLipSync !== prevLipSync;
                                if (engineChanged) updates.engineOverride = nextEngine;
                                if (lipSyncChanged) updates.lipSyncWithVoiceover = nextLipSync;
                                if (next) {
                                  const ok = (NATIVE_DIALOGUE_CLIP_SOURCES as ReadonlyArray<string>).includes(
                                    scene.clipSource,
                                  );
                                  if (!ok) {
                                    updates.clipSource = DIALOG_FALLBACK_CLIP_SOURCE;
                                    updates.clipQuality = DIALOG_FALLBACK_CLIP_QUALITY;
                                    dbClipSource = DIALOG_FALLBACK_CLIP_SOURCE;
                                    dbClipQuality = DIALOG_FALLBACK_CLIP_QUALITY;
                                    toast({
                                      title:
                                        lang === "de"
                                          ? "Modell auf HappyHorse 1.0 gewechselt"
                                          : lang === "es"
                                            ? "Modelo cambiado a HappyHorse 1.0"
                                            : "Switched to HappyHorse 1.0",
                                      description:
                                        lang === "de"
                                          ? "Für Dialog & Lip-Sync sind nur Kling 3, Veo 3.1 und HappyHorse 1.0 verfügbar. Günstigste Option vorausgewählt."
                                          : lang === "es"
                                            ? "Para diálogo y lip-sync solo están disponibles Kling 3, Veo 3.1 y HappyHorse 1.0. Se eligió la más económica."
                                            : "Dialog & lip-sync supports only Kling 3, Veo 3.1 and HappyHorse 1.0. Cheapest option preselected.",
                                    });
                                  }
                                }
                                // Optimistic local update.
                                onUpdate(updates);
                                // Mark pending so a racing realtime refetch or
                                // debounced scene-save can't revert any of the
                                // toggled fields before the DB commit lands.
                                markDialogModePending(scene.id, next);
                                if (lipSyncChanged) markLipSyncPending(scene.id, nextLipSync);
                                if (engineChanged) markEngineOverridePending(scene.id, nextEngine);
                                if (isUuid(scene.id)) {
                                  try {
                                    const payload: Record<string, unknown> = {
                                      dialog_mode: next,
                                    };
                                    if (engineChanged) payload.engine_override = nextEngine;
                                    if (lipSyncChanged) payload.lip_sync_with_voiceover = nextLipSync;
                                    if (dbClipSource) payload.clip_source = dbClipSource;
                                    if (dbClipQuality) payload.clip_quality = dbClipQuality;
                                    const { error } = await supabase
                                      .from("composer_scenes")
                                      .update(payload)
                                      .eq("id", scene.id);
                                    if (error) throw error;
                                  } catch (e) {
                                    console.warn(
                                      "[SceneCard] dialogMode toggle persist failed",
                                      e,
                                    );
                                    clearDialogModePending(scene.id);
                                    if (lipSyncChanged) clearLipSyncPending(scene.id);
                                    if (engineChanged) clearEngineOverridePending(scene.id);
                                    // Roll back local optimistic change.
                                    const rollback: Partial<ComposerScene> = { dialogMode: !next };
                                    if (engineChanged) rollback.engineOverride = prevEngine;
                                    if (lipSyncChanged) rollback.lipSyncWithVoiceover = prevLipSync;
                                    if (dbClipSource) rollback.clipSource = scene.clipSource;
                                    if (dbClipQuality) rollback.clipQuality = scene.clipQuality;
                                    onUpdate(rollback);
                                  }
                                }
                              }}
                              className={cn(
                                "relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors",
                                dialogMode
                                  ? "bg-amber-500/70 ring-1 ring-amber-300/60"
                                  : "bg-muted ring-1 ring-border",
                              )}
                            >
                              <span
                                className={cn(
                                  "inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform shadow-sm",
                                  dialogMode ? "translate-x-5" : "translate-x-0.5",
                                )}
                              />
                            </button>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">
                              {lang === "de"
                                ? dialogMode
                                  ? "KI-Modell · Dialog-fähig (3)"
                                  : "KI-Modell · Qualität & Preis im Dropdown"
                                : lang === "es"
                                  ? dialogMode
                                    ? "Modelo IA · con diálogo (3)"
                                    : "Modelo IA"
                                  : dialogMode
                                    ? "AI Model · dialog-capable (3)"
                                    : "AI Model"}
                            </Label>
                            <ModelSelector
                              value={currentModelId}
                              onChange={(modelId) => {
                                const next = modelIdToSource(modelId);
                                onUpdate({
                                  clipSource: next.clipSource,
                                  clipQuality: next.clipQuality,
                                });
                              }}
                              currency="EUR"
                              models={modelsForPicker}
                              className="h-11 bg-card/60 backdrop-blur-sm border-border/60 hover:border-primary/40 transition-colors text-xs"
                            />
                        {(() => {
                          const selectedModel = AI_VIDEO_TOOLKIT_MODELS.find(
                            (m) => m.id === currentModelId,
                          );
                          if (!selectedModel?.capabilities?.audio) return null;
                          const withAudio = scene.withAudio !== false;
                          const onLabel =
                            lang === "de"
                              ? "Mit Sound"
                              : lang === "es"
                                ? "Con sonido"
                                : "With sound";
                          const offLabel =
                            lang === "de"
                              ? "Ohne Sound"
                              : lang === "es"
                                ? "Sin sonido"
                                : "No sound";
                          const tooltip =
                            lang === "de"
                              ? "Natives KI-Audio aus dem Modell verwenden — sonst stumm."
                              : lang === "es"
                                ? "Usar audio nativo del modelo IA — si no, silenciado."
                                : "Use native AI audio from the model — otherwise muted.";
                          return (
                            <div
                              className="flex gap-1 mt-1.5 p-0.5 rounded-md bg-card/40 border border-border/40 w-fit"
                              title={tooltip}
                            >
                              <button
                                type="button"
                                onClick={() => onUpdate({ withAudio: true })}
                                className={`px-2 py-1 rounded text-[10px] font-medium transition-all flex items-center gap-1 ${
                                  withAudio
                                    ? "bg-primary/20 text-primary ring-1 ring-primary/40"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                <Volume2 className="h-2.5 w-2.5" />
                                {onLabel}
                              </button>
                              <button
                                type="button"
                                onClick={() => onUpdate({ withAudio: false })}
                                className={`px-2 py-1 rounded text-[10px] font-medium transition-all flex items-center gap-1 ${
                                  !withAudio
                                    ? "bg-muted text-foreground ring-1 ring-border"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                <VolumeX className="h-2.5 w-2.5" />
                                {offLabel}
                              </button>
                            </div>
                          );
                        })()}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* Effects badges — Phase 3: hidden behind "Mehr ▾" drawer. */}
              {secondaryOpen && scene.effects && scene.effects.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1">
                    <Wand2 className="h-2.5 w-2.5" />
                    Effekte
                  </span>
                  {scene.effects.map((eff, i) => (
                    <Badge
                      key={`${eff.id}-${i}`}
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 h-4 border-amber-500/30 bg-amber-500/5 text-amber-300/90"
                    >
                      {eff.id}
                    </Badge>
                  ))}
                </div>
              )}

              <SceneStudioSectionHeader tab="cast" language={lang} />
              {/* Character Cast picker (multi, max 4) — shown for any AI scene when the user has at least one avatar (briefing or library). */}
              {scene.clipSource.startsWith("ai-") &&
                ((characters && characters.length > 0) ||
                  libCharacters.length > 0 ||
                  brandLocations.length > 0 ||
                  brandBuildings.length > 0 ||
                  brandProps.length > 0 ||
                  catalogLocations.length > 0 ||
                  catalogBuildings.length > 0 ||
                  catalogProps.length > 0) && (
                  <>
                    <UnifiedAssetPicker
                      characters={characters ?? []}
                      libraryCharacters={libCharacters.map(
                        (c): ComposerCharacter => ({
                          id: c.id,
                          name: c.name,
                          appearance: c.description ?? "",
                          signatureItems: c.signature_items ?? "",
                          referenceImageUrl: c.reference_image_url ?? undefined,
                        }),
                      )}
                      onAddToBriefing={onAddCharacter}
                      cast={scene.characterShots}
                      legacyCast={scene.characterShot}
                      onCastChange={(next) => {
                        // Track explicitly-removed character IDs so the prompt→cast
                        // auto-sync below doesn't silently re-add them just because
                        // their name still appears in the scene prompt.
                        const prevIds = (scene.characterShots ?? []).map(
                          (s) => s.characterId,
                        );
                        const nextIds = new Set(next.map((s) => s.characterId));
                        const removedNow = prevIds.filter((id) => !nextIds.has(id));
                        const dismissedNext = Array.from(
                          new Set([
                            ...(scene.dismissedCharacterIds ?? []).filter(
                              (id) => !nextIds.has(id),
                            ),
                            ...removedNow,
                          ]),
                        );
                        // Resolve removed-character objects for name-based prompt scrubbing.
                        const removedChars = removedNow
                          .map((id) => characters?.find((c) => c.id === id))
                          .filter(
                            (c): c is NonNullable<typeof c> =>
                              !!c && !!c.name,
                          );
                        const updates: Partial<ComposerScene> = {
                          characterShots: next,
                          // Keep singular field in sync for backwards-compat (resolver, badge, lip-sync, render).
                          characterShot: next[0],
                          dismissedCharacterIds: dismissedNext,
                        };
                        // Scrub removed names from the dialog screenplay so the
                        // [Dialog] auto-marker can't re-introduce them on the
                        // next render pass.
                        if (removedChars.length && scene.dialogScript) {
                          const cleanedDialog = removeCharactersFromDialogScript(
                            scene.dialogScript,
                            removedChars,
                          );
                          if (cleanedDialog !== scene.dialogScript) {
                            updates.dialogScript = cleanedDialog;
                          }
                        }
                        if (promptMode === "structured") {
                          const subjectKey: keyof PromptSlots = "subject";
                          const currentSubject =
                            (promptSlots[subjectKey] as string) || "";
                          const scrubbedSubject = removeCharactersFromPrompt(
                            currentSubject,
                            removedChars,
                          );
                          const newSubject = applyCastToPrompt(
                            scrubbedSubject,
                            next,
                            characters,
                            lang,
                          );
                          const nextSlots: PromptSlots = {
                            ...promptSlots,
                            [subjectKey]: newSubject,
                          };
                          updates.promptSlots = nextSlots;
                          updates.aiPrompt = stitchSlots(
                            nextSlots,
                            promptSlotOrder,
                          );
                        } else {
                          const scrubbedPrompt = removeCharactersFromPrompt(
                            scene.aiPrompt || "",
                            removedChars,
                          );
                          updates.aiPrompt = applyCastToPrompt(
                            scrubbedPrompt,
                            next,
                            characters,
                            lang,
                          );
                        }
                        onUpdate(updates);
                      }}
                      locations={mergeWithCatalog(
                        brandLocations.map((l) => ({
                          id: l.id,
                          name: l.name,
                          reference_image_url: l.reference_image_url,
                        })),
                        catalogLocations.map((c) => ({
                          id: c.id,
                          name: c.name,
                          reference_image_url: c.reference_image_url,
                        })),
                      )}
                      buildings={mergeWithCatalog(
                        brandBuildings.map((b) => ({
                          id: b.id,
                          name: b.name,
                          reference_image_url: b.reference_image_url,
                        })),
                        catalogBuildings.map((c) => ({
                          id: c.id,
                          name: c.name,
                          reference_image_url: c.reference_image_url,
                        })),
                      )}
                      props={mergeWithCatalog(
                        brandProps.map((p) => ({
                          id: p.id,
                          name: p.name,
                          reference_image_url: p.reference_image_url,
                        })),
                        catalogProps.map((c) => ({
                          id: c.id,
                          name: c.name,
                          reference_image_url: c.reference_image_url,
                        })),
                      )}
                      prompt={
                        promptMode === "structured"
                          ? (promptSlots.subject as string) || ""
                          : scene.aiPrompt || ""
                      }
                      onPromptChange={(nextPrompt) => {
                        if (promptMode === "structured") {
                          const nextSlots: PromptSlots = {
                            ...promptSlots,
                            subject: nextPrompt,
                          };
                          onUpdate({
                            promptSlots: nextSlots,
                            aiPrompt: stitchSlots(nextSlots, promptSlotOrder),
                          });
                        } else {
                          onUpdate({ aiPrompt: nextPrompt });
                        }
                      }}
                      language={lang as "en" | "de" | "es"}
                    />

                    {/* Trigger: open the per-scene Script/Dialog Studio. Available from 1 cast member upwards. */}
                    {(() => {
                      const sceneCastCount =
                        (scene.characterShots?.length ?? 0) ||
                        (scene.characterShot ? 1 : 0);
                       if (sceneCastCount < 1) return null;
                       if (scene.dialogMode !== true) return null;
                      const hasScript = Boolean(
                        (scene.dialogScript ?? "").trim(),
                      );
                      const lineCount = hasScript
                        ? (scene.dialogScript ?? "")
                            .split(/\r?\n/)
                            .filter((l) =>
                              /^\s*[A-Za-zÀ-ÿ][^\n]{0,40}\s*[:—-]\s*\S/.test(l),
                            ).length
                        : 0;
                      const label =
                        lang === "de"
                          ? "Skript schreiben"
                          : lang === "es"
                            ? "Escribir guion"
                            : "Write script";
                      const lineLbl = (n: number) =>
                        lang === "de"
                          ? `${n} Zeile${n === 1 ? "" : "n"}`
                          : lang === "es"
                            ? `${n} línea${n === 1 ? "" : "s"}`
                            : `${n} line${n === 1 ? "" : "s"}`;
                      return (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px] gap-1.5 self-start text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setDialogStudioOpen((v) => {
                              const next = !v;
                              if (next) {
                                setTimeout(() => {
                                  dialogStudioRef.current?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "center",
                                  });
                                }, 50);
                              }
                              return next;
                            });
                          }}
                        >
                          <MessageSquareQuote className="h-3 w-3" />
                          {label}
                          {hasScript && lineCount > 0 && (
                            <span className="text-[10px] opacity-70">
                              · {lineLbl(lineCount)}
                            </span>
                          )}
                        </Button>
                      );
                    })()}
                  </>
                )}


              {/* Phase 2 — Performance Layer (Mimik/Gestik/Blick/Energy).
                  Sits between Cast and Audio. Lip-sync safe — never touches
                  audioPlan or compose-dialog-segments. */}
              {scene.clipSource.startsWith("ai-") && characters && characters.length > 0 && (
                <>
                  <SceneStudioSectionHeader tab="performance" language={lang} />
                  <ScenePerformancePanel
                    scene={scene}
                    characters={characters}
                    language={lang}
                    onUpdate={onUpdate}
                  />
                </>
              )}

              <SceneStudioSectionHeader tab="audio" language={lang} />

              {/* Scene Dialog Studio — write a screenplay; auto-spawn shot-reverse-shot lip-sync clips. */}
              {scene.clipSource.startsWith("ai-") && characters && scene.dialogMode === true && (
                <SceneDialogStudio
                  ref={dialogStudioRef}
                  open={dialogStudioOpen}
                  onClose={() => setDialogStudioOpen(false)}
                  scene={scene}
                  cast={
                    scene.characterShots ??
                    (scene.characterShot ? [scene.characterShot] : [])
                  }
                  characters={characters}
                  projectId={projectId}
                  language={lang}
                  onUpdate={onUpdate}
                  onAddScene={onAddScene}
                  onInsertScenesAfter={onInsertScenesAfter}
                  onEnsurePersisted={onEnsurePersisted}
                  autoSplitOnMount={autoSplitArmed}
                  onAutoSplitConsumed={() => setAutoSplitArmed(false)}
                />
              )}

              {/* v20.1 — Lip-Sync Aktionen Toolbar.
                  Always visible when ANY lipsync artifact exists, regardless
                  of the "Mehr ▾" collapse state. Lives in the AUDIO block
                  next to SceneDialogStudio so the buttons are where users
                  expect them after a dialog-shot render. */}
              {(scene.lipSyncAppliedAt ||
                !!scene.lipSyncStatus ||
                !!(scene as any).dialogShots ||
                !!(scene as any).twoshotStage ||
                scene.engineOverride === "cinematic-sync") && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5">
                  <span className="text-[10px] font-semibold text-primary mr-auto">
                    🎙️ Lip-Sync Aktionen
                  </span>
                  <button
                    type="button"
                    disabled={scene.lipSyncStatus === "running"}
                    onClick={async () => {
                      try {
                        await cleanRestartLipSync({ force: true });
                      } catch (e) {
                        console.warn("[SceneCard] re-sync failed", e);
                        toast({
                          title: "Lip-Sync fehlgeschlagen",
                          description: (e as any)?.message ?? "Unbekannter Fehler",
                          variant: "destructive",
                        });
                      }
                    }}
                    className="text-[10px] px-2 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
                  >
                    🔁 Lip-Sync neu rendern
                  </button>
                  <button
                    type="button"
                    title="Setzt den Lipsync-Eintrag komplett zurück (löscht dialog_shots, clip_url, alle Status-Flags). Beendet auch laufende Sync.so-Jobs und stoppt Auto-Retry-Loops. Keine neuen Credits."
                    onClick={async () => {
                      if (
                        !confirm(
                          "Lipsync-Eintrag wirklich komplett löschen?\n\nDas stoppt laufende Sync.so-Jobs, entfernt alle Dialog-Shots und setzt die Szene zurück auf 'pending'. Du kannst danach sauber von vorne anfangen.",
                        )
                      )
                        return;
                      try {
                        await supabase.functions
                          .invoke("cancel-dialog-lipsync", {
                            body: { scene_id: scene.id, reset: true },
                          })
                          .catch(() => {});
                        await supabase
                          .from("composer_scenes")
                          .update({
                            lip_sync_status: null,
                            lip_sync_applied_at: null,
                            lip_sync_source_clip_url: null,
                            twoshot_stage: null,
                            clip_error: null,
                            dialog_shots: null,
                            clip_url: null,
                            clip_status: "pending",
                            reference_image_url: null,
                            replicate_prediction_id: null,
                            updated_at: new Date().toISOString(),
                          })
                          .eq("id", scene.id);
                        onUpdate({
                          lipSyncStatus: null as any,
                          lipSyncAppliedAt: null as any,
                          clipUrl: undefined,
                          clipStatus: "pending",
                          referenceImageUrl: undefined,
                        });
                        toast({
                          title: "Lipsync-Eintrag gelöscht",
                          description:
                            "Szene ist sauber zurückgesetzt — keine alten Daten oder Loops mehr aktiv.",
                        });
                      } catch (e) {
                        console.warn("[SceneCard] hard reset failed", e);
                        toast({
                          title: "Löschen fehlgeschlagen",
                          description:
                            (e as any)?.message ?? "Unbekannter Fehler",
                          variant: "destructive",
                        });
                      }
                    }}
                    className="text-[10px] px-2 py-1 rounded border border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    🗑 Lipsync komplett zurücksetzen
                  </button>
                  {scene.engineOverride === "cinematic-sync" && (
                    <button
                      type="button"
                      disabled={
                        scene.clipStatus === "generating" ||
                        scene.lipSyncStatus === "running"
                      }
                      title="Setzt Anchor + Clip zurück und rendert beides neu — empfohlen bei 'source_clip_missing_speakers' oder 'anchor_missing_speakers'."
                      onClick={async () => {
                        // ── Schritt 1: Cost-Confirm-Gate (re-roll) ──────
                        const passes = scene.dialogVoices
                          ? Object.keys(scene.dialogVoices).length
                          : 1;
                        const ok = await confirmRender({
                          scenes: [scene],
                          passes,
                          title: 'Clip + Lip-Sync neu rendern?',
                          description:
                            'Anchor und Clip werden zurückgesetzt und beides neu generiert. Credits werden erneut verbraucht.',
                        });
                        if (!ok) return;
                        try {
                          const prevPlan = ((scene as any).audioPlan ??
                            {}) as Record<string, any>;
                          const prevTwoshot = (prevPlan.twoshot ??
                            {}) as Record<string, any>;
                          const {
                            faceMap: _faceMap,
                            syncJobs: _syncJobs,
                            heartbeat: _heartbeat,
                            anchor_face_audit: _anchorAudit,
                            ...twoshotWithoutAnchorState
                          } = prevTwoshot;
                          const resetAudioPlan = {
                            ...prevPlan,
                            twoshot: twoshotWithoutAnchorState,
                          };
                          await supabase
                            .from("composer_scenes")
                            .update({
                              reference_image_url: null,
                              clip_url: null,
                              clip_status: "pending",
                              clip_error: null,
                              lip_sync_status: null,
                              lip_sync_applied_at: null,
                              lip_sync_source_clip_url: null,
                              twoshot_stage: null,
                              replicate_prediction_id: null,
                              audio_plan: resetAudioPlan,
                              updated_at: new Date().toISOString(),
                            })
                            .eq("id", scene.id);
                          onUpdate({
                            referenceImageUrl: undefined,
                            clipUrl: undefined,
                            clipStatus: "pending",
                            lipSyncStatus: null as any,
                            lipSyncAppliedAt: null as any,
                          });
                          const { error } = await supabase.functions.invoke(
                            "compose-video-clips",
                            {
                              body: {
                                projectId: scene.projectId,
                                scenes: [
                                  {
                                    id: scene.id,
                                    clipSource: scene.clipSource,
                                    clipQuality:
                                      scene.clipQuality || "standard",
                                    aiPrompt: scene.aiPrompt,
                                    durationSeconds: scene.durationSeconds,
                                    characterShot: scene.characterShot,
                                    characterShots: scene.characterShots,
                                    dialogScript: scene.dialogScript,
                                    dialogVoices: scene.dialogVoices,
                                    engineOverride: "cinematic-sync",
                                    withAudio: scene.withAudio !== false,
                                  },
                                ],
                                characters,
                              },
                            },
                          );
                          if (error) throw error;
                        } catch (e) {
                          console.warn(
                            "[SceneCard] re-roll clip + lipsync failed",
                            e,
                          );
                          onUpdate({ clipStatus: "failed" as any });
                        }
                      }}
                      className="text-[10px] px-2 py-1 rounded border border-amber-400/40 text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
                    >
                      🎥 Clip + Lip-Sync neu rendern
                    </button>
                  )}
                </div>
              )}



              {/* Director Console — read-only Live Prompt + Audio Plan timeline.
                Always derived from `scene.audioPlan` + structured slots, never
                writes back, so the locked Audio Plan is structurally immune to
                useEffect-style overwrites. */}
              {/* DirectorConsolePreview moved into ScenePromptDetailsSheet
                (Phase 1 Studio-Set v2). DirectorQualityCoach stays inline; it
                will be folded into a status bar in Phase 3. */}
              {scene.clipSource.startsWith("ai-") && (
                <DirectorQualityCoach
                  scene={scene}
                  characters={characters}
                  language={lang}
                  className="mt-2"
                />
              )}


              {/* Split confirmation dialog — fired by the amber multi-speaker badge above. */}
              <AlertDialog
                open={splitConfirmOpen}
                onOpenChange={setSplitConfirmOpen}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {(() => {
                        const speakerLines = (scene.dialogScript ?? "")
                          .split("\n")
                          .map((l) =>
                            l
                              .match(
                                /^\s*\[?([A-Za-zÀ-ÿ][\w\s.'-]{1,40}?)\]?\s*[:：]/,
                              )?.[1]
                              ?.trim()
                              .toLowerCase(),
                          )
                          .filter(Boolean) as string[];
                        const n = Math.max(2, new Set(speakerLines).size);
                        return lang === "de"
                          ? `Szene in ${n} Einzel-Szenen aufteilen?`
                          : lang === "es"
                            ? `¿Dividir la escena en ${n} subescenas?`
                            : `Split scene into ${n} sub-scenes?`;
                      })()}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {(() => {
                        const speakerLines = (scene.dialogScript ?? "")
                          .split("\n")
                          .map((l) =>
                            l
                              .match(
                                /^\s*\[?([A-Za-zÀ-ÿ][\w\s.'-]{1,40}?)\]?\s*[:：]/,
                              )?.[1]
                              ?.trim()
                              .toLowerCase(),
                          )
                          .filter(Boolean) as string[];
                        const n = Math.max(2, new Set(speakerLines).size);
                        const eur = estimateHeygenCostEur(n).toFixed(2);
                        return lang === "de"
                          ? `Pro Sprecher entsteht ein eigener HeyGen-Lip-Sync-Clip im Storyboard. Die aktuelle Szene bleibt als Wrapper bestehen. Geschätzte Kosten: €${eur}.`
                          : lang === "es"
                            ? `Cada hablante recibirá su propio clip HeyGen lip-sync en el storyboard. Coste estimado: €${eur}.`
                            : `Each speaker becomes its own HeyGen lip-sync clip in the storyboard. Estimated cost: €${eur}.`;
                      })()}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      {lang === "de"
                        ? "Abbrechen"
                        : lang === "es"
                          ? "Cancelar"
                          : "Cancel"}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        setDialogStudioOpen(true);
                        setAutoSplitArmed(true);
                        setTimeout(
                          () =>
                            dialogStudioRef.current?.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            }),
                          80,
                        );
                      }}
                    >
                      {lang === "de"
                        ? "Splitten & generieren"
                        : lang === "es"
                          ? "Dividir y generar"
                          : "Split & generate"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Scene-Aware Character Anchor — Phase 3: hidden behind "Mehr ▾". */}
              {secondaryOpen &&
                scene.clipSource.startsWith("ai-") &&
                (() => {
                  const anchor = resolveSceneCharacterAnchor(
                    scene,
                    characters,
                    activeBrandChar,
                  );
                  if (!anchor) return null;
                  const labels: Record<
                    string,
                    { de: string; cost: string; tone: string }
                  > = {
                    "first-frame-direct": {
                      de: "Anker: Porträt direkt",
                      cost: "0,00€",
                      tone: "border-amber-500/40 bg-amber-500/10 text-amber-200",
                    },
                    "first-frame-composed": {
                      de: "Anker: In Szene komponiert",
                      cost: "~0,02€",
                      tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
                    },
                    "subject-reference": {
                      de: "Anker: Subject-Reference",
                      cost: "0,00€",
                      tone: "border-cyan-500/40 bg-cyan-500/10 text-cyan-200",
                    },
                    "text-only": {
                      de: "Identität nur über Text",
                      cost: "0,00€",
                      tone: "border-border bg-muted/30 text-muted-foreground",
                    },
                  };
                  const meta = labels[anchor.strategy];
                  return (
                    <div
                      className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 ${meta.tone}`}
                    >
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold">
                          {meta.de} · {anchor.name}
                        </span>
                        <span className="text-[9px] opacity-80">
                          {anchor.strategy === "first-frame-composed"
                            ? "Charakter wird in die Szenen-Komposition gerendert (Nano Banana 2)"
                            : anchor.strategy === "first-frame-direct"
                              ? "Porträt wird als erstes Bild gesetzt — Modell startet mit Gesicht"
                              : anchor.strategy === "subject-reference"
                                ? "Porträt geht in den Reference-Slot — keine Komposition-Sperre"
                                : "Kein Bild-Anker, Identität bleibt im Text-Prompt"}
                          {" · "}
                          {meta.cost}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdate({
                            forcePortraitAsFirstFrame:
                              !scene.forcePortraitAsFirstFrame,
                          })
                        }
                        title="Porträt direkt als erstes Bild verwenden (face-lock)"
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all whitespace-nowrap ${
                          scene.forcePortraitAsFirstFrame
                            ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40"
                            : "text-muted-foreground hover:text-foreground border border-border"
                        }`}
                      >
                        Face-Lock{" "}
                        {scene.forcePortraitAsFirstFrame ? "AN" : "AUS"}
                      </button>
                    </div>
                  );
                })()}

              {/* Stage A — World Refs badge + per-scene opt-out.
                  Counts come from the prompt mentions + UnifiedAssetPicker slugs
                  via the same resolver the pipeline uses, so the badge
                  reflects exactly what Nano Banana 2 will receive. */}
              {secondaryOpen &&
                scene.clipSource.startsWith("ai-") &&
                (() => {
                  const refs = resolveSceneWorldRefs(scene, libLocations);
                  const counts = {
                    loc: refs.filter((r) => r.kind === "location").length,
                    bld: refs.filter((r) => r.kind === "building").length,
                    prop: refs.filter((r) => r.kind === "prop").length,
                  };
                  const total = counts.loc + counts.bld + counts.prop;
                  if (total === 0 && !scene.ignoreWorldRefs) return null;
                  const ignored = scene.ignoreWorldRefs === true;
                  return (
                    <div
                      className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 ${
                        ignored
                          ? "border-border bg-muted/30 text-muted-foreground"
                          : "border-cyan-500/40 bg-cyan-500/10 text-cyan-200"
                      }`}
                      title="Welche World-Assets fließen als Bild-Referenz in die Szenen-Komposition (Nano Banana 2)?"
                    >
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold">
                          {ignored
                            ? "World-Refs: aus"
                            : `World-Refs: 📍×${counts.loc} 🏛️×${counts.bld} 📦×${counts.prop}`}
                        </span>
                        <span className="text-[9px] opacity-80">
                          {ignored
                            ? "Locations / Buildings / Props nur als Text — keine Bild-Referenz"
                            : "Diese World-Assets werden in die Szenen-Komposition gerendert"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdate({ ignoreWorldRefs: !ignored })
                        }
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all whitespace-nowrap ${
                          ignored
                            ? "text-muted-foreground hover:text-foreground border border-border"
                            : "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40"
                        }`}
                      >
                        {ignored ? "Aktivieren" : "Ignorieren"}
                      </button>
                    </div>
                  );
                })()}

              {/* Lip-Sync toggle — Phase 3: hidden behind "Mehr ▾". */}
              {secondaryOpen &&
                scene.clipSource.startsWith("ai-") &&
                (scene.characterShot?.shotType ?? "absent") !== "absent" && (
                  <div className="flex flex-col gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold text-primary flex items-center gap-1">
                          🎙️ Lip-Sync zum Voiceover
                          <span
                            className="px-1 py-0.5 rounded bg-amber-400/20 text-amber-200 text-[8px] font-bold ring-1 ring-amber-400/30"
                            title="Sync.so lipsync-2-pro — Artlist-grade fidelity, identity-locked, kein Face-Morph"
                          >
                            PRO
                          </span>
                          {scene.lipSyncAppliedAt && (
                            <span className="px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[8px] font-bold">
                              SYNCED
                            </span>
                          )}
                          {scene.lipSyncStatus === "running" && (
                            <span className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[8px] font-bold animate-pulse">
                              SYNCING…
                            </span>
                          )}
                          {scene.lipSyncStatus === "failed" && (
                            <span className="px-1 py-0.5 rounded bg-red-500/20 text-red-300 text-[8px] font-bold">
                              FAILED
                            </span>
                          )}
                          {scene.lipSyncStatus === "no_voiceover" && (
                            <span className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[8px] font-bold">
                              VO FEHLT
                            </span>
                          )}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          {scene.lipSyncAppliedAt
                            ? "Charakter spricht wortgenau · lipsync-2-pro · ~14 Credits"
                            : "Auto: Sync.so lipsync-2-pro nach Generate (~14 Credits, Artlist-Qualität)"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const next = !scene.lipSyncWithVoiceover;
                          // Optimistic local update so the toggle flips immediately.
                          onUpdate({ lipSyncWithVoiceover: next });
                          // Record the intent so a racing realtime refetch
                          // (triggered by an unrelated column update) can't
                          // revert the toggle before the DB commit lands.
                          markLipSyncPending(scene.id, next);
                          if (isUuid(scene.id)) {
                            try {
                              const { error } = await supabase
                                .from("composer_scenes")
                                .update({ lip_sync_with_voiceover: next })
                                .eq("id", scene.id);
                              if (error) throw error;
                            } catch (e) {
                              console.warn(
                                "[SceneCard] lip-sync toggle persist failed",
                                e,
                              );
                              clearLipSyncPending(scene.id);
                              onUpdate({ lipSyncWithVoiceover: !next });
                            }
                          }
                        }}
                        disabled={scene.lipSyncStatus === "running"}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all disabled:opacity-50 ${
                          scene.lipSyncWithVoiceover
                            ? "bg-primary/20 text-primary ring-1 ring-primary/40"
                            : "text-muted-foreground hover:text-foreground border border-border"
                        }`}
                      >
                        {scene.lipSyncWithVoiceover ? "AN" : "AUS"}
                      </button>
                    </div>
                    {/* v18: Cancel button — visible while lip-sync is in flight so the
                        user can abort a stuck run cleanly without leaving a zombie
                        entry that the auto-trigger would keep reviving. */}
                    {!scene.lipSyncAppliedAt &&
                      (scene.lipSyncStatus === "running" ||
                        scene.lipSyncStatus === "stitching" ||
                        (scene.lipSyncStatus as any) === "audio_muxing" ||
                        scene.lipSyncStatus === "pending" ||
                        // v20: also show during the brief "failed" window
                        // before useTwoShotAutoTrigger auto-recovers — lets
                        // the user opt out of the auto-retry loop entirely.
                        scene.lipSyncStatus === "failed" ||
                        (!!(scene as any).twoshotStage &&
                          !["failed", "done", "complete"].includes(
                            String((scene as any).twoshotStage),
                          ))) && (
                        <div className="flex flex-wrap items-center gap-2 self-end">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                // Optimistic local update so the spinner stops immediately.
                                onUpdate({
                                  lipSyncStatus: "canceled" as any,
                                  twoshotStage: null as any,
                                });
                                const { error } = await supabase.functions.invoke(
                                  "cancel-dialog-lipsync",
                                  { body: { scene_id: scene.id, reset: true } },
                                );
                                if (error) throw error;
                                toast({
                                  title: "Lip-Sync abgebrochen",
                                  description:
                                    "Du kannst jetzt sauber neu starten — keine alten Einträge bleiben.",
                                });
                              } catch (e) {
                                console.warn("[SceneCard] cancel lipsync failed", e);
                                toast({
                                  title: "Abbruch fehlgeschlagen",
                                  description: (e as any)?.message ?? "Unbekannter Fehler",
                                  variant: "destructive",
                                });
                              }
                            }}
                            className="text-[9px] text-destructive hover:underline"
                          >
                            ✕ Lip-Sync abbrechen
                          </button>
                        </div>
                      )}
                    {/* v20.1: Reset/Re-render buttons moved out of this gated
                        block (secondaryOpen + clipSource ai-* + shotType !==
                        absent) into the always-visible Lip-Sync Actions
                        toolbar rendered directly under <SceneDialogStudio>
                        in the AUDIO block. They were unreachable here for
                        dialog/cinematic-sync scenes because "Mehr ▾" was
                        almost always collapsed. */}

                  </div>
                )}
              {scene.clipSource.startsWith("ai-") && (
                <div className="space-y-2">
                  <SceneDirectorBox
                    scene={scene}
                    lang={lang as "en" | "de" | "es"}
                    characters={characters}
                    libraryCharacters={libCharacters.map((c) => ({
                      id: c.id,
                      name: c.name,
                      description: c.description ?? null,
                      reference_image_url: c.reference_image_url ?? undefined,
                    }))}
                    locations={brandLocations.map((l) => ({
                      id: l.id,
                      name: l.name,
                      description: l.description ?? null,
                      reference_image_url: l.reference_image_url,
                    }))}
                    buildings={brandBuildings.map((b) => ({
                      id: b.id,
                      name: b.name,
                      description: b.description ?? null,
                      reference_image_url: b.reference_image_url,
                    }))}
                    props={brandProps.map((p) => ({
                      id: p.id,
                      name: p.name,
                      description: p.description ?? null,
                      reference_image_url: p.reference_image_url,
                    }))}
                    onAddCharacter={onAddCharacter}
                    realismPreset={scene.realismPreset}
                    onApply={({ aiPrompt, dialogScript, characterShots, actionBeat, sceneActionUser, sceneActionEn, characterActions }) => {
                      const updates: Partial<ComposerScene> = { aiPrompt };
                      if (dialogScript !== undefined)
                        updates.dialogScript = dialogScript;
                      // Merge per-character actions into the cast slots BEFORE
                      // we write `characterShots` to the scene so they land in
                      // the same update. Director run is an explicit user
                      // action → it overwrites previous slot actions.
                      if (characterShots && characterShots.length > 0) {
                        const actionById = new Map(
                          (characterActions ?? []).map((a) => [a.characterId, a]),
                        );
                        const withActions = characterShots.map((s) => {
                          const a = actionById.get(s.characterId);
                          if (!a) return s;
                          return {
                            ...s,
                            actionUser: a.actionUser || s.actionUser,
                            actionEn: a.actionEn || s.actionEn,
                          };
                        });
                        updates.characterShots = withActions;
                        updates.characterShot = withActions[0];
                        // Storyboard delivered a fresh cast → clear the dismissal blocklist.
                        updates.dismissedCharacterIds = [];
                      }
                      if (actionBeat) {
                        updates.actionBeat = actionBeat;
                      }
                      if (sceneActionUser !== undefined) {
                        updates.sceneActionUser = sceneActionUser;
                      }
                      if (sceneActionEn !== undefined) {
                        updates.sceneActionEn = sceneActionEn;
                      }
                      if (promptMode === "structured") {
                        // Drop back to free mode so the user sees the new prompt verbatim.
                        updates.promptMode = "free";
                      }
                      onUpdate(updates);
                    }}
                    onInsertFollowups={
                      onInsertScenesAfter
                        ? (descriptions) => {
                            onInsertScenesAfter(
                              scene.id,
                              descriptions.map((d) => ({
                                sceneType: scene.sceneType,
                                durationSeconds: scene.durationSeconds,
                                clipSource: scene.clipSource,
                                clipQuality: scene.clipQuality,
                                // Seed the new scene's prompt with the suggestion so the user can
                                // refine or re-run the Scene Director on it immediately.
                                aiPrompt: d,
                              })),
                            );
                          }
                        : undefined
                    }
                  />
                </div>
              )}
              {scene.clipSource.startsWith("ai-") && (
                <div className="space-y-2">
                  {/* Scene-Action override — user types in UI language, auto-EN
                      is injected into the prompt's [SceneAction] marker block. */}
                  <SceneActionField
                    language={lang}
                    label={
                      lang === "de"
                        ? "Was passiert in der Szene? (überstimmt Director)"
                        : lang === "es"
                          ? "¿Qué pasa en la escena? (anula al Director)"
                          : "What happens in the scene? (overrides Director)"
                    }
                    placeholder={
                      lang === "de"
                        ? "z. B. Vier Social-Media-Manager arbeiten parallel in einem hellen Open-Space-Büro"
                        : lang === "es"
                          ? "p. ej. Cuatro community managers trabajan en paralelo en una oficina luminosa"
                          : "e.g. Four social-media managers working in parallel inside a bright open-space office"
                    }
                    value={scene.sceneActionUser ?? ""}
                    englishValue={scene.sceneActionEn ?? ""}
                    onChange={(v) => onUpdate({ sceneActionUser: v })}
                    onEnglishChange={(en) => onUpdate({ sceneActionEn: en })}
                    rows={2}
                  />
                  <div className="space-y-1.5">

                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-[10px] text-muted-foreground">
                        {lang === "de"
                          ? "KI-Prompt (EN) — bearbeitbar"
                          : lang === "es"
                            ? "Prompt IA (EN) — editable"
                            : "AI Prompt (EN) — editable"}
                      </Label>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 px-2 text-[9px] gap-1 text-primary/80 hover:text-primary"
                        onClick={togglePromptMode}
                        title={`${lang === "de" ? "Modus wechseln" : lang === "es" ? "Cambiar modo" : "Switch mode"} (${shortcutLabel})`}
                      >
                        {promptMode === "free"
                          ? lang === "de"
                            ? "🧱 Strukturiert"
                            : lang === "es"
                              ? "🧱 Estructurado"
                              : "🧱 Structured"
                          : lang === "de"
                            ? "📝 Freitext"
                            : lang === "es"
                              ? "📝 Texto libre"
                              : "📝 Free text"}
                      </Button>
                    </div>

                    {promptMode === "free" ? (
                      <>
                        <PromptMentionEditor
                          value={scene.aiPrompt || ""}
                          onChange={(v) => onUpdate({ aiPrompt: v })}
                          placeholder={
                            lang === "de"
                              ? "Describe the scene… nutze @charakter und @location aus deiner Library"
                              : lang === "es"
                                ? "Describe la escena… usa @personaje y @ubicación de tu biblioteca"
                                : "Describe the scene visually… use @character and @location from your library"
                          }
                          rows={6}
                        />
                        <div className="flex items-center justify-between gap-2 pl-1">
                          <p className="text-[10px] leading-relaxed text-muted-foreground/80 italic flex-1">
                            {lang === "de"
                              ? 'ℹ️ Tippe @ um Charaktere & Locations zu taggen. Untertitel werden automatisch ausgeschlossen — füge sie im Tab „Voiceover & Untertitel" hinzu.'
                              : lang === "es"
                                ? 'ℹ️ Escribe @ para etiquetar personajes y ubicaciones. Los subtítulos se excluyen automáticamente — añádelos en la pestaña "Voz y subtítulos".'
                                : 'ℹ️ Type @ to tag characters & locations. Subtitles are automatically excluded — add them in the "Voice & Subtitles" tab.'}
                          </p>
                          {(() => {
                            const perfEntries = derivePerformanceEntries(scene, characters ?? []);
                            const total = perfEntries.length;
                            const directed = countDirectedPerformances(perfEntries);
                            if (total === 0) return null;
                            const label =
                              lang === 'de' ? 'Cast direktiert'
                              : lang === 'es' ? 'reparto dirigido'
                              : 'cast directed';
                            const tone = directed === 0 ? 'text-muted-foreground/60 hover:text-primary' : 'text-primary/80 hover:text-primary';
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  const root = document.getElementById(`scene-card-${scene.id || index}`);
                                  root?.querySelector('[data-studio-section="performance"]')
                                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }}
                                className={`shrink-0 inline-flex items-center gap-1 text-[10px] tabular-nums ${tone} transition-colors`}
                                title={
                                  lang === 'de'
                                    ? 'Mimik, Gestik, Blick und Energy pro Charakter setzen'
                                    : lang === 'es'
                                      ? 'Define expresión, gesto, mirada y energía por personaje'
                                      : 'Set expression, gesture, gaze and energy per character'
                                }
                              >
                                🎭 {directed}/{total} {label}
                              </button>
                            );
                          })()}

                          {(() => {
                            const chars = (scene.aiPrompt || '').length;
                            const tone =
                              chars === 0
                                ? 'text-muted-foreground/50'
                                : chars < 35
                                  ? 'text-rose-300/80'
                                  : chars <= 900
                                    ? 'text-emerald-300/80'
                                    : chars <= 1400
                                      ? 'text-amber-300/80'
                                      : 'text-rose-300/80';
                            const label =
                              chars === 0
                                ? lang === 'de' ? 'leer' : lang === 'es' ? 'vacío' : 'empty'
                                : chars < 35
                                  ? lang === 'de' ? 'zu kurz' : lang === 'es' ? 'muy corto' : 'too short'
                                  : chars <= 900
                                    ? lang === 'de' ? 'safe' : lang === 'es' ? 'seguro' : 'safe'
                                    : chars <= 1400
                                      ? lang === 'de' ? 'grenzwertig' : lang === 'es' ? 'al límite' : 'borderline'
                                      : lang === 'de' ? 'Provider kürzt evtl.' : lang === 'es' ? 'puede recortarse' : 'may be trimmed';
                            return (
                              <span
                                className={`shrink-0 font-mono text-[10px] tabular-nums ${tone}`}
                                title={
                                  lang === 'de'
                                    ? `Hailuo/Kling ~512 Token sweet-spot; ab 1200+ ignorieren i2v-Modelle hintere Layer`
                                    : lang === 'es'
                                      ? `Hailuo/Kling ~512 tokens sweet-spot; >1200 los modelos ignoran capas finales`
                                      : `Hailuo/Kling sweet-spot ~512 tokens; >1200 chars and i2v models drop trailing layers`
                                }
                              >
                                ~{chars} · {label}
                              </span>
                            );
                          })()}
                        </div>

                      </>
                    ) : (
                      <StructuredPromptBuilder
                        slots={promptSlots}
                        onChange={handleSlotsChange}
                        clipSource={scene.clipSource}
                        contextHint={scene.aiPrompt}
                        composedPrompt={stitchSlots(
                          promptSlots,
                          promptSlotOrder,
                        )}
                        language={lang}
                        order={promptSlotOrder}
                        onOrderChange={handleOrderChange}
                        onOpenStylePresets={() => setStylePickerOpen(true)}
                        onSavePreset={() => setStylePickerOpen(true)}
                        onInspireMe={inspiring ? undefined : handleInspireMe}
                      />
                    )}
                  </div>

                  {/* Phase 1 (Studio Set v2) — single "Prompt-Details" button
                    replaces the former Erweitert toggle + inline Multi-Engine
                    + inline Compare-Lab + inline Final-Prompt-Preview triplet.
                    Everything now lives inside ScenePromptDetailsSheet so the
                    customer sees the prompt textarea exactly once. */}
                  {(scene.aiPrompt?.trim() || hasAnySlot(promptSlots)) && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setPromptDetailsOpen(true)}
                        className="h-6 px-2 text-[10px] gap-1 text-primary/70 hover:text-primary"
                      >
                        <Sparkles className="h-3 w-3" />
                        {lang === "de"
                          ? "Prompt-Details ansehen"
                          : lang === "es"
                            ? "Ver detalles del prompt"
                            : "View prompt details"}
                      </Button>
                    </div>
                  )}

                  <StylePresetPicker
                    open={stylePickerOpen}
                    onOpenChange={setStylePickerOpen}
                    currentSlots={promptSlots}
                    currentModifiers={scene.directorModifiers || {}}
                    onApply={(preset) => {
                      onUpdate({
                        promptMode: "structured",
                        promptSlots: preset.slots,
                        directorModifiers: preset.director_modifiers,
                        appliedStylePresetId: preset.id,
                        aiPrompt: stitchSlots(preset.slots, promptSlotOrder),
                      });
                    }}
                    language={lang}
                  />

                  {/* Phase 2 (Studio Set v2) — single chip + "Stil ändern"
                    button replaces the previous trio of always-visible style
                    tools (DirectorPresetPicker + CinematicStylePresets +
                    SceneShotDirectorPanel). They now live behind
                    SceneStyleSheet (3 tabs). */}
                  <div className="flex flex-wrap items-center gap-2">
                    <SceneStyleChip
                      language={lang}
                      shotDirector={scene.shotDirector}
                      hasModifiers={
                        Object.keys(scene.directorModifiers || {}).length > 0
                      }
                      onOpen={() => setStyleSheetOpen(true)}
                      onReset={() => onUpdate({ shotDirector: {} })}
                    />
                    <RealismPresetPicker
                      value={scene.realismPreset ?? null}
                      onChange={(id) => onUpdate({ realismPreset: id ?? undefined })}
                    />
                  </div>

                  {/* Phase 1 (Studio Set v2) — inline "Finaler Prompt (Vorschau)"
                    block was removed. The same composed prompt + layer
                    breakdown now lives inside ScenePromptDetailsSheet, opened
                    via the "Prompt-Details ansehen" button above. */}
                </div>
              )}

              {(scene.clipSource === "stock" ||
                scene.clipSource === "stock-image") && (
                <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-300/90">
                    <span>🎁</span>
                    <span className="font-medium">Free Stock Library</span>
                    <span className="text-emerald-300/60">
                      · Pexels × Pixabay · 0 Credits
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {scene.stockMediaThumb || scene.clipUrl ? (
                        <img
                          src={scene.stockMediaThumb || scene.clipUrl}
                          alt="stock thumbnail"
                          className="w-10 h-7 rounded object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-7 rounded bg-muted/40 flex items-center justify-center flex-shrink-0">
                          {scene.clipSource === "stock" ? (
                            <Video className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <ImageIcon className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground truncate">
                          {scene.clipUrl
                            ? scene.stockMediaAuthor?.name
                              ? `${scene.stockMediaSource} · ${scene.stockMediaAuthor.name}`
                              : "Stock ausgewählt"
                            : scene.clipSource === "stock"
                              ? "Kein Video gewählt"
                              : "Kein Bild gewählt"}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] gap-1 border-emerald-500/40 hover:bg-emerald-500/10 hover:border-emerald-500/70"
                      onClick={() => setStockBrowserOpen(true)}
                    >
                      <Video className="h-3 w-3" />
                      Bibliothek öffnen
                    </Button>
                  </div>
                  <Input
                    value={scene.stockKeywords || ""}
                    onChange={(e) =>
                      onUpdate({ stockKeywords: e.target.value })
                    }
                    placeholder="Optional: Suchbegriffe für AI-Auto-Pick"
                    className="text-xs bg-background/50 h-7"
                  />
                </div>
              )}

              {scene.clipSource === "upload" && (
                <SceneMediaUpload
                  projectId={projectId}
                  sceneId={scene.id}
                  uploadUrl={scene.uploadUrl}
                  uploadType={scene.uploadType}
                  onChange={(url, type) =>
                    onUpdate({
                      uploadUrl: url ?? undefined,
                      uploadType: type ?? undefined,
                      clipUrl: url ?? undefined,
                      clipStatus: url ? "ready" : "pending",
                    })
                  }
                />
              )}

              {/* V2V Reference Video — only when the chosen AI model supports video-to-video */}
              {(() => {
                if (!scene.clipSource.startsWith("ai-")) return null;
                const mid = sourceToModelId(
                  scene.clipSource,
                  scene.clipQuality,
                );
                const m = AI_VIDEO_TOOLKIT_MODELS.find((x) => x.id === mid);
                if (!m?.capabilities?.v2v) return null;
                const isRunway = scene.clipSource === "ai-runway";
                return (
                  <div className="space-y-1.5 pt-1 border-t border-primary/30">
                    <div className="flex items-center gap-2">
                      <Video className="h-3 w-3 text-primary" />
                      <Label className="text-[11px] font-medium text-primary">
                        {lang === "de"
                          ? "Restyle mit Referenzvideo (V2V)"
                          : lang === "es"
                            ? "Restyle con video de referencia (V2V)"
                            : "Restyle with reference video (V2V)"}
                      </Label>
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1 py-0 h-3.5 border-primary/40 text-primary"
                      >
                        {m.name}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground/80 leading-snug">
                      {isRunway
                        ? lang === "de"
                          ? "Runway Aleph benötigt zwingend ein Referenzvideo — ohne fällt die Szene auf Hailuo zurück."
                          : lang === "es"
                            ? "Runway Aleph requiere un video de referencia — sin él, la escena recurre a Hailuo."
                            : "Runway Aleph requires a reference video — without it the scene falls back to Hailuo."
                        : lang === "de"
                          ? "Optional: Lade ein Referenzvideo hoch, das die KI im Stil deines Prompts neu interpretiert."
                          : lang === "es"
                            ? "Opcional: sube un video de referencia que la IA reinterpretará al estilo de tu prompt."
                            : "Optional: upload a reference video that the AI will restyle according to your prompt."}
                    </p>
                    <SceneMediaUpload
                      projectId={projectId}
                      sceneId={`${scene.id}-v2v`}
                      uploadUrl={scene.uploadUrl}
                      uploadType={scene.uploadType}
                      onChange={(url, type) =>
                        onUpdate({
                          uploadUrl: url ?? undefined,
                          uploadType: type ?? undefined,
                        })
                      }
                    />
                  </div>
                );
              })()}

              {/* Universal Reference Image — Phase 3: hidden behind "Mehr ▾". */}
              {secondaryOpen && (
                <div className="space-y-1.5 pt-1 border-t border-border/30">
                  <div className="text-[10px] text-muted-foreground/80 leading-snug">
                    {scene.clipSource.startsWith("ai-")
                      ? lang === "de"
                        ? "Optionales Referenzbild — die KI orientiert sich daran (Image-to-Video)."
                        : lang === "es"
                          ? "Imagen de referencia opcional — la IA se basa en ella (Image-to-Video)."
                          : "Optional reference image — the AI uses it as visual guide (image-to-video)."
                      : lang === "de"
                        ? "Optionales Referenzbild — wird für Continuity, Brand-Character-Sync und spätere KI-Übergänge verwendet."
                        : lang === "es"
                          ? "Imagen de referencia opcional — usada para continuidad, sincronización de personajes y transiciones IA."
                          : "Optional reference image — used for continuity, brand-character sync and later AI transitions."}
                  </div>
                  {/* Phase 2 — Quick Anchor Library: prev frame, brand char, locations */}
                  <SceneAnchorLibrary
                    selectedReferenceUrl={scene.referenceImageUrl}
                    previousSceneLastFrameUrl={previousSceneLastFrameUrl}
                    previousSceneIndex={previousSceneIndex}
                    onPick={(url) => onUpdate({ referenceImageUrl: url })}
                    language={lang}
                  />
                  {scene.clipSource.startsWith("ai-") && projectId && (
                    <div
                      className={cn(
                        frameFirstMode &&
                          "rounded-md ring-2 ring-primary/40 ring-offset-1 ring-offset-background",
                      )}
                    >
                      {frameFirstMode && (
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-semibold text-primary">
                          <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px]">
                            1
                          </span>
                          {lang === "de"
                            ? "Schritt 1 — Frame zuerst freezen"
                            : lang === "es"
                              ? "Paso 1 — congela el fotograma primero"
                              : "Step 1 — freeze the frame first"}
                        </div>
                      )}
                      {(() => {
                        // Phase 3 — Auto-inject @character / @location reference images into still generation.
                        const mentions = findMentions(
                          scene.aiPrompt || "",
                          libCharacters,
                          libLocations,
                        );
                        const seenIds = new Set<string>();
                        const injectedHints: Array<{
                          url?: string;
                          kind: "character" | "location";
                          name: string;
                        }> = [];
                        for (const m of mentions) {
                          if (seenIds.has(m.id)) continue;
                          seenIds.add(m.id);
                          const ent =
                            m.kind === "character"
                              ? libCharacters.find((c) => c.id === m.id)
                              : libLocations.find((l) => l.id === m.id);
                          if (ent?.reference_image_url) {
                            injectedHints.push({
                              url: ent.reference_image_url,
                              kind: m.kind,
                              name: ent.name,
                            });
                          }
                        }
                        // Always seed with the brand character (if scene features them) so a
                        // plain prompt without @-mention still gets character lock.
                        if (
                          activeBrandChar?.reference_image_url &&
                          sceneFeaturesCharacter(scene, {
                            name: activeBrandChar.name,
                          }) &&
                          !injectedHints.some(
                            (h) =>
                              h.url === activeBrandChar.reference_image_url,
                          )
                        ) {
                          injectedHints.unshift({
                            url: activeBrandChar.reference_image_url,
                            kind: "character",
                            name: activeBrandChar.name,
                          });
                        }
                        const composeUrls = injectedHints
                          .map((h) => h.url!)
                          .filter(Boolean);
                        const fallbackHint = scene.referenceImageUrl;
                        const labels = injectedHints.map((h) => ({
                          kind: h.kind,
                          name: h.name,
                          thumb: h.url,
                        }));
                        return (
                          <SceneStillFrameStudio
                            projectId={projectId}
                            sceneId={scene.id}
                            prompt={scene.aiPrompt || ""}
                            composeHintImageUrl={composeUrls[0] ?? fallbackHint}
                            composeHintImageUrls={
                              composeUrls.length > 0 ? composeUrls : undefined
                            }
                            injectedLabels={labels}
                            selectedReferenceUrl={scene.referenceImageUrl}
                            onPick={(url) =>
                              onUpdate({ referenceImageUrl: url })
                            }
                            language={lang as "en" | "de" | "es"}
                          />
                        );
                      })()}
                    </div>
                  )}
                  <SceneReferenceImageUpload
                    projectId={projectId}
                    sceneId={scene.id}
                    referenceImageUrl={scene.referenceImageUrl}
                    onChange={(url) =>
                      onUpdate({ referenceImageUrl: url ?? undefined })
                    }
                  />
                </div>
              )}

              {/* Hard-cut hint — Phase 3: hidden behind "Mehr ▾". */}
              {secondaryOpen && (
                <div
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/40 border border-border/30"
                  title="Übergänge werden im Universal Director's Cut nachträglich hinzugefügt (sauberer & flexibler)."
                >
                  <span className="text-[10px] text-muted-foreground">
                    Harter Schnitt → Übergänge im Director's Cut
                  </span>
                </div>
              )}

              {/* Phase 3 (Studio Set v2) — single drawer toggle for all secondary
                settings. Active sub-features bubble up as small pills when the
                drawer is closed so the user keeps situational awareness. */}
              {(() => {
                const anchor = scene.clipSource.startsWith("ai-")
                  ? resolveSceneCharacterAnchor(
                      scene,
                      characters,
                      activeBrandChar,
                    )
                  : null;
                const anchorShort: Record<string, string> = {
                  "first-frame-direct":
                    lang === "de" ? "Anker: Porträt" : "Anchor: portrait",
                  "first-frame-composed":
                    lang === "de" ? "Anker: komponiert" : "Anchor: composed",
                  "subject-reference":
                    lang === "de"
                      ? "Anker: Subject-Ref"
                      : "Anchor: subject-ref",
                  "text-only": lang === "de" ? "Anker: Text" : "Anchor: text",
                };
                return (
                  <SceneSecondaryToggle
                    language={lang}
                    open={secondaryOpen}
                    onToggle={() => setSecondaryOpen((v) => !v)}
                    summary={{
                      effectsCount: scene.effects?.length ?? 0,
                      anchorLabel: anchor
                        ? (anchorShort[anchor.strategy] ?? null)
                        : null,
                      faceLock: Boolean(scene.forcePortraitAsFirstFrame),
                      lipSyncOn: Boolean(scene.lipSyncWithVoiceover),
                      hasReferenceImage: Boolean(scene.referenceImageUrl),
                    }}
                  />
                );
              })()}
            </div>

            {/* Thumbnail preview */}
            <div className="w-24 h-16 rounded bg-muted/30 border border-border/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {(scene.uploadType === "image" ||
                scene.clipSource === "ai-image" ||
                scene.clipSource === "stock-image") &&
              (scene.clipUrl || scene.uploadUrl) ? (
                <img
                  src={scene.clipUrl || scene.uploadUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : scene.clipUrl ? (
                <video
                  src={scene.clipUrl}
                  className="w-full h-full object-cover"
                  muted
                />
              ) : scene.uploadUrl ? (
                <video
                  src={scene.uploadUrl}
                  className="w-full h-full object-cover"
                  muted
                />
              ) : (
                <ClipIcon className="h-5 w-5 text-muted-foreground/30" />
              )}
            </div>
          </div>
        )}
      </CardContent>

      {/* Stock Media Browser modal */}
      <StockMediaBrowser
        open={stockBrowserOpen}
        onOpenChange={setStockBrowserOpen}
        initialType={scene.clipSource === "stock-image" ? "image" : "video"}
        preferredAspect={preferredAspect}
        onSelect={handleStockSelect}
      />

      {/* Phase 1 (Studio Set v2) — single Sheet replacing inline Director
          Console + Final-Prompt-Preview + Multi-Engine + Compare-Lab launcher. */}
      <SceneStyleSheet
        open={styleSheetOpen}
        onOpenChange={setStyleSheetOpen}
        scene={scene}
        language={lang}
        onUpdate={onUpdate}
      />

      <ScenePromptDetailsSheet
        open={promptDetailsOpen}
        onOpenChange={setPromptDetailsOpen}
        scene={scene}
        language={lang}
        promptMode={promptMode}
        promptSlots={promptSlots}
        promptSlotOrder={promptSlotOrder}
        brandCharacterInput={brandCharacterInput}
        libCharacters={libCharacters}
        libLocations={libLocations}
        characters={characters}
        onOpenCompareLab={() => setCompareLabOpen(true)}

      />

      {/* Block L — Inline Compare Lab Dialog */}
      <Dialog open={compareLabOpen} onOpenChange={setCompareLabOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Beaker className="h-5 w-5 text-primary" />
              {lang === "de"
                ? `Compare Lab — Szene ${index + 1}`
                : lang === "es"
                  ? `Compare Lab — Escena ${index + 1}`
                  : `Compare Lab — Scene ${index + 1}`}
            </DialogTitle>
            <DialogDescription>
              {lang === "de"
                ? "Vergleiche denselben Prompt parallel auf bis zu 6 KI-Video-Engines. Wähle einen Sieger und übernimm ihn in deine Szene."
                : lang === "es"
                  ? "Compara el mismo prompt en hasta 6 motores de vídeo IA en paralelo. Elige un ganador y aplícalo a tu escena."
                  : "Compare the same prompt across up to 6 AI video engines in parallel. Pick a winner and apply it to your scene."}
            </DialogDescription>
          </DialogHeader>
          <CompareLabGrid
            initialPrompt={
              promptMode === "structured"
                ? stitchSlots(promptSlots, promptSlotOrder)
                : (scene.aiPrompt ?? "")
            }
            initialAspectRatio={
              preferredAspect === "4:5"
                ? "1:1"
                : ((preferredAspect ?? "16:9") as "16:9" | "9:16" | "1:1")
            }
            composerSceneId={scene.id}
            onWinnerSelected={(_engine, videoUrl) => {
              if (videoUrl) {
                onUpdate({
                  clipSource: "upload",
                  uploadUrl: videoUrl,
                  uploadType: "video",
                });
                toast({
                  title:
                    lang === "de"
                      ? "Sieger übernommen"
                      : lang === "es"
                        ? "Ganador aplicado"
                        : "Winner applied",
                  description:
                    lang === "de"
                      ? "Das gewählte Video wurde der Szene zugewiesen."
                      : lang === "es"
                        ? "El vídeo seleccionado se asignó a la escena."
                        : "The selected video has been assigned to the scene.",
                });
                setCompareLabOpen(false);
              }
            }}
          />
        </DialogContent>
      </Dialog>
      {scene.id && projectId && (
        <SceneCommentSheet
          open={commentSheetOpen}
          onOpenChange={setCommentSheetOpen}
          sceneId={scene.id}
          projectId={projectId}
          sceneLabel={`Scene ${index + 1}`}
          currentUserId={currentUserId}
          canEdit={true}
        />
      )}
    </Card>
  );
}
