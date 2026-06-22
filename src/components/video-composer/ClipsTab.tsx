import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Loader2, Play, RefreshCw, ArrowRight, CheckCircle, XCircle, Clock, Search, Film, DollarSign, Sparkles, Lightbulb, X, Link2, Save, Check, Clapperboard } from 'lucide-react';
import { useFrameContinuity } from '@/hooks/useFrameContinuity';
import { useSaveSceneToLibrary } from '@/hooks/useSaveSceneToLibrary';
import { toast } from '@/hooks/use-toast';
import { extractFunctionsError } from '@/lib/functionsError';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ComposerScene, ComposerCharacter } from '@/types/video-composer';
import { SCENE_TYPE_LABELS, CLIP_SOURCE_LABELS, getClipCost, QUALITY_LABELS } from '@/types/video-composer';
import { recommendEngineForScene, countSpeakers } from '@/lib/video-composer/sceneEngineRouter';
import { SceneClipProgress } from './SceneClipProgress';
import { probeMediaDuration } from '@/lib/probeMp4Duration';
import { composeFinalPrompt, type DirectorLanguage } from "@/lib/motion-studio/composeFinalPrompt";
import { derivePerformanceEntries } from "@/lib/motion-studio/buildPerformanceBlock";
import { sceneFeaturesCharacter } from '@/lib/motion-studio/sceneFeaturesCharacter';
import { resolveSceneCharacterAnchor } from '@/lib/motion-studio/resolveSceneCharacterAnchor';
import { prepareSceneAnchor } from '@/lib/motion-studio/prepareSceneAnchor';
import { useUnifiedMentionLibrary } from '@/hooks/useUnifiedMentionLibrary';
import { useBrandCharacters, buildCharacterPromptInjection } from '@/hooks/useBrandCharacters';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableSceneItem } from './SortableSceneItem';
import ContinuityGuardianStrip from './ContinuityGuardianStrip';
import RenderPipelinePanel from './RenderPipelinePanel';
import FramePickerOverlay from './FramePickerOverlay';

interface ClipsTabProps {
  scenes: ComposerScene[];
  projectId?: string;
  visualStyle?: string;
  characters?: ComposerCharacter[];
  /** Project spoken language — flows into the deterministic Audio Plan block. */
  language?: string;
  onUpdateScenes: (scenes: ComposerScene[]) => void;
  /** Local-only state update (no debounced full-scene DB flush). Required by
   *  Cinematic-Sync start so the optimistic engine_override / clip_status
   *  isn't clobbered by a stale snapshot 600ms later. */
  onUpdateScenesLocalOnly?: (scenes: ComposerScene[]) => void;
  onGoToVoiceSubtitles: () => void;
  onEnsurePersisted?: () => Promise<{ projectId: string; scenes: ComposerScene[] }>;
}

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: 'text-muted-foreground', bg: 'bg-muted/40 border-border/40', label: 'Ausstehend' },
  generating: { color: 'text-accent', bg: 'bg-accent/15 border-accent/40 animate-pulse', label: 'Generiert…' },
  ready: { color: 'text-green-400', bg: 'bg-green-500/15 border-green-500/40', label: 'Fertig' },
  failed: { color: 'text-destructive', bg: 'bg-destructive/15 border-destructive/40', label: 'Fehlgeschlagen' },
};

export default function ClipsTab({ scenes, projectId, visualStyle, characters, language, onUpdateScenes, onUpdateScenesLocalOnly, onGoToVoiceSubtitles, onEnsurePersisted }: ClipsTabProps) {
  // Normalise the project language to the 3 accepted DirectorLanguage codes.
  const directorLanguage: DirectorLanguage =
    language === 'de' ? 'de' : language === 'es' ? 'es' : 'en';
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [singleGenerating, setSingleGenerating] = useState<Record<string, boolean>>({});
  const { extractLastFrame, extractingSceneId } = useFrameContinuity();
  const { save: saveSceneToLibrary, savingSceneId, savedSceneIds } = useSaveSceneToLibrary();
  // Library for @-mention resolution at generation time
  const { characters: libCharacters, locations: libLocations } = useUnifiedMentionLibrary();
  const { characters: brandChars } = useBrandCharacters();
  // Phase 2 — auto-inject the user's favorite Brand Character (if any).
  const activeBrandChar = brandChars.find((c) => c.is_favorite) ?? brandChars[0];
  const buildBrandInputForScene = useCallback(
    (scene: ComposerScene) => {
      if (!activeBrandChar) return undefined;
      const applies = sceneFeaturesCharacter(scene, { name: activeBrandChar.name });
      return {
        name: activeBrandChar.name,
        identityCardPrompt: buildCharacterPromptInjection(activeBrandChar),
        referenceImageUrl: activeBrandChar.reference_image_url,
        // Gate: only inject identity card AND portrait anchor when the scene
        // actually features the character (explicit characterShot or name in
        // the prompt). When it does, the portrait is auto-used as i2v anchor
        // for face/identity consistency — without it, the model invents a
        // different person.
        appliesToScene: applies,
        usePortraitAsFirstFrame: applies,
      };
    },
    [activeBrandChar],
  );

  /**
   * Frame-to-Shot Continuity:
   * Extrahiert den letzten Frame der aktuellen Szene und setzt ihn als
   * `referenceImageUrl` der nachfolgenden Szene → nahtlose Bild-Übergänge
   * bei AI-Generierung (i2v).
   */
  const handleApplyContinuityToNext = useCallback(
    async (currentScene: ComposerScene, nextScene: ComposerScene) => {
      if (!currentScene.clipUrl) {
        toast({ title: 'Kein Clip vorhanden', description: 'Generiere zuerst diese Szene.' });
        return;
      }
      const dur = currentScene.durationSeconds || 5;
      const lastFrameTime = Math.max(0.05, dur - 0.05);
      const result = await extractLastFrame({
        videoUrl: currentScene.clipUrl,
        sceneId: currentScene.id,
        projectId,
        durationSeconds: lastFrameTime,
      });
      if (!result) return;
      const updated = scenes.map((s) =>
        s.id === nextScene.id
          ? {
              ...s,
              referenceImageUrl: result.lastFrameUrl,
              clipStatus: 'pending' as const,
              continuityLocked: true,
              continuationSourceSceneId: currentScene.id,
              framePickSeconds: lastFrameTime,
              // Default 0.3s crossfade for paired Artlist-style continuity
              transitionType: (s.transitionType && s.transitionType !== 'none')
                ? s.transitionType
                : ('crossfade' as any),
            }
          : s
      );
      onUpdateScenes(updated);
      toast({
        title: 'Continuity aktiviert ✨',
        description: `Szene ${scenes.findIndex(s => s.id === nextScene.id) + 1} startet jetzt nahtlos.`,
      });
    },
    [scenes, projectId, extractLastFrame, onUpdateScenes]
  );

  // Frame-Picker (Artlist-style): pick ANY frame, not just the last
  const [framePickerState, setFramePickerState] = useState<{
    source: ComposerScene;
    target: ComposerScene;
    targetIndex: number;
  } | null>(null);

  const handleFramePicked = useCallback(
    (next: { referenceImageUrl: string; framePickSeconds: number; continuationSourceSceneId: string }) => {
      if (!framePickerState) return;
      const targetId = framePickerState.target.id;
      const updated = scenes.map((s) =>
        s.id === targetId
          ? {
              ...s,
              referenceImageUrl: next.referenceImageUrl,
              framePickSeconds: next.framePickSeconds,
              continuationSourceSceneId: next.continuationSourceSceneId,
              continuityLocked: true,
              clipStatus: 'pending' as const,
              transitionType: (s.transitionType && s.transitionType !== 'none')
                ? s.transitionType
                : ('crossfade' as any),
            }
          : s
      );
      onUpdateScenes(updated);
    },
    [framePickerState, scenes, onUpdateScenes]
  );
  const [stockSearch, setStockSearch] = useState<Record<string, string>>({});
  const [stockResults, setStockResults] = useState<Record<string, any[]>>({});
  const [searchingStock, setSearchingStock] = useState<Record<string, boolean>>({});
  const [previousStatuses, setPreviousStatuses] = useState<Record<string, string>>({});
  const [rerollHintDismissed, setRerollHintDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('composer-reroll-hint-dismissed') === '1';
  });
  const [rerollTarget, setRerollTarget] = useState<ComposerScene | null>(null);
  const [cinematicSwitchTarget, setCinematicSwitchTarget] = useState<ComposerScene | null>(null);
  const [hintDismissed, setHintDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem('composer:cinematic-sync-hint-dismissed') === '1'; } catch { return false; }
  });

  const dismissRerollHint = () => {
    setRerollHintDismissed(true);
    try { localStorage.setItem('composer-reroll-hint-dismissed', '1'); } catch {}
  };

  // Drag & drop sensors for reordering scenes within the Clips tab
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = scenes.findIndex((s) => s.id === active.id);
    const newIndex = scenes.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(scenes, oldIndex, newIndex);
    onUpdateScenes(reordered.map((s, i) => ({ ...s, orderIndex: i })));
  };

  const allReady = scenes.every((s) => s.clipStatus === 'ready' || (s.clipSource === 'upload' && s.uploadUrl));
  const readyCount = scenes.filter((s) => s.clipStatus === 'ready' || (s.clipSource === 'upload' && s.uploadUrl)).length;
  const generatingCount = scenes.filter((s) => s.clipStatus === 'generating').length;
  const pendingScenes = scenes.filter(s => s.clipStatus !== 'ready' && s.clipStatus !== 'generating' && !(s.clipSource === 'upload' && s.uploadUrl));
  const progressPercent = scenes.length > 0 ? (readyCount / scenes.length) * 100 : 0;

  // Calculate total cost (only pending AI scenes)
  const remainingCost = pendingScenes.reduce((sum, s) => {
    if (s.clipSource.startsWith('ai-')) {
      return sum + getClipCost(s.clipSource, s.clipQuality || 'standard', s.durationSeconds);
    }
    return sum;
  }, 0);

  // Polling logic — extracted so we can also trigger it immediately
  const pollScenes = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from('composer_scenes')
      .select('id, clip_status, clip_url, duration_seconds, upload_type, lip_sync_applied_at, lip_sync_status, lip_sync_source_clip_url, lip_sync_with_voiceover, engine_override, clip_source, dialog_script, audio_plan, twoshot_stage, continuity_drift_score, clip_error')
      .eq('project_id', projectId);

    if (!data) return;

    // ── Self-Heal: Stuck-Scene-Recovery ───────────────────────────────────
    // Wenn der Webhook (Replicate, Sync.so, …) den Status nicht finalisiert
    // hat, die Szene aber bereits eine `clip_url` hat, behandeln wir sie als
    // "ready". Verhindert das endlose "Wird generiert…" nach gelegentlichen
    // Webhook-Drops.
    //
    // Cinematic-Sync: Hailuo-Render UND Lip-Sync sind getrennte Phasen.
    // Sobald clip_url existiert, ist der Hailuo-Render fertig — die Szene
    // muss als clip_status='ready' markiert werden, auch wenn der Lip-Sync
    // noch läuft / pending ist. Die UI zeigt den Lip-Sync-Status separat.
    const stuck = (data as any[]).filter(
      (d) =>
        d.clip_status === 'generating' &&
        typeof d.clip_url === 'string' &&
        d.clip_url.length > 0,
    );
    if (stuck.length > 0) {
      await Promise.all(
        stuck.map((d) =>
          supabase
            .from('composer_scenes')
            .update({ clip_status: 'ready', clip_error: null })
            .eq('id', d.id),
        ),
      );
      stuck.forEach((d) => {
        d.clip_status = 'ready';
        d.clip_error = null;
      });
    }

    // ── Cinematic-Sync Auto-Trigger ───────────────────────────────────────
    // Disabled here: `useTwoShotAutoTrigger` is now the single source of truth
    // for Cinematic-Sync auto-starts (tab-independent, no optimistic
    // lip_sync_status='running' before the function reserves credits). The
    // old optimistic update here was racing the backend's duplicate-run
    // guard and silently short-circuiting the pipeline with 202
    // "already_running" before any sync.so pass ran — leaving scenes stuck
    // at twoshot_stage='master_clip' until the watchdog refunded them.

    let changed = false;
    const newPrev: Record<string, string> = { ...previousStatuses };
    // Collect scenes that just transitioned to "ready" so we can probe their
    // real MP4 duration (Hailuo etc. often deliver shorter clips than requested)
    // and then update DB + UI in a single follow-up pass. This is the
    // single source of truth for downstream WAV padding + composition math.
    const justReady: Array<{ sceneId: string; clipUrl: string }> = [];
    // Scenes that opted into Sync.so post-step lip-sync and are ready to run it.
    const lipSyncTargets: string[] = [];

    const updatedScenes = scenes.map((scene, idx) => {
      const dbScene = data.find((d: any) => d.id === scene.id);
      const lipChanged =
        !!dbScene &&
        ((dbScene as any).lip_sync_applied_at !== (scene.lipSyncAppliedAt ?? null) ||
          (dbScene as any).lip_sync_status !== (scene.lipSyncStatus ?? null) ||
          (dbScene as any).twoshot_stage !== (scene.twoshotStage ?? null) ||
          (dbScene as any).continuity_drift_score !== (scene.continuityDriftScore ?? null));
      if (
        dbScene &&
        (dbScene.clip_status !== scene.clipStatus ||
          dbScene.clip_url !== scene.clipUrl ||
          (dbScene.upload_type && dbScene.upload_type !== scene.uploadType) ||
          ((dbScene as any).engine_override && (dbScene as any).engine_override !== (scene.engineOverride ?? 'auto')) ||
          ((dbScene as any).clip_source && (dbScene as any).clip_source !== scene.clipSource) ||
          lipChanged)
      ) {
        changed = true;
        // Toast on transition generating → ready
        if (scene.clipStatus === 'generating' && dbScene.clip_status === 'ready') {
          toast({ title: `Szene ${idx + 1} fertig ✓`, description: SCENE_TYPE_LABELS[scene.sceneType]?.de });
          if (dbScene.clip_url) {
            justReady.push({ sceneId: scene.id, clipUrl: dbScene.clip_url });
          }
          // Auto-trigger Sync.so post-step when the scene opted in and a VO
          // (or audio plan / character audio) exists.
          // SAFETY: never run for multi-speaker scenes — Sync.so would pick a
          // single voiceover clip and apply it to the whole video, which is
          // exactly the "one face speaks for both" failure mode. We derive
          // the speaker count from the most authoritative DB fields so a
          // stale local audioPlan can't cause mis-routing.
          const dbPlanSpeakers = Array.isArray((dbScene as any)?.audio_plan?.speakers)
            ? (dbScene as any).audio_plan.speakers.length
            : 0;
          const dbTwoshotSpeakers = Array.isArray((dbScene as any)?.audio_plan?.twoshot?.speakers)
            ? (dbScene as any).audio_plan.twoshot.speakers.length
            : 0;
          const dbDialogScript = String((dbScene as any)?.dialog_script ?? '');
          const dbDialogSpeakers = new Set<string>();
          for (const line of dbDialogScript.split('\n')) {
            const m = line.match(/^\s*\[?([A-Za-zÀ-ÿ][\w\s.'-]{1,40}?)\]?\s*[:：]/);
            if (m) dbDialogSpeakers.add(m[1].trim().toLowerCase());
          }
          const localPlanSpeakers = (scene.audioPlan?.speakers?.length ?? 0);
          const speakerCount = Math.max(
            localPlanSpeakers,
            dbPlanSpeakers,
            dbTwoshotSpeakers,
            dbDialogSpeakers.size,
          );
          const isCinematicSync = (dbScene as any).engine_override === 'cinematic-sync';
          if (
            ((dbScene as any).lip_sync_with_voiceover === true || isCinematicSync) &&
            !(dbScene as any).lip_sync_applied_at &&
            (dbScene as any).lip_sync_status !== 'running' &&
            (dbScene as any).lip_sync_status !== 'no_voiceover' &&
            speakerCount <= 1
          ) {
            lipSyncTargets.push(scene.id);
          }
        }
        if (scene.clipStatus === 'generating' && dbScene.clip_status === 'failed') {
          toast({ title: `Szene ${idx + 1} fehlgeschlagen`, variant: 'destructive' });
        }
        // Cinematic-Sync: notify when Sync.so step finishes
        if (
          (dbScene as any).engine_override === 'cinematic-sync' &&
          scene.lipSyncStatus !== 'done' &&
          (dbScene as any).lip_sync_status === 'done'
        ) {
          toast({
            title: `🎬 Cinematic-Sync fertig — Szene ${idx + 1}`,
            description: 'Charakter ist jetzt in der echten Szene und lip-synct.',
          });
        }
        if (
          (dbScene as any).engine_override === 'cinematic-sync' &&
          scene.lipSyncStatus !== 'failed' &&
          (dbScene as any).lip_sync_status === 'failed'
        ) {
          toast({
            title: `Cinematic-Sync Lip-Sync fehlgeschlagen`,
            description: `Szene ${idx + 1}: Hailuo-Render ist fertig, aber Sync.so hatte einen Fehler. Credits wurden refundiert.`,
            variant: 'destructive',
          });
        }
        if (
          (dbScene as any).engine_override === 'cinematic-sync' &&
          scene.lipSyncStatus !== 'no_voiceover' &&
          (dbScene as any).lip_sync_status === 'no_voiceover'
        ) {
          toast({
            title: `Cinematic-Sync braucht ein Voiceover — Szene ${idx + 1}`,
            description: 'Hailuo-Render ist fertig, aber es gibt kein Voiceover für den Lip-Sync. Bitte erst im Dialog/VO-Tab eine Stimme generieren, dann Cinematic-Sync erneut starten.',
            variant: 'destructive',
          });
        }
        newPrev[scene.id] = dbScene.clip_status;
        return {
          ...scene,
          clipStatus: dbScene.clip_status as ComposerScene['clipStatus'],
          clipUrl: dbScene.clip_url || scene.clipUrl,
          uploadType: (dbScene.upload_type as ComposerScene['uploadType']) || scene.uploadType,
          engineOverride: ((dbScene as any).engine_override as ComposerScene['engineOverride']) ?? scene.engineOverride ?? 'auto',
          clipSource: ((dbScene as any).clip_source as ComposerScene['clipSource']) ?? scene.clipSource,
          lipSyncAppliedAt: (dbScene as any).lip_sync_applied_at ?? null,
          lipSyncStatus: (dbScene as any).lip_sync_status ?? null,
          lipSyncSourceClipUrl: (dbScene as any).lip_sync_source_clip_url ?? null,
          twoshotStage: ((dbScene as any).twoshot_stage as ComposerScene['twoshotStage']) ?? null,
          clipError: (dbScene as any).clip_error ?? null,
          continuityDriftScore: typeof (dbScene as any).continuity_drift_score === 'number'
            ? (dbScene as any).continuity_drift_score
            : scene.continuityDriftScore,
        };
      }
      return scene;
    });
    if (changed) {
      setPreviousStatuses(newPrev);
      onUpdateScenes(updatedScenes);
    }

    // Probe each just-ready clip for its real MP4 duration. Update DB + UI
    // when the real value differs from the configured nominal duration.
    // We do this *after* the main state update so the user sees the clip
    // immediately, then sees the corrected duration shortly after.
    if (justReady.length > 0) {
      Promise.all(
        justReady.map(async ({ sceneId, clipUrl }) => {
          try {
            const realDur = await probeMediaDuration(clipUrl);
            const sceneNow = updatedScenes.find(s => s.id === sceneId);
            const nominal = sceneNow?.durationSeconds ?? 0;
            // Only persist if there is a meaningful drift (>50ms)
            if (Math.abs(realDur - nominal) > 0.05) {
              console.log(`[ClipsTab] Scene ${sceneId} real duration ${realDur.toFixed(3)}s (nominal ${nominal}s) — syncing`);
              const { error: upErr } = await supabase
                .from('composer_scenes')
                .update({ duration_seconds: realDur })
                .eq('id', sceneId);
              if (upErr) {
                console.warn('[ClipsTab] Failed to persist real duration:', upErr);
                return { sceneId, realDur, persisted: false };
              }
              return { sceneId, realDur, persisted: true };
            }
            return { sceneId, realDur, persisted: false };
          } catch (e) {
            console.warn('[ClipsTab] probeMediaDuration failed:', e);
            return null;
          }
        })
      ).then((results) => {
        const persistedUpdates = results.filter((r): r is { sceneId: string; realDur: number; persisted: boolean } => !!r && r.persisted);
        if (persistedUpdates.length === 0) return;
        // Apply real durations to UI state in one batch
        const merged = updatedScenes.map(s => {
          const u = persistedUpdates.find(p => p.sceneId === s.id);
          return u ? { ...s, durationSeconds: u.realDur } : s;
        });
        onUpdateScenes(merged);
      });
    }

    // Auto-trigger Sync.so post-step lip-sync. We fire-and-forget; the next
    // poll tick will surface lip_sync_applied_at and swap clip_url. The edge
    // function self-checks for a voiceover clip — if none exists yet, it 400s
    // silently and we'll retry on the next ready scene.
    if (lipSyncTargets.length > 0) {
      lipSyncTargets.forEach((sceneId) => {
        console.info(`[ClipsTab] Auto-triggering lip-sync for scene ${sceneId}`);
        supabase.functions
          .invoke('compose-dialog-segments', { body: { scene_id: sceneId, auto: true } })
          .then(async ({ data: lsData, error: lsErr }) => {
            // Parse FunctionsHttpError body BEFORE deciding what to surface.
            // `lsErr.context` is a raw Response — `.error` on it is undefined,
            // so the previous silent check never matched scene_not_found.
            let reason: string | undefined = lsData?.error;
            let message: string | undefined = lsData?.message;
            let realMsg = '';
            if (lsErr) {
              realMsg = await extractFunctionsError(lsErr);
              const code = realMsg.split(/\s[\(\[]/)[0]?.trim();
              if (code) reason = reason ?? code;
              message = message ?? realMsg;
            }
            const SILENT_RACE_CLIPS = new Set([
              'scene_not_found',
              // Plan v71: benign 202s — server already working / waiting for slot.
              'already_running',
              'scene_lock_busy',
              'preflight_transient_retry_later',
              'deferred',
              'circuit_open',
              'missing_audio_plan',
              'missing_source_clip',
              'master_clip_not_ready',
            ]);
            if (reason && SILENT_RACE_CLIPS.has(String(reason))) {
              console.info(`[ClipsTab] lip-sync silent skip ${sceneId}: ${reason}`);
              return;
            }
            if (reason === 'tts_failed' || reason === 'no_voiceover') {
              toast({
                title: 'Cinematic-Sync braucht ein Voiceover',
                description: message || 'Bitte im Voiceover-Tab eine Stimme prüfen, dann erneut starten.',
                variant: 'destructive',
              });
            } else if (lsErr) {
              toast({
                title: 'Lip-Sync fehlgeschlagen',
                description: realMsg || message || (lsErr as Error).message || 'Unbekannter Fehler.',
                variant: 'destructive',
              });
              console.warn(`[ClipsTab] lip-sync invoke failed for ${sceneId}`, lsErr);
            } else {
              toast({
                title: 'Lip-Sync gestartet',
                description: 'Charakter spricht gleich wortgenau in der Szene (~30s).',
              });
            }
          });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, scenes, onUpdateScenes]);

  // Poll every 3s while generating OR while a Cinematic-Sync lip-sync phase
  // is still running (Hailuo may already be `ready` but Sync.so is processing).
  const cinematicSyncRunning = scenes.some(
    (s) => s.engineOverride === 'cinematic-sync' &&
      (s.lipSyncStatus === 'running' || s.lipSyncStatus === 'pending'),
  );
  useEffect(() => {
    if (generatingCount === 0 && !cinematicSyncRunning) return;
    const interval = setInterval(pollScenes, 3000);
    return () => clearInterval(interval);
  }, [generatingCount, cinematicSyncRunning, pollScenes]);

  // One-shot poll on mount → recovers stuck 'generating' UI from a previous
  // session by reloading the actual DB truth (e.g. scene was already 'ready'
  // but the client hung on a Nano-Banana compose call).
  useEffect(() => {
    pollScenes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureProject = async (): Promise<{ projectId: string; scenes: ComposerScene[] } | null> => {
    // Always call onEnsurePersisted (when available) so the LATEST Storyboard
    // edits (prompt, slots, director settings, …) are flushed to DB before
    // compose-video-clips runs. This prevents the "edits not picked up /
    // reverted on tab switch" bug where projectId already exists and the
    // short-circuit skipped persistence.
    if (onEnsurePersisted) {
      try {
        return await onEnsurePersisted();
      } catch (err: any) {
        toast({ title: 'Fehler', description: err.message || 'Projekt konnte nicht gespeichert werden', variant: 'destructive' });
        return null;
      }
    }
    if (projectId) return { projectId, scenes };
    return null;
  };


  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    try {
      const persisted = await ensureProject();
      if (!persisted) {
        setIsGeneratingAll(false);
        return;
      }
      const { projectId: pid, scenes: pScenes } = persisted;

      const eligibleScenes = pScenes.filter(
        s =>
          s.clipStatus !== 'ready' &&
          !(s.clipSource === 'upload' && s.uploadUrl) &&
          // Two-Shot scenes already mid-render (cinematic-sync engine + a
          // twoshotStage set) are owned by their dedicated pipeline; don't
          // double-trigger via "Alle generieren".
          !(
            s.clipStatus === 'generating' &&
            s.engineOverride === 'cinematic-sync' &&
            !!(s as any).twoshotStage &&
            (s as any).twoshotStage !== 'failed'
          ),
      );

      // First pass: compose prompts (so the scene-anchor compose call gets the
      // FINAL English prompt, not the raw one).
      const composedByScene = new Map<string, ReturnType<typeof composeFinalPrompt>>();
      for (const s of eligibleScenes) {
        const brandCharacterInput = buildBrandInputForScene(s);
        composedByScene.set(s.id, composeFinalPrompt({
          rawPrompt: s.aiPrompt || '',
          directorModifiers: s.directorModifiers,
          shotDirector: s.shotDirector,
          cinematicStylePresetId: (s as any).cinematicStylePresetId,
          brandCharacter: brandCharacterInput,
          libraryCharacters: libCharacters,
          libraryLocations: libLocations,
          audioPlan: s.audioPlan,
          performanceEntries: derivePerformanceEntries(s, characters),
          language: directorLanguage,
        }));

      }

      // Second pass (parallel): scene-aware character anchor.
      // Uses Nano Banana 2 to render the character INTO the scene composition
      // for non-close-up shots, instead of locking the first frame to a face.
      const anchorByScene = new Map<string, Awaited<ReturnType<typeof prepareSceneAnchor>>>();
      await Promise.all(
        eligibleScenes
          .filter(s => s.clipSource.startsWith('ai-'))
          .map(async (s) => {
            if (s.engineOverride === 'cinematic-sync') {
              anchorByScene.set(s.id, { composed: false });
              return;
            }
            const composed = composedByScene.get(s.id);
            const prepared = await prepareSceneAnchor(
              s,
              characters,
              activeBrandChar,
              composed?.finalPrompt || s.aiPrompt || '',
              '16:9',
              {},
              libLocations,
            );
            anchorByScene.set(s.id, prepared);
            if (prepared.anchor) {
              console.log(
                `[ClipsTab] scene ${s.id} → ${prepared.anchor.strategy} (${prepared.anchor.name}, source=${prepared.anchor.source}, composed=${prepared.composed})`,
              );
            }
          }),
      );

      const scenesPayload = eligibleScenes.map(s => {
        const composed = composedByScene.get(s.id)!;
        const prepared = anchorByScene.get(s.id);
        return {
          id: s.id,
          clipSource: s.clipSource,
          clipQuality: s.clipQuality || 'standard',
          aiPrompt: composed.finalPrompt,
          negativePrompt: composed.negativePrompt || undefined,
          stockKeywords: s.stockKeywords,
          uploadUrl: s.uploadUrl,
          referenceImageUrl: prepared?.firstFrameUrl,
          subjectReferenceUrl: prepared?.subjectReferenceUrl,
          durationSeconds: s.durationSeconds,
          characterShot: s.characterShot,
          characterShots: s.characterShots,
          dialogScript: s.dialogScript,
          dialogVoices: s.dialogVoices,
          engineOverride: s.engineOverride ?? 'auto',
          withAudio: s.withAudio !== false,
        };
      });

      if (scenesPayload.length === 0) {
        toast({ title: 'Alle Clips sind bereits fertig!' });
        setIsGeneratingAll(false);
        return;
      }

      // Optimistically mark AI scenes as generating, AND freeze the
      // composed first-frame as the scene's referenceImageUrl so future
      // re-rolls reuse it deterministically (no Nano-Banana drift).
      const optimistic = pScenes.map(s => {
        if (scenesPayload.some(p => p.id === s.id) && s.clipSource.startsWith('ai-')) {
          const prep = anchorByScene.get(s.id);
          const frozenRef = prep?.composed && prep.firstFrameUrl
            ? prep.firstFrameUrl
            : s.referenceImageUrl;
          return { ...s, clipStatus: 'generating' as const, referenceImageUrl: frozenRef };
        }
        return s;
      });
      onUpdateScenes(optimistic);

      const { data, error } = await supabase.functions.invoke('compose-video-clips', {
        body: { projectId: pid, scenes: scenesPayload, visualStyle, characters },
      });
      if (error) throw error;

      const updatedScenes = optimistic.map(scene => {
        const result = data?.results?.find((r: any) => r.sceneId === scene.id);
        if (result) {
          const isAiImage = scene.clipSource === 'ai-image';
          return {
            ...scene,
            clipStatus: result.status as any,
            clipUrl: result.clipUrl || scene.clipUrl,
            // For ai-image scenes that resolve immediately to 'ready', mark
            // uploadType 'image' so the preview player picks the <img> path
            // without waiting for a DB poll cycle.
            uploadType:
              isAiImage && result.status === 'ready'
                ? 'image'
                : scene.uploadType,
            replicatePredictionId: result.predictionId || scene.replicatePredictionId,
          };
        }
        return scene;
      });
      onUpdateScenes(updatedScenes);

      const failedResults = (data?.results || []).filter((r: any) => r.status === 'failed');
      if (failedResults.length > 0) {
        console.error('[ClipsTab] Failed clip details:', failedResults);
        toast({
          title: `${failedResults.length} Clip(s) fehlgeschlagen`,
          description: 'Generierung fehlgeschlagen — bitte erneut versuchen. Details in der Konsole.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Clip-Generierung gestartet',
          description: `${data?.generatingCount || 0} KI-Clips werden generiert (€${remainingCost.toFixed(2)}).`,
        });
      }
      // Trigger immediate poll
      setTimeout(pollScenes, 500);
    } catch (err: any) {
      console.error('Generate clips error:', err);
      const realMsg = await extractFunctionsError(err);
      toast({ title: 'Fehler', description: realMsg || 'Clip-Generierung fehlgeschlagen — bitte erneut versuchen.', variant: 'destructive' });
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const handleGenerateSingle = async (scene: ComposerScene) => {
    setSingleGenerating(prev => ({ ...prev, [scene.id]: true }));
    // Snapshot for rollback if invocation fails.
    const previousStatus = scene.clipStatus;
    try {
      const persisted = await ensureProject();
      if (!persisted) {
        setSingleGenerating(prev => ({ ...prev, [scene.id]: false }));
        return;
      }
      const { projectId: pid, scenes: pScenes } = persisted;

      // Find the up-to-date scene from persisted list (id may have been replaced).
      // CRITICAL: Merge engineOverride / clipSource from the *passed-in* scene
      // so that callers like the Cinematic-Sync switch (which optimistically
      // sets engineOverride='cinematic-sync' + clipSource='ai-hailuo' but
      // hasn't flushed to DB yet) actually reach the backend with the new
      // engine. Without this merge, the persisted DB row wins and the
      // cinematic-switch silently re-renders the same HeyGen avatar.
      const dbScene = pScenes.find(s => s.orderIndex === scene.orderIndex) || scene;
      const targetScene: ComposerScene = {
        ...dbScene,
        engineOverride: scene.engineOverride ?? dbScene.engineOverride ?? 'auto',
        clipSource: scene.clipSource ?? dbScene.clipSource,
      };

      // Optimistic update
      if (targetScene.clipSource.startsWith('ai-')) {
        const optimistic = pScenes.map(s =>
          s.id === targetScene.id ? { ...s, clipStatus: 'generating' as const } : s
        );
        onUpdateScenes(optimistic);
      }

      const brandCharacterInputSingle = buildBrandInputForScene(targetScene);
      const composedSingle = composeFinalPrompt({
        rawPrompt: targetScene.aiPrompt || '',
        directorModifiers: targetScene.directorModifiers,
        shotDirector: targetScene.shotDirector,
        cinematicStylePresetId: (targetScene as any).cinematicStylePresetId,
        brandCharacter: brandCharacterInputSingle,
        libraryCharacters: libCharacters,
        libraryLocations: libLocations,
        audioPlan: targetScene.audioPlan,
        performanceEntries: derivePerformanceEntries(targetScene, characters),
        language: directorLanguage,
      });


      const preparedSingle = targetScene.clipSource.startsWith('ai-') && targetScene.engineOverride !== 'cinematic-sync'
        ? await prepareSceneAnchor(targetScene, characters, activeBrandChar, composedSingle.finalPrompt, '16:9', {}, libLocations)
        : undefined;
      if (preparedSingle?.anchor) {
        console.log(
          `[ClipsTab] single scene ${targetScene.id} → ${preparedSingle.anchor.strategy} (${preparedSingle.anchor.name}, source=${preparedSingle.anchor.source}, composed=${preparedSingle.composed})`,
        );
      }
      // Freeze the composed first-frame on the scene so future re-rolls reuse
      // it deterministically (no Nano-Banana drift between rolls).
      if (preparedSingle?.composed && preparedSingle.firstFrameUrl) {
        const frozen = pScenes.map(s =>
          s.id === targetScene.id ? { ...s, referenceImageUrl: preparedSingle.firstFrameUrl } : s
        );
        onUpdateScenes(frozen);
      }

      const { data, error } = await supabase.functions.invoke('compose-video-clips', {
        body: {
          projectId: pid,
          visualStyle,
          characters,
          scenes: [{
            id: targetScene.id,
            clipSource: targetScene.clipSource,
            clipQuality: targetScene.clipQuality || 'standard',
            aiPrompt: composedSingle.finalPrompt,
            negativePrompt: composedSingle.negativePrompt || undefined,
            stockKeywords: targetScene.stockKeywords,
            uploadUrl: targetScene.uploadUrl,
            referenceImageUrl: preparedSingle?.firstFrameUrl,
            subjectReferenceUrl: preparedSingle?.subjectReferenceUrl,
            durationSeconds: targetScene.durationSeconds,
            characterShot: targetScene.characterShot,
            characterShots: targetScene.characterShots,
            dialogScript: targetScene.dialogScript,
            dialogVoices: targetScene.dialogVoices,
            engineOverride: targetScene.engineOverride ?? 'auto',
            withAudio: targetScene.withAudio !== false,
          }],
        },
      });
      if (error) throw error;

      const result = data?.results?.[0];
      if (result) {
        const updatedScenes = pScenes.map(s => {
          if (s.id !== targetScene.id) return s;
          const isAiImage = s.clipSource === 'ai-image';
          return {
            ...s,
            clipStatus: result.status,
            clipUrl: result.clipUrl || s.clipUrl,
            uploadType:
              isAiImage && result.status === 'ready' ? 'image' : s.uploadType,
            replicatePredictionId: result.predictionId || s.replicatePredictionId,
          };
        });
        onUpdateScenes(updatedScenes);
      }
      toast({ title: 'Generierung gestartet', description: `Szene ${(targetScene.orderIndex ?? 0) + 1}` });
      setTimeout(pollScenes, 500);
    } catch (err: any) {
      // Roll back the optimistic 'generating' status so the spinner clears
      // and the Re-Roll button reappears.
      const rolledBack = scenes.map(s =>
        s.id === scene.id ? { ...s, clipStatus: previousStatus } : s
      );
      onUpdateScenes(rolledBack);
      console.error('[ClipsTab] handleGenerateSingle failed', err);
      const realMsg = await extractFunctionsError(err);
      toast({
        title: 'Fehler',
        description: realMsg || err?.message || 'Re-Roll fehlgeschlagen — bitte erneut versuchen.',
        variant: 'destructive',
      });
    } finally {
      setSingleGenerating(prev => ({ ...prev, [scene.id]: false }));
    }
  };

  /**
   * Cinematic-Sync dedicated start path. Bypasses the slow prepareSceneAnchor()
   * detour and the stale-closure trap of handleGenerateSingle/ensureProject so
   * the click ALWAYS produces:
   *   1. Immediate visible "generating" state on the scene card.
   *   2. A persisted engine_override='cinematic-sync' + clip_source='ai-hailuo'
   *      so polls/reloads see the correct engine.
   *   3. A guaranteed compose-video-clips invocation with the right payload.
   */
  const handleStartCinematicSync = async (scene: ComposerScene) => {
    setSingleGenerating(prev => ({ ...prev, [scene.id]: true }));
    const newClipSource: ComposerScene['clipSource'] =
      scene.clipSource.startsWith('ai-') ? scene.clipSource : 'ai-hailuo';

    const isUuid = (v?: string) =>
      !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

    // 1. Optimistic UI — flip status, engine + source RIGHT NOW so the user
    //    sees immediate feedback regardless of how slow the backend is.
    const optimistic = scenes.map((s) =>
      s.id === scene.id
        ? {
            ...s,
            engineOverride: 'cinematic-sync' as const,
            clipSource: newClipSource,
            clipStatus: 'generating' as const,
            lipSyncStatus: 'pending' as const,
          }
        : s,
    );
    // Use the local-only updater so the debounced full-scenes flush in the
    // dashboard cannot overwrite engine_override / clip_status 600 ms later
    // with a stale snapshot. The single-row DB update below is the source of truth.
    (onUpdateScenesLocalOnly ?? onUpdateScenes)(optimistic);

    try {
      // 2. Resolve the persisted scene id + project id WITHOUT rewriting the
      //    full project (the old path called ensureProjectPersisted(project),
      //    which writes a stale `project.scenes` snapshot back to DB and
      //    silently reverted engine_override/clip_source/clip_status — that
      //    was the root cause of "render starts and disappears").
      let pid = projectId;
      let targetSceneId = scene.id;
      let dbScene: ComposerScene = { ...scene, ...optimistic.find((s) => s.id === scene.id) } as ComposerScene;

      if (!isUuid(targetSceneId) || !pid) {
        // Only when we truly don't have a persisted row yet do we fall back
        // to the full project save — and we re-apply our overrides afterwards.
        const persisted = await ensureProject();
        if (!persisted) throw new Error('Projekt konnte nicht gespeichert werden');
        pid = persisted.projectId;
        const remapped =
          persisted.scenes.find((s) => s.orderIndex === scene.orderIndex) ?? scene;
        targetSceneId = remapped.id;
        dbScene = { ...remapped };
      }

      // 3. Persist the engine + source override + status for THIS scene only.
      //    Single-row update — no risk of clobbering anything else.
      const { error: persistErr } = await supabase
        .from('composer_scenes')
        .update({
          engine_override: 'cinematic-sync',
          clip_source: newClipSource,
          clip_status: 'generating',
          lip_sync_status: 'pending',
          lip_sync_with_voiceover: true,
          // Re-Run: alten Abschluss-Zustand wegräumen, sonst verwirft der
          // Auto-Trigger die Szene als „bereits angewendet".
          lip_sync_applied_at: null,
          dialog_shots: null,
          lip_sync_source_clip_url: null,
          twoshot_stage: null,
        })
        .eq('id', targetSceneId);
      if (persistErr) {
        console.error('[ClipsTab] cinematic-sync DB persist failed:', persistErr);
        throw new Error(persistErr.message || 'Cinematic-Sync konnte nicht gespeichert werden');
      }

      const composed = composeFinalPrompt({
        rawPrompt: dbScene.aiPrompt || scene.aiPrompt || '',
        directorModifiers: dbScene.directorModifiers,
        shotDirector: dbScene.shotDirector,
        cinematicStylePresetId: (dbScene as any).cinematicStylePresetId,
        brandCharacter: buildBrandInputForScene(dbScene),
        libraryCharacters: libCharacters,
        libraryLocations: libLocations,
        audioPlan: dbScene.audioPlan,
        performanceEntries: derivePerformanceEntries(dbScene, characters),
        language: directorLanguage,
      });


      // 4. Scene-Aware Character Anchor — composes ALL selected characters into
      //    the requested scene composition via Nano Banana 2 (compose-scene-anchor).
      //    Without this, Hailuo i2v has no anchor for multi-character ensembles
      //    and falls back to a generic close-up of one person.
      // Cinematic-Sync must not freeze a client-side anchor: the server creates
      // and audits the exact 2-speaker frame, otherwise prompt-name matches can
      // leak a third portrait before the safety audit runs.
      let composedFirstFrame: string | undefined = undefined;

      // 5. Fire compose-video-clips with explicit cinematic-sync payload.
      const { data, error } = await supabase.functions.invoke('compose-video-clips', {
        body: {
          projectId: pid,
          visualStyle,
          characters,
          scenes: [{
            id: targetSceneId,
            clipSource: newClipSource,
            clipQuality: dbScene.clipQuality || 'standard',
            aiPrompt: composed.finalPrompt,
            negativePrompt: composed.negativePrompt || undefined,
            referenceImageUrl: composedFirstFrame,
            durationSeconds: dbScene.durationSeconds,
            characterShot: dbScene.characterShot,
            characterShots: dbScene.characterShots,
            dialogScript: dbScene.dialogScript,
            dialogVoices: dbScene.dialogVoices,
            engineOverride: 'cinematic-sync',
            withAudio: dbScene.withAudio !== false,
          }],
        },
      });
      if (error) throw error;

      const result = data?.results?.[0];
      if (result?.status === 'failed') {
        throw new Error(result.error || 'Cinematic-Sync Render fehlgeschlagen');
      }

      toast({
        title: '🎬 Cinematic-Sync gestartet',
        description: `Szene ${(scene.orderIndex ?? 0) + 1}: Hailuo rendert die echte Szene (~60 s), danach läuft Sync.so Lip-Sync automatisch.`,
      });
      setTimeout(pollScenes, 800);
    } catch (err: any) {
      console.error('[ClipsTab] handleStartCinematicSync failed', err);
      // Roll back optimistic state.
      const rolledBack = scenes.map((s) =>
        s.id === scene.id
          ? { ...s, clipStatus: scene.clipStatus, lipSyncStatus: scene.lipSyncStatus ?? null }
          : s,
      );
      (onUpdateScenesLocalOnly ?? onUpdateScenes)(rolledBack);
      const realMsg = await extractFunctionsError(err);
      toast({
        title: 'Cinematic-Sync fehlgeschlagen',
        description: realMsg || err?.message || 'Bitte erneut versuchen.',
        variant: 'destructive',
      });
    } finally {
      setSingleGenerating(prev => ({ ...prev, [scene.id]: false }));
    }
  };

  const handleSearchStock = async (sceneId: string) => {
    const query = stockSearch[sceneId];
    if (!query) return;

    setSearchingStock(prev => ({ ...prev, [sceneId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('search-stock-videos', {
        body: { query, perPage: 6 },
      });
      if (error) throw error;
      setStockResults(prev => ({ ...prev, [sceneId]: data?.videos || [] }));
    } catch (err) {
      toast({ title: 'Stock-Suche fehlgeschlagen', variant: 'destructive' });
    } finally {
      setSearchingStock(prev => ({ ...prev, [sceneId]: false }));
    }
  };

  const handleSelectStock = (sceneId: string, videoUrl: string) => {
    const updatedScenes = scenes.map(s =>
      s.id === sceneId ? { ...s, clipUrl: videoUrl, clipStatus: 'ready' as const, clipSource: 'stock' as const } : s
    );
    onUpdateScenes(updatedScenes);
    setStockResults(prev => ({ ...prev, [sceneId]: [] }));
    toast({ title: 'Stock-Video ausgewählt' });
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Hebel 8: Multi-Scene Render Pipeline (Render All & Stitch → Director's Cut) */}
      <RenderPipelinePanel
        projectId={projectId}
        scenes={scenes}
        pendingCount={pendingScenes.length}
        failedCount={scenes.filter((s) => s.clipStatus === 'failed').length}
        isAllReady={allReady}
        onGenerateAll={handleGenerateAll}
      />
      {/* Re-Roll Hint Banner */}
      {!rerollHintDismissed && scenes.some(s => s.clipSource.startsWith('ai-')) && (
        <div className="relative p-3 rounded-lg border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-amber-500/5 flex items-start gap-3">
          <Lightbulb className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-[11px] text-foreground/90 leading-relaxed">
            <span className="font-semibold text-amber-300">Nicht zufrieden mit einer Szene?</span>{' '}
            Klicke auf <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-medium"><RefreshCw className="h-2.5 w-2.5" />Neu generieren</span> bei einer fertigen Szene, um sie erneut zu erstellen — jeder Re-Roll kostet erneut Credits, aber du kannst Stil, Prompt oder Charakter-Shot vorher anpassen.
          </div>
          <button
            onClick={dismissRerollHint}
            className="flex-shrink-0 text-amber-400/60 hover:text-amber-300 transition-colors"
            aria-label="Hinweis schließen"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Summary Bar with Progress */}
      <div className="p-3 rounded-lg bg-card/60 border border-border/40 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xs font-medium">
              {readyCount}/{scenes.length} Clips fertig
            </div>
            {generatingCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-accent">
                <Loader2 className="h-3 w-3 animate-spin" />
                {generatingCount} werden generiert…
              </div>
            )}
            {remainingCost > 0 && (
              <div className="flex items-center gap-1 text-xs text-amber-400">
                <DollarSign className="h-3 w-3" />
                €{remainingCost.toFixed(2)} verbleibend
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateAll}
              disabled={isGeneratingAll || scenes.length === 0 || pendingScenes.length === 0}
              className="gap-1 text-xs"
            >
              {isGeneratingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {pendingScenes.length === 0
                ? 'Alle Clips bereit'
                : `Alle generieren (${pendingScenes.length} • €${remainingCost.toFixed(2)})`}
            </Button>
            <Button
              size="sm"
              onClick={onGoToVoiceSubtitles}
              disabled={!allReady && readyCount === 0}
              className="gap-1 text-xs"
            >
              Weiter zu Voiceover & Untertitel <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <Progress value={progressPercent} className="h-1.5" />
        <p className="text-[10px] text-muted-foreground/70 italic">
          Credits werden pro Generierung abgezogen — Re-Rolls kosten erneut.
        </p>
      </div>

      {/* Re-Roll Confirmation Dialog */}
      <AlertDialog open={!!rerollTarget} onOpenChange={(open) => !open && setRerollTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Szene {(rerollTarget?.orderIndex ?? 0) + 1} neu generieren?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Dies kostet erneut{' '}
                  <span className="font-semibold text-amber-400">
                    €{rerollTarget ? getClipCost(rerollTarget.clipSource, rerollTarget.clipQuality || 'standard', rerollTarget.durationSeconds).toFixed(2) : '0.00'}
                  </span>
                  . Der vorherige Clip wird ersetzt.
                </p>
                <p className="text-xs text-muted-foreground">
                  💡 Tipp: Passe vorher den Prompt im Storyboard-Tab oder den Charakter-Shot-Typ an, um ein anderes Ergebnis zu bekommen.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (rerollTarget) {
                  const target = rerollTarget;
                  setRerollTarget(null);
                  handleGenerateSingle(target);
                }
              }}
              className="bg-amber-500 hover:bg-amber-600 text-amber-950"
            >
              Neu generieren €{rerollTarget ? getClipCost(rerollTarget.clipSource, rerollTarget.clipQuality || 'standard', rerollTarget.durationSeconds).toFixed(2) : '0.00'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cinematic-Sync Switch Confirmation */}
      <AlertDialog open={!!cinematicSwitchTarget} onOpenChange={(open) => !open && setCinematicSwitchTarget(null)}>
        <AlertDialogContent>
          {(() => {
            const target = cinematicSwitchTarget;
            const speakerCount = target ? countSpeakers(target) : 0;
            const isMultiSpeaker = speakerCount > 1;
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    <span className="inline-flex items-center gap-2">
                      <Clapperboard className="h-4 w-4 text-emerald-400" />
                      Szene {(target?.orderIndex ?? 0) + 1} in echte Szene einbauen?
                    </span>
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-sm">
                      {isMultiSpeaker ? (
                        <>
                          <p className="text-emerald-300 font-semibold">
                            🎭 Two-Shot Lip-Sync: {speakerCount} Sprecher
                          </p>
                          <p>
                            Cinematic-Sync rendert die Szene als echten Two-Shot und legt anschließend{' '}
                            <span className="font-semibold">einen Sync.so-Pass pro Sprecher</span> über den Clip —
                            jeder Pass wird per Gemini-Face-Lock auf das korrekte Gesicht (links/rechts) gepinnt.
                            Die gemischte Dialog-Tonspur läuft als externe WAV synchron mit (Artlist-Pipeline).
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Kostet ca. {Math.round(14 * speakerCount)} Credits (~{speakerCount}× Sync.so lipsync-2-pro).
                          </p>
                        </>
                      ) : (
                        <>
                          <p>
                            Statt des HeyGen-Avatar-Bilds rendert <span className="font-semibold text-emerald-300">Hailuo</span> die echte
                            Storyboard-Szene (Umgebung, Kamera, Licht). Danach wird der Charakter
                            via <span className="font-semibold">Sync.so Lip-Sync</span> in die Szene eingebaut — wie bei Artlist.
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Falls dein Voiceover länger ist als die aktuelle Szenen-Dauer, wird die Szene <span className="font-semibold">automatisch verlängert</span> (Hailuo: 6 s oder 10 s), damit das Lip-Sync vollständig läuft.
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Kosten: <span className="font-semibold text-amber-400">~€0.95</span> (vs. €0.30 aktuell). Der bestehende Clip wird ersetzt.
                            Die Pipeline läuft ~2 Minuten und refundiert automatisch bei Fehlern.
                          </p>
                        </>
                      )}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  {!isMultiSpeaker && (
                    <AlertDialogAction
                      onClick={() => {
                        const t = cinematicSwitchTarget;
                        setCinematicSwitchTarget(null);
                        if (!t) return;
                        // Dedicated start path — guarantees immediate visible
                        // progress + correct engine_override + compose call.
                        handleStartCinematicSync(t);
                      }}
                      className="bg-emerald-500 hover:bg-emerald-600 text-emerald-950"
                    >
                      <Clapperboard className="h-3.5 w-3.5 mr-1" />
                      Cinematic-Sync starten €0.95
                    </AlertDialogAction>
                  )}
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      {/* Continuity Guardian — Reference-Chaining 2.0 */}
      <ContinuityGuardianStrip
        scenes={scenes}
        projectId={projectId}
        onUpdateScenes={onUpdateScenes}
        onRepairScene={(s) => handleGenerateSingle(s)}
      />

      {/* Cinematic-Sync Hint — only when ≥1 ready HeyGen scene exists and not dismissed */}
      {!hintDismissed && scenes.some((s) => s.clipStatus === 'ready' && recommendEngineForScene(s).engine === 'heygen-talking-head') && (
        <div className="relative rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 pr-10 text-xs text-emerald-100/90">
          <button
            type="button"
            onClick={() => {
              setHintDismissed(true);
              try { localStorage.setItem('composer:cinematic-sync-hint-dismissed', '1'); } catch {}
            }}
            className="absolute top-2 right-2 p-1 rounded hover:bg-emerald-500/20 text-emerald-300/70 hover:text-emerald-200"
            aria-label="Hinweis schließen"
          >
            <X className="h-3 w-3" />
          </button>
          <div className="flex items-start gap-2">
            <Clapperboard className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <div className="space-y-1.5">
              <div>
                <strong className="text-emerald-300">Tipp – Artlist-Pipeline:</strong> Deine HeyGen-Szenen zeigen den Avatar vor neutralem Hintergrund.
                Klicke bei einer fertigen HeyGen-Szene rechts auf <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 font-medium"><Clapperboard className="h-2.5 w-2.5" />In echte Szene einbauen</span>,
                um die Person stattdessen in deine Wunsch-Szene mit Hailuo zu rendern und automatisch lip-syncen zu lassen. <span className="text-amber-300">+€0.65 / Szene.</span>
              </div>
              <div className="text-[11px] text-muted-foreground/90 border-t border-emerald-500/20 pt-1.5">
                <span className="font-semibold text-emerald-300/90">ℹ️ Multi-Charakter-Szenen:</span> Sync.so kann nur einen Charakter pro Clip lip-syncen.
                Zerlege Multi-Speaker-Dialoge zuerst in <span className="font-medium">eine Szene pro Sprecher (Shot-Reverse-Shot)</span> — pro Cut läuft dann eine eigene Cinematic-Sync-Pipeline.
                Es gibt <span className="italic">kein Layering</span> mehrerer Sprecher in einen Clip.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clip Cards */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="grid gap-3">
            {scenes.map((scene, i) => {
              const status = statusConfig[scene.clipStatus] || statusConfig.pending;
          const sceneQuality = scene.clipQuality || 'standard';
          const baseCost = scene.clipSource.startsWith('ai-')
            ? getClipCost(scene.clipSource, sceneQuality, scene.durationSeconds)
            : 0;
          const engineRec = recommendEngineForScene(scene);
          const isHeygen = engineRec.engine === 'heygen-talking-head';
          // For HeyGen, the actual render cost = HeyGen extra cost (no Hailuo).
          // For sync-polish, base + extra. For broll, just base.
          const costPerClip = isHeygen
            ? engineRec.extraCostEur
            : baseCost + (engineRec.engine === 'sync-polish' ? engineRec.extraCostEur : 0);
          const isUpload = scene.clipSource === 'upload';
          const hasUpload = !!scene.uploadUrl;
          const isAi = scene.clipSource.startsWith('ai-') || isHeygen;
          const isStock = scene.clipSource === 'stock';
          const isThisGenerating = singleGenerating[scene.id] || scene.clipStatus === 'generating';

          return (
            <SortableSceneItem
              key={scene.id}
              id={scene.id}
              badge={
                <span className="text-[10px] font-mono text-muted-foreground/70 px-1">#{i + 1}</span>
              }
            >
            <Card className="border-border/40 bg-card/80 overflow-hidden w-full max-w-full">
              <CardContent className="p-3 space-y-2 overflow-hidden">
                <div className="flex items-stretch gap-3 min-w-0 w-full">
                  {/* Larger preview slot */}
                  <div className="w-36 h-20 rounded border border-border/30 flex-shrink-0 overflow-hidden">
                    <SceneClipProgress scene={scene} index={i} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between overflow-hidden">
                    <div className="min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-medium">Szene {i + 1}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {SCENE_TYPE_LABELS[scene.sceneType]?.de}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{scene.durationSeconds}s</span>
                        {costPerClip > 0 && (
                          <span className="text-[10px] text-amber-400">€{costPerClip.toFixed(2)}</span>
                        )}
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border ${status.bg} ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <p
                        className="text-[11px] text-foreground/80 overflow-hidden text-ellipsis break-words"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                        title={scene.aiPrompt || scene.stockKeywords || ''}
                      >
                        {scene.aiPrompt || scene.stockKeywords || (isUpload ? 'Eigener Upload' : 'Kein Prompt')}
                      </p>
                      <p
                        className="text-[10px] text-muted-foreground/70 mt-0.5 flex items-center gap-1.5 flex-wrap overflow-hidden"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        <span>{isHeygen ? 'HeyGen Photo Avatar' : CLIP_SOURCE_LABELS[scene.clipSource]?.de}</span>
                        {/* Engine pill — sichtbar pro Szene, klar wer rendert */}
                        <span
                          className={`px-1.5 py-0 rounded text-[9px] border ${
                            isHeygen
                              ? 'border-primary/60 bg-primary/15 text-primary'
                              : engineRec.engine === 'sync-polish'
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                              : 'border-border/40 bg-muted/40 text-muted-foreground'
                          }`}
                          title={engineRec.reason}
                        >
                          {engineRec.label}
                        </span>
                        {isAi && !isHeygen && (
                          <span className={`px-1.5 py-0 rounded text-[9px] border ${
                            sceneQuality === 'pro'
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                              : 'border-border/40 bg-muted/40 text-muted-foreground'
                          }`}>
                            {QUALITY_LABELS[scene.clipSource][sceneQuality]}
                          </span>
                        )}
                        {isAi && scene.referenceImageUrl && (
                          <span className="px-1.5 py-0 rounded text-[9px] border border-primary/40 bg-primary/10 text-primary inline-flex items-center gap-1">
                            <Sparkles className="h-2.5 w-2.5" />
                            Mit Referenzbild
                          </span>
                        )}
                        {scene.clipStatus === 'generating' && isAi && (
                          <span className="text-accent inline-flex items-center gap-1">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            KI rendert ca. 30–60s…
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 justify-center">
                    {/* Pending AI → Generate button */}
                    {isAi && scene.clipStatus === 'pending' && (
                      <Button
                        size="sm"
                        onClick={() => handleGenerateSingle(scene)}
                        disabled={isThisGenerating}
                        className="gap-1 text-[10px] h-7 px-2"
                      >
                        {isThisGenerating ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        Generieren €{costPerClip.toFixed(2)}
                      </Button>
                    )}
                    {/* Failed → Retry */}
                    {scene.clipStatus === 'failed' && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleGenerateSingle(scene)}
                        disabled={isThisGenerating}
                        className="gap-1 text-[10px] h-7 px-2"
                      >
                        {isThisGenerating ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Erneut versuchen
                      </Button>
                    )}
                    {/* Ready → Re-roll */}
                    {scene.clipStatus === 'ready' && isAi && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-[10px] h-7 px-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                        title="Diese Szene neu generieren (kostet erneut Credits)"
                        disabled={isThisGenerating}
                        onClick={() => setRerollTarget(scene)}
                      >
                        {isThisGenerating ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Neu generieren €{costPerClip.toFixed(2)}
                      </Button>
                    )}
                    {/* Cinematic-Sync Switch — Artlist-style: render real scene with Hailuo + auto lip-sync */}
                    {scene.clipStatus === 'ready' && isHeygen && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-[10px] h-7 px-2 border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200"
                        title="Statt HeyGen-Avatar wird die echte Wunsch-Szene mit Hailuo gerendert und der Charakter darin lip-synct (Artlist-Pipeline). ~€0.95 statt €0.30."
                        disabled={isThisGenerating}
                        onClick={() => setCinematicSwitchTarget(scene)}
                      >
                        <Clapperboard className="h-3 w-3" />
                        In echte Szene einbauen €0.95
                      </Button>
                    )}
                    {scene.clipStatus === 'ready' && scene.clipUrl && (() => {
                      const isSaved = savedSceneIds.has(scene.id);
                      const isSaving = savingSceneId === scene.id;
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-[10px] h-7 px-2 border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-60"
                          title={isSaved ? 'Diese Szene ist bereits in deiner Mediathek' : 'Diese Szene als eigenständigen Clip in deiner Mediathek ablegen'}
                          disabled={isSaving || isSaved}
                          onClick={() => saveSceneToLibrary(scene, projectId)}
                        >
                          {isSaving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isSaved ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Save className="h-3 w-3" />
                          )}
                          {isSaved ? 'Gespeichert' : 'In Mediathek'}
                        </Button>
                      );
                    })()}
                    {/* Frame-to-Shot Continuity → use last frame as next scene's start */}
                    {scene.clipStatus === 'ready' && scene.clipUrl && (() => {
                      const next = scenes[i + 1];
                      if (!next) return null;
                      const nextIsAi = next.clipSource.startsWith('ai-');
                      if (!nextIsAi) return null;
                      const isExtracting = extractingSceneId === scene.id;
                      const alreadyApplied = !!next.referenceImageUrl;
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-[10px] h-7 px-2 border-primary/40 text-primary hover:bg-primary/10"
                          title="Letzten Frame dieser Szene als Startbild der nächsten Szene nutzen — für nahtlose Übergänge."
                          disabled={isExtracting || alreadyApplied}
                          onClick={() => handleApplyContinuityToNext(scene, next)}
                        >
                          {isExtracting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Link2 className="h-3 w-3" />
                          )}
                          {alreadyApplied ? 'Continuity ✓' : 'Continuity → #' + (i + 2)}
                        </Button>
                      );
                    })()}
                    {/* Frame-Picker (Artlist-style: pick ANY frame) */}
                    {scene.clipStatus === 'ready' && scene.clipUrl && (() => {
                      const next = scenes[i + 1];
                      if (!next) return null;
                      const nextIsAi = next.clipSource.startsWith('ai-');
                      if (!nextIsAi) return null;
                      return (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-[10px] h-7 px-2 text-primary hover:bg-primary/10"
                          title="Beliebigen Frame aus diesem Clip als Startbild der nächsten Szene wählen."
                          onClick={() => setFramePickerState({ source: scene, target: next, targetIndex: i + 2 })}
                        >
                          <Search className="h-3 w-3" />
                          Frame wählen…
                        </Button>
                      );
                    })()}
                    {/* Generating disabled marker */}
                    {scene.clipStatus === 'generating' && (
                      <Button size="sm" disabled className="gap-1 text-[10px] h-7 px-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Wird generiert…
                      </Button>
                    )}
                    {/* Stock pending */}
                    {isStock && scene.clipStatus !== 'ready' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-[10px] h-7 px-2"
                        onClick={() => {
                          setStockSearch(prev => ({ ...prev, [scene.id]: scene.stockKeywords || scene.aiPrompt || '' }));
                          setStockResults(prev => ({ ...prev, [scene.id]: prev[scene.id] || [] }));
                        }}
                      >
                        <Search className="h-3 w-3" />
                        Stock suchen
                      </Button>
                    )}
                    {/* Upload missing */}
                    {isUpload && !hasUpload && (
                      <span className="text-[10px] text-muted-foreground italic px-2">
                        Datei im Storyboard hochladen
                      </span>
                    )}
                    {/* Stock alt search button (always available) */}
                    {!isStock && scene.clipStatus !== 'generating' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Stock-Alternative suchen"
                        onClick={() => {
                          setStockSearch(prev => ({ ...prev, [scene.id]: scene.stockKeywords || scene.aiPrompt || '' }));
                          setStockResults(prev => ({ ...prev, [scene.id]: prev[scene.id] || [] }));
                        }}
                      >
                        <Film className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Stock Search Inline */}
                {stockSearch[scene.id] !== undefined && (
                  <div className="space-y-2 pt-2 border-t border-border/20">
                    <div className="flex gap-2">
                      <Input
                        value={stockSearch[scene.id]}
                        onChange={(e) => setStockSearch(prev => ({ ...prev, [scene.id]: e.target.value }))}
                        placeholder="Stock-Video suchen..."
                        className="h-7 text-xs"
                        onKeyDown={(e) => e.key === 'Enter' && handleSearchStock(scene.id)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSearchStock(scene.id)}
                        disabled={searchingStock[scene.id]}
                        className="h-7 text-xs gap-1"
                      >
                        {searchingStock[scene.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                        Suchen
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setStockSearch(prev => { const n = { ...prev }; delete n[scene.id]; return n; });
                          setStockResults(prev => { const n = { ...prev }; delete n[scene.id]; return n; });
                        }}
                        className="h-7 text-xs"
                      >
                        ✕
                      </Button>
                    </div>

                    {stockResults[scene.id]?.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {stockResults[scene.id].map((video: any) => (
                          <button
                            key={video.id}
                            onClick={() => handleSelectStock(scene.id, video.url)}
                            className="relative rounded overflow-hidden border border-border/30 hover:border-primary/60 transition-colors group"
                          >
                            <img
                              src={video.thumbnail_url}
                              alt="Stock Video"
                              className="w-full h-16 object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <span className="text-[9px] text-white font-medium">Auswählen</span>
                            </div>
                            <div className="absolute bottom-0.5 right-0.5">
                              <Badge variant="secondary" className="text-[8px] px-1 py-0">
                                {video.duration_sec}s • {video.source}
                              </Badge>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            </SortableSceneItem>
          );
        })}
          </div>
        </SortableContext>
      </DndContext>
      {framePickerState && (
        <FramePickerOverlay
          open={!!framePickerState}
          onOpenChange={(o) => { if (!o) setFramePickerState(null); }}
          sourceScene={framePickerState.source}
          targetScene={framePickerState.target}
          targetSceneIndex={framePickerState.targetIndex}
          projectId={projectId}
          onApply={handleFramePicked}
        />
      )}
    </div>
  );
}
