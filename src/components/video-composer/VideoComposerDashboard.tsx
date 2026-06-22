import { useState, useCallback, useEffect, useRef } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FileText, LayoutGrid, Film, Music, Download, ArrowLeft, AlertTriangle, RotateCcw, Mic, Sparkles, Megaphone, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from '@/hooks/useTranslation';
import BriefingTab from './BriefingTab';
import StoryboardTab from './StoryboardTab';
import { ComposerTabErrorBoundary } from './ComposerTabErrorBoundary';
import ClipsTab from './ClipsTab';
import VoiceSubtitlesTab from './VoiceSubtitlesTab';
import AudioTab from './AudioTab';
import AssemblyTab from './AssemblyTab';
import { NLEExportPanel } from './NLEExportPanel';
import type {
  ComposerBriefing,
  ComposerScene,
  AssemblyConfig,
  ComposerCategory,
  ComposerStatus,
  ClipStatus,
  ClipSource,
  ClipQuality,
  AdCampaignMeta,
} from '@/types/video-composer';
import { getClipCost, DEFAULT_TEXT_OVERLAY } from '@/types/video-composer';
import { useComposerPersistence, persistAssemblyConfig, persistAdMeta } from '@/hooks/useComposerPersistence';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import MotionStudioTemplatePicker from './MotionStudioTemplatePicker';
import MotionStudioTopStepper, { type TopStepperStep } from './MotionStudioTopStepper';
import PipelineProgressBar from './PipelineProgressBar';
import AutoDirectorWizard from './AutoDirectorWizard';
import AdDirectorWizard from './AdDirectorWizard';
import ShareProjectDialog from './ShareProjectDialog';
import CollaboratorAvatars from './CollaboratorAvatars';
import AdCampaignTree from './AdCampaignTree';
import { spawnAdCampaignChildren } from '@/lib/adDirector/spawnAdCampaignChildren';
import { propagateDialogLock } from '@/lib/video-composer/propagateDialogLock';
import { castSignature } from '@/lib/video-composer/castSignature';
import { resolveLipSyncValue, getLipSyncPending, resolveDialogModeValue, getDialogModePending, resolveEngineOverrideValue, getEngineOverridePending } from '@/lib/video-composer/lipSyncPending';
import {
  useComposerPresence,
  useComposerScenesRealtime,
} from '@/hooks/useComposerCollaboration';
import { useTwoShotAutoTrigger } from '@/hooks/useTwoShotAutoTrigger';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useComposerHistory } from '@/hooks/useComposerHistory';
import { ComposerHistoryContext } from './ComposerHistoryContext';
import { useIncrementTemplateUsage } from '@/hooks/useMotionStudioTemplates';
import type { MotionStudioTemplate } from '@/types/motion-studio-templates';

type TabId = 'briefing' | 'storyboard' | 'clips' | 'text' | 'audio' | 'export' | 'campaign';

interface LocalProject {
  id?: string;
  title: string;
  category: ComposerCategory;
  briefing: ComposerBriefing;
  status: ComposerStatus;
  scenes: ComposerScene[];
  assemblyConfig: AssemblyConfig;
  totalCostEuros: number;
  language: string;
  outputUrl?: string;
  brandKitId?: string | null;
  brandKitAutoSync?: boolean;
  adMeta?: AdCampaignMeta | null;
  adVariantStrategy?: string | null;
  parentProjectId?: string | null;
  cutdownType?: string | null;
}

const STORAGE_KEY = 'video-composer-draft';
const TAB_STORAGE_KEY = 'video-composer-draft-tab';
const TAB_ORDER: TabId[] = ['briefing', 'storyboard', 'text', 'audio', 'export', 'campaign'];

function loadDraft(): LocalProject | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return null;
}

function saveDraft(project: LocalProject) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch { /* ignore */ }
}

function clearDraft() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TAB_STORAGE_KEY);
  } catch { /* ignore */ }
}

/** Restore the last active tab purely from localStorage.
 *  Tab content components handle empty-draft state themselves (e.g. Briefing
 *  shows the form, other tabs show empty states), so no accessibility pre-check
 *  is needed — the previous strict gating caused unwanted resets to 'briefing'. */
function restoreActiveTab(): TabId {
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY) as TabId | null;
    if (stored === 'clips') return 'storyboard';
    if (stored && TAB_ORDER.includes(stored)) return stored;
    return 'briefing';
  } catch {
    return 'briefing';
  }
}

const defaultProject: LocalProject = {
  title: '',
  category: 'product-ad',
  briefing: {
    mode: 'ai',
    productName: '',
    productDescription: '',
    usps: [],
    targetAudience: '',
    tone: 'professional',
    duration: 30,
    aspectRatio: '16:9',
    brandColors: [],
    characters: [],
  },
  status: 'draft',
  scenes: [],
  assemblyConfig: {
    colorGrading: 'none',
    transitionStyle: 'crossfade',
    kineticText: false,
    voiceover: null,
    music: null,
    beatSync: false,
  },
  totalCostEuros: 0,
  language: 'de',
};

const isUuid = (val?: string | null) =>
  !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

export default function VideoComposerDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();

  // URL takes precedence over localStorage. If ?projectId=<uuid> is set
  // (e.g. after Auto-Director or Ad-Director redirect), discard the local
  // draft and seed state with that ID so the DB-hydration effect below
  // pulls the freshly-created project + scenes from Supabase.
  const urlProjectId = searchParams.get('projectId');
  const urlTab = searchParams.get('tab') as TabId | null;
  const hasUrlProject = isUuid(urlProjectId);

  const [project, setProject] = useState<LocalProject>(() => {
    if (hasUrlProject) {
      // Fresh project from a director-wizard redirect — drop any stale draft
      // so we don't merge unrelated scenes. Hydration effect will fill it in.
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      return { ...defaultProject, id: urlProjectId! };
    }
    const draft = loadDraft();
    if (!draft) return defaultProject;
    // Stage 6: detox stale optimistic patches. A scene marked clipStatus
    // 'generating' WITHOUT a backend job handle (no predictionId, no
    // lipSync/twoshot in flight) is a dead optimistic patch from a previous
    // session — reset to 'pending' so the UI doesn't show a fake "Baut…"
    // overlay until DB-sync arrives ~1s later.
    const detoxedScenes = (draft.scenes ?? []).map((s: any) => {
      const lip = s?.lipSyncStatus;
      const two = s?.twoshotStage;
      const hasJob =
        !!s?.replicatePredictionId ||
        lip === 'running' ||
        (two && two !== 'failed' && two !== 'done' && two !== 'complete');
      if (s?.clipStatus === 'generating' && !hasJob) {
        return { ...s, clipStatus: 'pending' };
      }
      return s;
    });
    return { ...draft, scenes: detoxedScenes };
  });

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    // Stage 19: Clips-Tab ist konsolidiert ins Storyboard — alte Deep-Links umleiten.
    if (urlTab === 'clips') return 'storyboard';
    if (urlTab && TAB_ORDER.includes(urlTab)) return urlTab;
    const restored = restoreActiveTab();
    return restored === 'clips' ? 'storyboard' : restored;
  });
  const [error, setError] = useState<string | null>(null);
  const [isPersisting, setIsPersisting] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  // True while the BriefingTab's AI mode is running compose-video-storyboard.
  // Used to show a loading panel on the (already-active) Storyboard tab.
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  // Last storyboard-generation failure surfaced from BriefingTab. When set,
  // the Storyboard tab renders a Bond-style error panel with retry instead
  // of bouncing the user silently back to Briefing.
  const [storyboardError, setStoryboardError] = useState<{ message: string; retryable: boolean } | null>(null);
  // Counter the storyboard-error panel increments to ask BriefingTab to
  // re-run `handleGenerateStoryboard` with the current briefing.
  const [retryStoryboardNonce, setRetryStoryboardNonce] = useState(0);
  // Auto-open template picker when starting fresh (no draft on mount AND no URL project)
  const [showTemplatePicker, setShowTemplatePicker] = useState(() => !hasUrlProject && !loadDraft());
  const [showAutoDirector, setShowAutoDirector] = useState(false);
  const [showAdDirector, setShowAdDirector] = useState(() => {
    try { return sessionStorage.getItem('ad-director-wizard:open') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try {
      if (showAdDirector) sessionStorage.setItem('ad-director-wizard:open', '1');
      else sessionStorage.removeItem('ad-director-wizard:open');
    } catch { /* noop */ }
  }, [showAdDirector]);
  const { ensureProjectPersisted } = useComposerPersistence();
  const incrementTemplateUsage = useIncrementTemplateUsage();
  // Track which project.id we have already hydrated from DB so the effect
  // can re-run when the AutoDirector / AdDirector swaps in a new project.
  const lastSyncedProjectIdRef = useRef<string | null>(null);
  // Always-fresh projectId — avoids stale-closure problems where callbacks
  // (e.g. insertScenesAfter) capture an older `project.id` from the render
  // *before* ensureProjectPersisted swapped in the freshly inserted UUID.
  const projectIdRef = useRef<string | undefined>(project.id);
  useEffect(() => { projectIdRef.current = project.id; }, [project.id]);

  // Strip the URL params after the first render so a later reload doesn't
  // re-trigger the discard-draft path (the project.id is now in state).
  useEffect(() => {
    if (hasUrlProject || urlTab) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------- Realtime Collaboration ----------------
  const [selfMeta, setSelfMeta] = useState<{ userId: string; name: string; email?: string } | null>(null);
  const [projectOwnerId, setProjectOwnerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      const u = data.user;
      const name =
        (u.user_metadata?.full_name as string | undefined) ||
        (u.user_metadata?.name as string | undefined) ||
        u.email?.split('@')[0] ||
        'Guest';
      setSelfMeta({ userId: u.id, name, email: u.email ?? undefined });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!project.id) { setProjectOwnerId(null); return; }
    supabase.from('composer_projects').select('user_id').eq('id', project.id).maybeSingle()
      .then(({ data }) => setProjectOwnerId(data?.user_id ?? null));
  }, [project.id]);

  const isOwner = !!(selfMeta && projectOwnerId && selfMeta.userId === projectOwnerId);

  const { peers, trackCursor: _trackCursor, trackActiveScene: _trackActiveScene } =
    useComposerPresence(project.id, selfMeta);
  // Note: trackCursor/trackActiveScene are exported for child components that want
  // to mount LiveCursorLayer over their canvas (e.g. StoryboardTab). For now we
  // surface presence via avatars in the header — cursors are an opt-in overlay.

  // DB sync whenever project.id changes: hydrate scenes + briefing from DB.
  // Idempotent per-project via lastSyncedProjectIdRef so it never double-fetches.
  useEffect(() => {
    const projectId = project.id;
    if (!projectId) return;
    if (lastSyncedProjectIdRef.current === projectId) return;
    lastSyncedProjectIdRef.current = projectId;

    (async () => {
      try {
        // Also pull project-level fields (output_url, status, briefing, …) so
        // the rendered video remains visible after a reload AND so a freshly
        // redirected Auto-Director / Ad-Director project shows its briefing
        // immediately instead of the empty default.
        const [{ data: projRow }, { data, error: dbError }] = await Promise.all([
          supabase
            .from('composer_projects')
            .select('title, category, briefing, language, assembly_config, output_url, status, ad_meta, ad_variant_strategy, parent_project_id, cutdown_type')
            .eq('id', projectId)
            .maybeSingle(),
          supabase
            .from('composer_scenes')
            .select('*')
            .eq('project_id', projectId)
            .order('order_index', { ascending: true }),
        ]);

        if (projRow) {
          setProject(prev => ({
            ...prev,
            title: (projRow as any).title ?? prev.title,
            category: ((projRow as any).category as ComposerCategory) ?? prev.category,
            briefing: ((projRow as any).briefing as ComposerBriefing) ?? prev.briefing,
            language: (projRow as any).language ?? prev.language,
            assemblyConfig: ((projRow as any).assembly_config as AssemblyConfig) ?? prev.assemblyConfig,
            outputUrl: projRow.output_url ?? prev.outputUrl,
            status: (projRow.status as ComposerStatus) ?? prev.status,
            adMeta: ((projRow as any).ad_meta as AdCampaignMeta | null) ?? prev.adMeta ?? null,
            adVariantStrategy: (projRow as any).ad_variant_strategy ?? prev.adVariantStrategy ?? null,
            parentProjectId: (projRow as any).parent_project_id ?? prev.parentProjectId ?? null,
            cutdownType: (projRow as any).cutdown_type ?? prev.cutdownType ?? null,
          }));
        }

        if (dbError) throw dbError;
        if (!data || data.length === 0) return;

        // Map DB rows → local ComposerScene shape, preferring DB as source of truth
        // for status/url/cost. Fall back to localStorage values for the rest.
        const localById = new Map(project.scenes.map(s => [s.id, s]));
        const dbScenes: ComposerScene[] = data.map((row: any) => {
          const local = localById.get(row.id);
          return {
            id: row.id,
            projectId: row.project_id,
            orderIndex: row.order_index,
            sceneType: row.scene_type,
            durationSeconds: row.duration_seconds,
            clipSource: row.clip_source as ClipSource,
            clipQuality: (row.clip_quality || 'standard') as ClipQuality,
            withAudio: row.with_audio !== false,
            lipSyncWithVoiceover: resolveLipSyncValue(row.id, (row as any).lip_sync_with_voiceover === true),
            // ── Volatile lifecycle fields: ALWAYS take DB value, never local ──
            // These describe the live render/lipsync job and MUST NOT be merged
            // with a stale optimistic patch from localStorage. (Stage 6 fix.)
            lipSyncAppliedAt: (row as any).lip_sync_applied_at ?? null,
            lipSyncSourceClipUrl: (row as any).lip_sync_source_clip_url ?? null,
            lipSyncStatus: (row as any).lip_sync_status ?? null,
            clipUrl: row.clip_url ?? undefined,
            clipStatus: (row.clip_status || 'pending') as ClipStatus,
            replicatePredictionId: row.replicate_prediction_id ?? null,
            clipError: (row as any).clip_error ?? null,
            twoshotStage: (row as any).twoshot_stage ?? null,
            previewClipUrl: (row as any).preview_clip_url ?? null,
            previewStatus: (row as any).preview_status ?? null,
            // ── Non-lifecycle fields below: DB-first with local fallback ──
            aiPrompt: pickText(row.id, 'aiPrompt', row.ai_prompt as any, local?.aiPrompt),
            stockKeywords: pickText(row.id, 'stockKeywords', row.stock_keywords as any, local?.stockKeywords),
            uploadUrl: row.upload_url ?? local?.uploadUrl,
            uploadType: row.upload_type ?? local?.uploadType,
            referenceImageUrl: row.reference_image_url ?? local?.referenceImageUrl,
            clipLeadInTrimSeconds: Number(((row as any).clip_lead_in_trim_seconds as any) ?? local?.clipLeadInTrimSeconds ?? 0),
            textOverlay: (() => {
              const rowOverlay = (row.text_overlay as any) ?? null;
              const merged = rowOverlay ?? local?.textOverlay ?? {
                text: '', position: 'bottom', animation: 'fade-in', fontSize: 48, color: '#FFFFFF',
              };
              // Protect the in-progress overlay text from realtime overwrites.
              return {
                ...merged,
                text: pickText(row.id, 'textOverlay.text', rowOverlay?.text ?? null, local?.textOverlay?.text),
              };
            })(),
            transitionType: row.transition_type ?? local?.transitionType ?? 'crossfade',
            transitionDuration: row.transition_duration ?? local?.transitionDuration ?? 0.5,
            retryCount: row.retry_count ?? 0,
            costEuros: Number(row.cost_euros ?? 0),
            directorModifiers: (row.director_modifiers as any) ?? local?.directorModifiers ?? {},
            sceneActionUser: pickText(row.id, 'sceneActionUser', (row as any).scene_action_user, local?.sceneActionUser),
            sceneActionEn: pickText(row.id, 'sceneActionEn', (row as any).scene_action_en, local?.sceneActionEn),
            characterShot: ((row as any).character_shot as any) ?? local?.characterShot,
            characterShots: (() => {
              // When the user is mid-typing in a per-character action field,
              // prefer the local characterShots (which carry the in-progress
              // actionUser/actionEn). Otherwise fall back to DB-first.
              if (isDirty(row.id, 'characterShotsActions') && local?.characterShots) return local.characterShots;
              return (Array.isArray((row as any).character_shots) && (row as any).character_shots.length > 0)
                ? ((row as any).character_shots as any)
                : ((row as any).character_shot ? [(row as any).character_shot] : (local?.characterShots ?? []));
            })(),
            dismissedCharacterIds: local?.dismissedCharacterIds ?? [],
            dialogScript: ((row as any).dialog_script as any) ?? local?.dialogScript,
            dialogVoices: ((row as any).dialog_voices as any) ?? local?.dialogVoices ?? {},
            dialogMode: resolveDialogModeValue(row.id, ((row as any).dialog_mode as any) ?? local?.dialogMode ?? false),
            dialogTakes: ((row as any).dialog_takes as any) ?? local?.dialogTakes ?? {},
            engineOverride: resolveEngineOverrideValue(row.id, ((row as any).engine_override as any) ?? local?.engineOverride ?? 'auto'),
            shotDirector: ((row as any).shot_director as any) ?? local?.shotDirector ?? {},
            promptSlots: ((row as any).prompt_slots as any) ?? local?.promptSlots,
            promptMode: ((row as any).prompt_mode as any) ?? local?.promptMode,
            promptSlotOrder: ((row as any).prompt_slot_order as any) ?? local?.promptSlotOrder,
            appliedStylePresetId: ((row as any).applied_style_preset_id as any) ?? local?.appliedStylePresetId,
            cinematicPresetSlug: ((row as any).cinematic_preset_slug as any) ?? local?.cinematicPresetSlug,
            // Block M — Hybrid Production
            hybridMode: ((row as any).hybrid_mode as any) ?? local?.hybridMode,
            firstFrameUrl: ((row as any).first_frame_url as any) ?? local?.firstFrameUrl,
            lastFrameUrl: ((row as any).last_frame_url as any) ?? local?.lastFrameUrl,
            endReferenceImageUrl: ((row as any).end_reference_image_url as any) ?? local?.endReferenceImageUrl,
            hybridTargetSceneId: ((row as any).hybrid_target_scene_id as any) ?? local?.hybridTargetSceneId,
            continuityDriftScore: ((row as any).continuity_drift_score as any) ?? local?.continuityDriftScore,
            continuityDriftLabel: ((row as any).continuity_drift_label as any) ?? local?.continuityDriftLabel,
            continuityAutoRepair: ((row as any).continuity_auto_repair as any) ?? local?.continuityAutoRepair,
            continuityLocked: ((row as any).continuity_locked as any) ?? local?.continuityLocked,
            lockReferenceUrl: ((row as any).lock_reference_url as any) ?? local?.lockReferenceUrl,
            actionBeat: ((row as any).action_beat as any) ?? local?.actionBeat,
            realismPreset: ((row as any).realism_preset as any) ?? local?.realismPreset,
            continuationSourceSceneId: ((row as any).continuity_source_scene_id as any) ?? local?.continuationSourceSceneId ?? null,
            framePickSeconds: ((row as any).frame_pick_seconds as any) != null
              ? Number((row as any).frame_pick_seconds)
              : (local?.framePickSeconds ?? null),
            audioPlan: ((row as any).audio_plan as any) ?? local?.audioPlan,
            dialogLockedAt: ((row as any).dialog_locked_at as any) ?? local?.dialogLockedAt ?? null,
            seed: ((row as any).seed as any) ?? local?.seed ?? null,
            seedVariations: Array.isArray((row as any).seed_variations)
              ? ((row as any).seed_variations as any)
              : (local?.seedVariations ?? []),
          };
        });


        const readyCount = dbScenes.filter(s =>
          s.clipStatus === 'ready' || (s.clipSource === 'upload' && !!s.uploadUrl)
        ).length;

        const hadDrift = dbScenes.some(s => {
          const local = localById.get(s.id);
          return local && local.clipStatus !== s.clipStatus;
        });

        setProject(prev => ({ ...prev, scenes: propagateDialogLock(dbScenes) }));

        toast({
          title: t('videoComposer.draftRestored'),
          description: t('videoComposer.draftRestoredDesc')
            .replace('{count}', String(dbScenes.length))
            .replace('{ready}', String(readyCount)),
        });

        if (hadDrift) {
          // Subtle follow-up only when DB actually corrected something
          setTimeout(() => {
            toast({ title: t('videoComposer.syncedFromDb') });
          }, 600);
        }
      } catch (err) {
        console.warn('[VideoComposerDashboard] DB sync on mount failed:', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  /**
   * Block M — Refetch scenes from DB on demand (e.g. after a Hybrid Extend
   * inserts a new scene server-side via the orchestrator). Keeps any local
   * unsaved field by overlaying DB rows onto the existing local store.
   */
  const refetchScenesFromDb = useCallback(async (explicitProjectId?: string) => {
    const projectId = explicitProjectId || projectIdRef.current || project.id;
    if (!projectId) return;
    try {
      const { data, error: dbError } = await supabase
        .from('composer_scenes')
        .select('*')
        .eq('project_id', projectId)
        .order('order_index', { ascending: true });
      if (dbError) throw dbError;
      if (!data) return;

      // Guard against the Phase-A window of `ensureProjectPersisted` — during
      // its two-phase reindex every scene briefly sits at a NEGATIVE
      // order_index. If a realtime tick fires in that window the rows come
      // back in a chaotic order and the merge below would clobber the local
      // UI order. Skip and wait for the next tick (Phase B will fire one).
      if ((data as any[]).some((r: any) => Number(r.order_index) < 0)) {
        return;
      }


      setProject(prev => {
        const localById = new Map(prev.scenes.map(s => [s.id, s]));
        // Preserve any locally-created scenes that haven't been persisted yet
        // (non-UUID ids). Otherwise a realtime tick would wipe them before
        // their first DB write completes.
        const localOnly = prev.scenes.filter(s => !isUuid(s.id));
        const dbScenes: ComposerScene[] = data.map((row: any) => {
          const local = localById.get(row.id);
          return {
            id: row.id,
            projectId: row.project_id,
            orderIndex: row.order_index,
            sceneType: row.scene_type,
            durationSeconds: row.duration_seconds,
            clipSource: row.clip_source as ClipSource,
            clipQuality: (row.clip_quality || 'standard') as ClipQuality,
            withAudio: row.with_audio !== false,
            lipSyncWithVoiceover: resolveLipSyncValue(row.id, (row as any).lip_sync_with_voiceover === true),
            // v131.7: DB-first für ALLE Lifecycle-Felder (lipsync/twoshot/clipError/dialogShots).
            // Vorher: clipError, dialogShots fehlten hier — ein Realtime-Tick nach
            // watchdog_provider_timeout hat zwar lipSyncStatus='failed' gesetzt, aber
            // clipError leer gelassen → UI zeigte „Lip-Sync läuft…" weiter, weil die
            // Forensic-Felder zur Anzeige des Failure-Banners fehlten.
            lipSyncAppliedAt: (row as any).lip_sync_applied_at ?? null,
            lipSyncSourceClipUrl: (row as any).lip_sync_source_clip_url ?? null,
            lipSyncStatus: (row as any).lip_sync_status ?? null,
            clipError: (row as any).clip_error ?? null,
            dialogShots: (row as any).dialog_shots ?? null,
            aiPrompt: pickText(row.id, 'aiPrompt', row.ai_prompt as any, local?.aiPrompt),
            stockKeywords: pickText(row.id, 'stockKeywords', row.stock_keywords as any, local?.stockKeywords),
            uploadUrl: row.upload_url ?? local?.uploadUrl,
            uploadType: row.upload_type ?? local?.uploadType,
            referenceImageUrl: row.reference_image_url ?? local?.referenceImageUrl,
            // Trust the DB as source of truth for clip_url. If the DB has it
            // cleared (e.g. after a reset / re-render), the local stale URL
            // must NOT bleed back into UI — otherwise the preview would keep
            // playing an old / wrong clip while the new render is pending.
            clipUrl: row.clip_url ?? undefined,
            clipStatus: (row.clip_status || 'pending') as ClipStatus,
            clipLeadInTrimSeconds: Number(((row as any).clip_lead_in_trim_seconds as any) ?? local?.clipLeadInTrimSeconds ?? 0),
            textOverlay: (() => {
              const rowOverlay = (row.text_overlay as any) ?? null;
              const merged = rowOverlay ?? local?.textOverlay ?? {
                text: '', position: 'bottom', animation: 'fade-in', fontSize: 48, color: '#FFFFFF',
              };
              return {
                ...merged,
                text: pickText(row.id, 'textOverlay.text', rowOverlay?.text ?? null, local?.textOverlay?.text),
              };
            })(),
            transitionType: row.transition_type ?? local?.transitionType ?? 'crossfade',
            transitionDuration: row.transition_duration ?? local?.transitionDuration ?? 0.5,
            // v131.7: DB-first für replicatePredictionId — lokaler Stale-Wert
            // (z. B. `sync:0b09b825…` nach Watchdog-Reset) hat sonst die
            // gerade von der DB gelöschte ID neu „zurück­fallen" lassen.
            replicatePredictionId: row.replicate_prediction_id ?? null,
            retryCount: row.retry_count ?? 0,
            costEuros: Number(row.cost_euros ?? 0),
            directorModifiers: (row.director_modifiers as any) ?? local?.directorModifiers ?? {},
            sceneActionUser: pickText(row.id, 'sceneActionUser', (row as any).scene_action_user, local?.sceneActionUser),
            sceneActionEn: pickText(row.id, 'sceneActionEn', (row as any).scene_action_en, local?.sceneActionEn),
            characterShot: ((row as any).character_shot as any) ?? local?.characterShot,
            characterShots: (() => {
              if (isDirty(row.id, 'characterShotsActions') && local?.characterShots) return local.characterShots;
              return (Array.isArray((row as any).character_shots) && (row as any).character_shots.length > 0)
                ? ((row as any).character_shots as any)
                : ((row as any).character_shot ? [(row as any).character_shot] : (local?.characterShots ?? []));
            })(),
            dismissedCharacterIds: local?.dismissedCharacterIds ?? [],
            dialogScript: ((row as any).dialog_script as any) ?? local?.dialogScript,
            dialogVoices: ((row as any).dialog_voices as any) ?? local?.dialogVoices ?? {},
            dialogMode: resolveDialogModeValue(row.id, ((row as any).dialog_mode as any) ?? local?.dialogMode ?? false),
            dialogTakes: ((row as any).dialog_takes as any) ?? local?.dialogTakes ?? {},
            engineOverride: resolveEngineOverrideValue(row.id, ((row as any).engine_override as any) ?? local?.engineOverride ?? 'auto'),
            shotDirector: ((row as any).shot_director as any) ?? local?.shotDirector ?? {},
            promptSlots: ((row as any).prompt_slots as any) ?? local?.promptSlots,
            promptMode: ((row as any).prompt_mode as any) ?? local?.promptMode,
            promptSlotOrder: ((row as any).prompt_slot_order as any) ?? local?.promptSlotOrder,
            appliedStylePresetId: ((row as any).applied_style_preset_id as any) ?? local?.appliedStylePresetId,
            cinematicPresetSlug: ((row as any).cinematic_preset_slug as any) ?? local?.cinematicPresetSlug,
            hybridMode: ((row as any).hybrid_mode as any) ?? local?.hybridMode,
            firstFrameUrl: ((row as any).first_frame_url as any) ?? local?.firstFrameUrl,
            lastFrameUrl: ((row as any).last_frame_url as any) ?? local?.lastFrameUrl,
            endReferenceImageUrl: ((row as any).end_reference_image_url as any) ?? local?.endReferenceImageUrl,
            hybridTargetSceneId: ((row as any).hybrid_target_scene_id as any) ?? local?.hybridTargetSceneId,
            continuityDriftScore: ((row as any).continuity_drift_score as any) ?? local?.continuityDriftScore,
            continuityDriftLabel: ((row as any).continuity_drift_label as any) ?? local?.continuityDriftLabel,
            continuityAutoRepair: ((row as any).continuity_auto_repair as any) ?? local?.continuityAutoRepair,
            continuityLocked: ((row as any).continuity_locked as any) ?? local?.continuityLocked,
            lockReferenceUrl: ((row as any).lock_reference_url as any) ?? local?.lockReferenceUrl,
            actionBeat: ((row as any).action_beat as any) ?? local?.actionBeat,
            realismPreset: ((row as any).realism_preset as any) ?? local?.realismPreset,
            twoshotStage: ((row as any).twoshot_stage as any) ?? local?.twoshotStage ?? null,
            continuationSourceSceneId: ((row as any).continuity_source_scene_id as any) ?? local?.continuationSourceSceneId ?? null,
            framePickSeconds: ((row as any).frame_pick_seconds as any) != null
              ? Number((row as any).frame_pick_seconds)
              : (local?.framePickSeconds ?? null),
            audioPlan: ((row as any).audio_plan as any) ?? local?.audioPlan,
            dialogLockedAt: ((row as any).dialog_locked_at as any) ?? local?.dialogLockedAt ?? null,
            previewClipUrl: ((row as any).preview_clip_url as any) ?? local?.previewClipUrl ?? null,
            previewStatus: ((row as any).preview_status as any) ?? local?.previewStatus ?? null,
            seed: ((row as any).seed as any) ?? local?.seed ?? null,
            seedVariations: Array.isArray((row as any).seed_variations)
              ? ((row as any).seed_variations as any)
              : (local?.seedVariations ?? []),
          };
        });
        // Preserve the DB `order_index` for persisted scenes — the legacy
        // re-index by array position (`map((s,i) => orderIndex:i)`) would
        // overwrite DB truth during the realtime tick storm that Phase A of
        // `ensureProjectPersisted` triggers, scrambling the UI order.
        // Local-only scenes (no UUID yet) get appended at the end with
        // bumped orderIndex. Final list is sorted by orderIndex and
        // deduplicated by id so a race can never produce duplicate cards.
        const maxDbOrder = dbScenes.length > 0
          ? Math.max(...dbScenes.map((s) => Number(s.orderIndex ?? 0)))
          : -1;
        const localWithBump = localOnly.map((s, i) => ({
          ...s,
          orderIndex: maxDbOrder + 1 + i,
        }));
        const dedup = new Map<string, ComposerScene>();
        for (const s of dbScenes) dedup.set(s.id, s);
        for (const s of localWithBump) if (!dedup.has(s.id)) dedup.set(s.id, s);
        const merged = Array.from(dedup.values()).sort(
          (a, b) => Number(a.orderIndex ?? 0) - Number(b.orderIndex ?? 0),
        );
        return { ...prev, scenes: propagateDialogLock(merged) };
      });
    } catch (err) {
      console.warn('[VideoComposerDashboard] refetchScenesFromDb failed:', err);
    }
  }, [project.id]);

  // Realtime: when ANY collaborator updates a scene in this project, refetch.
  useComposerScenesRealtime(project.id, refetchScenesFromDb);

  // Tab-übergreifender Auto-Trigger für Two-Shot/Cinematic-Sync Lip-Sync.
  // Stellt sicher, dass auch Voiceover-/Musik-/Export-Tab die Pipeline anstoßen,
  // sobald eine Szene im "ready, but no lip-sync yet"-State steht.
  useTwoShotAutoTrigger(project.id);

  // Phase 5.6 — Undo-Stack (Cmd+Z)
  const { undoLast: undoLastHistoryEntry, count: undoCount, pushEntry: pushHistoryEntry } = useComposerHistory(project.id);
  useKeyboardShortcuts({
    onUndo: () => {
      undoLastHistoryEntry(() => refetchScenesFromDb(project.id));
    },
  }, !!project.id);


  const persistAndGoToClips = useCallback(async () => {
    setIsPersisting(true);
    try {
      const result = await ensureProjectPersisted(project);
      projectIdRef.current = result.projectId;
      setProject(prev => ({ ...prev, id: result.projectId, scenes: result.scenes }));
      // If this is an Ad Director project, ensure ad_meta is up-to-date even
      // when the project row already existed (subsequent wizard runs).
      if (project.adMeta) {
        persistAdMeta(result.projectId, project.adMeta).catch(() => {});
      }
      setActiveTab('storyboard');
    } catch (err: any) {
      console.error('[VideoComposerDashboard] persist failed:', err);
      const msg = err?.message || 'Projekt konnte nicht gespeichert werden';
      setError(msg);
      toast({ title: 'Fehler beim Speichern', description: msg, variant: 'destructive' });
    } finally {
      setIsPersisting(false);
    }
  }, [project, ensureProjectPersisted]);

  const [isResetting, setIsResetting] = useState(false);
  const handleReset = useCallback(async () => {
    const oldId = project.id;
    setShowResetDialog(false);
    if (oldId) {
      setIsResetting(true);
      try {
        const { data, error: cancelErr } = await supabase.functions.invoke(
          'composer-cancel-project',
          { body: { project_id: oldId } },
        );
        if (cancelErr) throw cancelErr;
        const n = (data as any)?.canceled_scenes ?? 0;
        toast({
          title: t('videoComposer.resetSuccessTitle') || 'Projekt zurückgesetzt',
          description: n > 0
            ? `${n} laufende Jobs gestoppt.`
            : 'Keine laufenden Jobs.',
        });
      } catch (e) {
        toast({
          title: 'Cancel teilweise fehlgeschlagen',
          description:
            (e instanceof Error ? e.message : String(e)) +
            ' — neues Projekt wird trotzdem gestartet.',
          variant: 'destructive',
        });
      } finally {
        setIsResetting(false);
      }
    }
    clearDraft();
    setProject({ ...defaultProject, id: '' });
    setActiveTab('briefing');
    setError(null);
    setShowTemplatePicker(true);
  }, [project.id, t]);

  const handleStartBlank = useCallback(() => {
    setShowTemplatePicker(false);
  }, []);

  const applyTemplate = useCallback((tpl: MotionStudioTemplate) => {
    const sceneSuggestions = Array.isArray(tpl.scene_suggestions) ? tpl.scene_suggestions : [];

    const newScenes: ComposerScene[] = sceneSuggestions.map((s, idx) => ({
      id: `tpl-${tpl.id}-${idx}-${Date.now()}`,
      projectId: '',
      orderIndex: idx,
      sceneType: (s.sceneType ?? 'custom') as ComposerScene['sceneType'],
      durationSeconds: s.durationSeconds ?? 5,
      clipSource: (s.clipSource ?? 'ai-hailuo') as ClipSource,
      clipQuality: (s.clipQuality ?? 'standard') as ClipQuality,
      aiPrompt: s.aiPrompt,
      clipStatus: 'pending' as ClipStatus,
      textOverlay: {
        text: '',
        position: 'bottom',
        animation: 'fade-in',
        fontSize: 48,
        color: '#FFFFFF',
      },
      transitionType: (s.transitionType ?? 'crossfade') as ComposerScene['transitionType'],
      transitionDuration: s.transitionDuration ?? 0.5,
      retryCount: 0,
      costEuros: 0,
      directorModifiers: {},
    }));

    setProject({
      ...defaultProject,
      title: tpl.name,
      category: tpl.category,
      briefing: {
        ...defaultProject.briefing,
        ...tpl.briefing_defaults,
        // briefing_defaults may set duration/aspectRatio; ensure required strings still exist
        productName: defaultProject.briefing.productName,
        productDescription: defaultProject.briefing.productDescription,
        usps: defaultProject.briefing.usps,
        targetAudience: defaultProject.briefing.targetAudience,
        brandColors: defaultProject.briefing.brandColors,
        characters: defaultProject.briefing.characters,
      },
      scenes: newScenes,
    });
    setActiveTab('briefing');
    setShowTemplatePicker(false);

    // Fire-and-forget usage counter
    incrementTemplateUsage.mutate(tpl.id);

    toast({
      title: 'Template übernommen',
      description: `"${tpl.name}" mit ${newScenes.length} Szenen geladen. Vervollständige jetzt das Briefing.`,
    });
  }, [incrementTemplateUsage]);

  // One-shot DB re-fetch when user switches BACK to the Clips tab.
  // Also flushes pending Storyboard edits to DB BEFORE the refetch so
  // they don't get clobbered.
  const handleTabChange = useCallback(async (next: TabId) => {
    setActiveTab(next);

    // Flush any pending debounced scene-edit writes synchronously
    // (covers the Storyboard → Clips transition, which is exactly when
    // users notice their prompt edits being lost).
    if (scenesPersistTimerRef.current) {
      window.clearTimeout(scenesPersistTimerRef.current);
      scenesPersistTimerRef.current = null;
    }
    const pending = pendingScenesRef.current;
    pendingScenesRef.current = null;
    if (pending && project.id) {
      try {
        await persistScenesToDbRef.current?.(project.id, pending);
      } catch (err) {
        console.warn('[VideoComposerDashboard] flush before tab change failed:', err);
      }
    }

    if (next !== 'clips' && next !== 'storyboard') return;
    if (!project.id) return;
    try {
      const { data } = await supabase
        .from('composer_scenes')
        .select('id, clip_status, clip_url, cost_euros')
        .eq('project_id', project.id);
      if (!data) return;
      setProject(prev => ({
        ...prev,
        scenes: prev.scenes.map(s => {
          const fresh = data.find((d: any) => d.id === s.id);
          if (!fresh) return s;
          return {
            ...s,
            clipStatus: (fresh.clip_status || s.clipStatus) as ClipStatus,
            clipUrl: fresh.clip_url ?? s.clipUrl,
            costEuros: Number(fresh.cost_euros ?? s.costEuros),
          };
        }),
      }));
    } catch (err) {
      console.warn('[VideoComposerDashboard] tab refresh failed:', err);
    }
  }, [project.id]);

  // Forward refs so handleTabChange (declared earlier) can reach the
  // debounced scene-persist machinery defined later in this component.
  const scenesPersistTimerRef = useRef<number | null>(null);
  const pendingScenesRef = useRef<ComposerScene[] | null>(null);
  const persistScenesToDbRef = useRef<((projectId: string, scenes: ComposerScene[]) => Promise<void>) | null>(null);

  // ── Pending-user-edits guard ────────────────────────────────────────────
  // While the user is actively typing into a freeform text field (action,
  // prompt, stock keywords, overlay text), realtime DB ticks must NOT
  // overwrite the local value with a stale `composer_scenes` row. Without
  // this guard, every keystroke risks being clobbered by an in-flight
  // realtime tick that still carries the previous DB value, which feels
  // like "the field deletes itself while I type".
  //
  // For each scene id we keep a Set of dirty field keys. `setScenes` (the
  // sole path through which user edits enter the local state) compares
  // incoming vs previous values for the watched fields and marks any that
  // changed. The two DB-merge sites below skip overlaying those fields.
  // A field is cleared from the set as soon as the DB row reports the
  // same value as the local one (i.e. the save round-trip completed).
  const USER_TEXT_FIELDS = [
    'sceneActionUser',
    'sceneActionEn',
    'aiPrompt',
    'stockKeywords',
    'textOverlay.text',
    'characterShotsActions',
  ] as const;
  type UserTextField = typeof USER_TEXT_FIELDS[number];
  const pendingUserEditsRef = useRef<Map<string, Set<UserTextField>>>(new Map());

  const markDirty = (sceneId: string, key: UserTextField) => {
    let set = pendingUserEditsRef.current.get(sceneId);
    if (!set) { set = new Set(); pendingUserEditsRef.current.set(sceneId, set); }
    set.add(key);
  };
  const clearDirtyIfMatches = (
    sceneId: string,
    key: UserTextField,
    rowVal: unknown,
    localVal: unknown,
  ) => {
    const set = pendingUserEditsRef.current.get(sceneId);
    if (!set || !set.has(key)) return;
    if (JSON.stringify(rowVal ?? null) === JSON.stringify(localVal ?? null)) {
      set.delete(key);
      if (set.size === 0) pendingUserEditsRef.current.delete(sceneId);
    }
  };
  const isDirty = (sceneId: string, key: UserTextField) =>
    pendingUserEditsRef.current.get(sceneId)?.has(key) === true;

  // Pick local-or-row depending on dirty flag, then clear the flag if both sides agree.
  const pickText = (
    sceneId: string,
    key: UserTextField,
    rowVal: string | null | undefined,
    localVal: string | null | undefined,
  ): string => {
    clearDirtyIfMatches(sceneId, key, rowVal, localVal);
    if (isDirty(sceneId, key)) return (localVal ?? '') as string;
    return (rowVal ?? localVal ?? '') as string;
  };



  const showCampaignTab = !!project.adMeta;
  const TABS = [
    { id: 'briefing' as TabId, label: t('videoComposer.briefing'), icon: FileText },
    { id: 'storyboard' as TabId, label: t('videoComposer.storyboard'), icon: LayoutGrid },
    // Stage 19: 'clips' tab removed from visible navigation — clip generation
    // happens inline inside the Storyboard tiles via "Alle generieren".
    { id: 'text' as TabId, label: t('videoComposer.voiceSubtitles'), icon: Mic },
    { id: 'audio' as TabId, label: t('videoComposer.music'), icon: Music },
    { id: 'export' as TabId, label: t('videoComposer.export'), icon: Download },
    ...(showCampaignTab
      ? [{ id: 'campaign' as TabId, label: 'Kampagne', icon: Megaphone }]
      : []),
  ];

  // Workflow accessibility & completion logic for the step sidebar
  const isStepAccessible = useCallback((id: string) => {
    const idx = TAB_ORDER.indexOf(id as TabId);
    if (idx <= 0) return true;
    if (idx === 1) return !!project.briefing.productName;
    return project.scenes.length > 0;
  }, [project.briefing.productName, project.scenes.length]);

  const isStepDone = useCallback((id: string) => {
    switch (id) {
      case 'briefing':
        return !!project.briefing.productName;
      case 'storyboard':
        return project.scenes.length > 0;
      case 'clips':
        return project.scenes.length > 0 && project.scenes.every(
          (s) => s.clipStatus === 'ready' || (s.clipSource === 'upload' && !!s.uploadUrl)
        );
      case 'text':
        return !!project.assemblyConfig.voiceover || project.scenes.some((s) => !!s.textOverlay?.text);
      case 'audio':
        return !!project.assemblyConfig.music;
      case 'export':
        return !!project.outputUrl;
      default:
        return false;
    }
  }, [project]);

  const STEP_HINTS: Record<TabId, string> = {
    briefing: 'Produkt, Zielgruppe & Tonalität',
    storyboard: 'Szenen planen & anordnen',
    clips: 'AI-Clips generieren',
    text: 'Voiceover & Untertitel',
    audio: 'Musik & Sound-Mix',
    export: 'Render & Download',
    campaign: 'Cutdowns & A/B-Varianten',
  };

  // User-visible workflow steps — Stage 19: Clips-Step ist komplett entfernt,
  // Clip-Generation läuft inline im Storyboard.
  const STEPS: TopStepperStep[] = TABS.map((t) => ({
    id: t.id,
    label: t.label,
    hint: STEP_HINTS[t.id],
    icon: t.icon,
  }));

  useEffect(() => {
    saveDraft(project);
  }, [project]);

  // Persist active tab so users return to where they left off
  useEffect(() => {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    } catch { /* ignore */ }
  }, [activeTab]);

  const updateBriefing = useCallback((briefing: Partial<ComposerBriefing>) => {
    setProject(prev => ({
      ...prev,
      briefing: { ...prev.briefing, ...briefing },
    }));
  }, []);

  const updateProject = useCallback((updates: Partial<LocalProject>) => {
    setProject(prev => ({ ...prev, ...updates }));
  }, []);

  // Debounced DB-write of edited scenes (prompt, slots, director settings, …)
  // so Storyboard edits survive tab switches and reloads.
  // Uses scenesPersistTimerRef / pendingScenesRef / persistScenesToDbRef
  // declared above next to handleTabChange so the tab-change flush can
  // reach them.

  const persistScenesToDb = useCallback(async (projectId: string, scenes: ComposerScene[]) => {
    const targets = scenes.filter(s => isUuid(s.id));
    if (targets.length === 0) return;
    await Promise.all(targets.map((s) =>
      supabase
        .from('composer_scenes')
        .update({
          // Editable storyboard fields — explicitly NOT clip_url / clip_status
          // (those come from the render webhook).
          order_index: scenes.indexOf(s),
          duration_seconds: s.durationSeconds,
          clip_source: s.clipSource,
          clip_quality: s.clipQuality || 'standard',
          with_audio: s.withAudio !== false,
          // Lip-Sync toggle has its own atomic write path (SceneCard /
          // SceneAvatarMode → markLipSyncPending). If a click is still
          // in-flight, prefer the pending value over whatever stale snapshot
          // this debounced flush is holding so we don't undo the user's click.
          lip_sync_with_voiceover: (getLipSyncPending(s.id) ?? (s.lipSyncWithVoiceover === true)) === true,
          // Same pending-aware logic for the Dialog & Lip-Sync toggle —
          // without persisting this field, the debounced save wouldn't store
          // dialogMode at all and the toggle would revert on next hydration.
          dialog_mode: (getDialogModePending(s.id) ?? (s.dialogMode === true)) === true,
          ai_prompt: s.aiPrompt ?? null,
          stock_keywords: s.stockKeywords ?? null,
          upload_url: s.uploadUrl ?? null,
          upload_type: s.uploadType ?? null,
          reference_image_url: s.referenceImageUrl ?? null,
          text_overlay: s.textOverlay as any,
          transition_type: s.transitionType,
          transition_duration: s.transitionDuration,
          character_shot: (s.characterShot ?? null) as any,
          character_shots: (s.characterShots ?? (s.characterShot ? [s.characterShot] : [])) as any,
          dialog_script: s.dialogScript ?? null,
          dialog_voices: (s.dialogVoices ?? {}) as any,
          dialog_takes: (s.dialogTakes ?? {}) as any,
          engine_override: getEngineOverridePending(s.id) ?? (s.engineOverride ?? 'auto'),
          director_modifiers: (s.directorModifiers ?? {}) as any,
          scene_action_user: s.sceneActionUser ?? null,
          scene_action_en: s.sceneActionEn ?? null,
          shot_director: (s.shotDirector ?? {}) as any,
          prompt_slots: (s.promptSlots ?? null) as any,
          prompt_mode: s.promptMode ?? null,
          prompt_slot_order: (s.promptSlotOrder ?? null) as any,
          applied_style_preset_id: s.appliedStylePresetId ?? null,
          cinematic_preset_slug: s.cinematicPresetSlug ?? null,
          continuity_locked: s.continuityLocked === true,
          lock_reference_url: s.lockReferenceUrl ?? null,
          continuity_source_scene_id: s.continuationSourceSceneId ?? null,
          frame_pick_seconds: s.framePickSeconds ?? null,
        } as any)
        .eq('id', s.id)
        .eq('project_id', projectId)
    )).catch(err => console.warn('[VideoComposerDashboard] scene persist failed:', err));
  }, []);

  // Expose to handleTabChange via ref (handleTabChange is declared earlier).
  useEffect(() => {
    persistScenesToDbRef.current = persistScenesToDb;
  }, [persistScenesToDb]);

  const setScenes = useCallback((scenes: ComposerScene[]) => {
    // Phase C.2 — Cast-Change Auto-Clear. If the cast of a self-locked dialog
    // scene changed since the previous state, the stored lockReferenceUrl
    // still encodes the OLD characters' identity and would pollute the next
    // anchor compose. Drop the stale lock + invalidate the clip so the next
    // render produces a fresh anchor matching the new cast.
    const prevById = new Map(project.scenes.map((s) => [s.id, s] as const));
    const cleaned = scenes.map((s) => {
      const prev = prevById.get(s.id);
      if (!prev) return s;
      const prevSig = castSignature(prev);
      const nextSig = castSignature(s);
      const isDialog = Boolean((s.dialogScript ?? '').trim().length > 0);
      // Only act when cast actually changed, the scene is in dialog mode,
      // and the existing lock was self-owned (inherited locks fall away
      // naturally because propagateDialogLock will re-evaluate groups).
      if (
        isDialog &&
        prevSig &&
        nextSig &&
        prevSig !== nextSig &&
        prev.lockSource === 'self' &&
        s.lockReferenceUrl
      ) {
        return {
          ...s,
          lockReferenceUrl: undefined,
          noInheritLock: false,
          clipUrl: undefined,
          clipStatus: 'pending' as const,
        };
      }
      return s;
    });
    // Mark watched freeform-text fields as "dirty" whenever the user changes
    // them locally. The realtime-merge sites further down read these flags
    // to avoid overwriting an in-flight user edit with a stale DB row.
    for (const s of cleaned) {
      const prev = prevById.get(s.id);
      if (!prev) continue;
      if ((s.sceneActionUser ?? '') !== (prev.sceneActionUser ?? '')) markDirty(s.id, 'sceneActionUser');
      if ((s.sceneActionEn ?? '') !== (prev.sceneActionEn ?? '')) markDirty(s.id, 'sceneActionEn');
      if ((s.aiPrompt ?? '') !== (prev.aiPrompt ?? '')) markDirty(s.id, 'aiPrompt');
      if ((s.stockKeywords ?? '') !== (prev.stockKeywords ?? '')) markDirty(s.id, 'stockKeywords');
      if ((s.textOverlay?.text ?? '') !== (prev.textOverlay?.text ?? '')) markDirty(s.id, 'textOverlay.text');
      const aSig = (s.characterShots ?? []).map((x: any) => `${x.characterId}:${x.actionUser ?? ''}:${x.actionEn ?? ''}`).join('|');
      const bSig = (prev.characterShots ?? []).map((x: any) => `${x.characterId}:${x.actionUser ?? ''}:${x.actionEn ?? ''}`).join('|');
      if (aSig !== bSig) markDirty(s.id, 'characterShotsActions');
    }
    const propagated = propagateDialogLock(cleaned);
    setProject(prev => {
      // Schedule debounced DB flush only for already-persisted projects.
      if (prev.id) {
        pendingScenesRef.current = propagated;
        if (scenesPersistTimerRef.current) {
          window.clearTimeout(scenesPersistTimerRef.current);
        }
        scenesPersistTimerRef.current = window.setTimeout(() => {
          const pending = pendingScenesRef.current;
          pendingScenesRef.current = null;
          scenesPersistTimerRef.current = null;
          if (pending && prev.id) {
            persistScenesToDb(prev.id, pending);
          }
        }, 600);
      }
      return { ...prev, scenes: propagated };
    });
  }, [persistScenesToDb, project.scenes]);

  /**
   * Local-only scene state update. Does NOT schedule a debounced DB flush
   * and CANCELS any pending one — used by handlers (e.g. Cinematic-Sync start)
   * that have already persisted their target row themselves and don't want
   * a stale full-scene snapshot to clobber engine_override / clip_status.
   */
  const setScenesLocalOnly = useCallback((scenes: ComposerScene[]) => {
    if (scenesPersistTimerRef.current) {
      window.clearTimeout(scenesPersistTimerRef.current);
      scenesPersistTimerRef.current = null;
    }
    pendingScenesRef.current = null;
    setProject(prev => ({ ...prev, scenes: propagateDialogLock(scenes) }));
  }, []);

  /**
   * Insert a brand-new scene directly into the DB so it survives realtime
   * refetches and tab switches. Returns the persisted scene with its real UUID
   * so the caller can update local state.
   *
   * Falls back to a local-only scene (non-UUID id) when the project itself
   * hasn't been persisted yet — those will be flushed by `ensureProjectPersisted`.
   */
  const addSceneToProject = useCallback(async (partial: Partial<ComposerScene>): Promise<string | undefined> => {
    const tempId = `scene_${Date.now()}`;
    const baseScene: ComposerScene = {
      id: tempId,
      projectId: '',
      orderIndex: 0,
      sceneType: 'custom',
      durationSeconds: 5,
      clipSource: 'stock',
      clipQuality: 'standard',
      clipStatus: 'pending',
      textOverlay: { ...DEFAULT_TEXT_OVERLAY },
      transitionType: 'none',
      transitionDuration: 0,
      retryCount: 0,
      costEuros: 0,
      ...partial,
    } as ComposerScene;

    const projectId = project.id;
    if (!projectId) {
      // No project yet → keep local; ensureProjectPersisted will flush later.
      setProject(prev => ({
        ...prev,
        scenes: [...prev.scenes, { ...baseScene, orderIndex: prev.scenes.length }],
      }));
      return undefined;
    }

    // Optimistic insert (so the user sees it instantly).
    // Capture the freshest scenes.length from the updater — the closure's
    // `project.scenes` is stale because this callback's dep array only
    // contains `project.id`. The captured `finalOrderIndex` is then re-used
    // for the DB INSERT to avoid a UNIQUE(project_id, order_index) collision.
    // The legacy bug used `baseScene.orderIndex` (= 0) so every new scene
    // tried to insert at slot 0, silently failed (only console.warn), and
    // the scene lived on as a temp-id-only entry — which combined with the
    // realtime refetch race caused Scene 2 to "disappear" when Scene 3 was
    // generated. (Bug 1 of the storyboard persistence triad.)
    let finalOrderIndex = 0;
    setProject(prev => {
      finalOrderIndex = prev.scenes.length;
      return {
        ...prev,
        scenes: [...prev.scenes, { ...baseScene, projectId, orderIndex: finalOrderIndex }],
      };
    });

    try {
      const { data, error } = await supabase
        .from('composer_scenes')
        .insert({
          project_id: projectId,
          order_index: finalOrderIndex,
          scene_type: baseScene.sceneType,
          duration_seconds: baseScene.durationSeconds,
          clip_source: baseScene.clipSource,
          clip_quality: baseScene.clipQuality || 'standard',
          clip_status: baseScene.clipStatus ?? 'pending',
          clip_url: baseScene.clipUrl ?? null,
          with_audio: baseScene.withAudio !== false,
          lip_sync_with_voiceover: baseScene.lipSyncWithVoiceover === true,
          ai_prompt: baseScene.aiPrompt ?? null,
          stock_keywords: baseScene.stockKeywords ?? null,
          upload_url: baseScene.uploadUrl ?? null,
          upload_type: baseScene.uploadType ?? null,
          reference_image_url: baseScene.referenceImageUrl ?? null,
          text_overlay: baseScene.textOverlay as any,
          transition_type: baseScene.transitionType,
          transition_duration: baseScene.transitionDuration,
          director_modifiers: (baseScene.directorModifiers ?? {}) as any,
          shot_director: (baseScene.shotDirector ?? {}) as any,
          prompt_slots: (baseScene.promptSlots ?? null) as any,
          prompt_mode: baseScene.promptMode ?? null,
          prompt_slot_order: (baseScene.promptSlotOrder ?? null) as any,
          applied_style_preset_id: baseScene.appliedStylePresetId ?? null,
          cinematic_preset_slug: baseScene.cinematicPresetSlug ?? null,
          dialog_script: baseScene.dialogScript ?? null,
          dialog_voices: (baseScene.dialogVoices ?? null) as any,
          dialog_takes: (baseScene.dialogTakes ?? {}) as any,
          engine_override: baseScene.engineOverride ?? 'auto',
          character_shots: (baseScene.characterShots ?? null) as any,
        } as any)
        .select('id')
        .single();
      if (error) throw error;
      const newId = (data as any)?.id as string | undefined;
      if (!newId) return undefined;
      // Swap temp id for real UUID
      setProject(prev => ({
        ...prev,
        scenes: prev.scenes.map(s => s.id === tempId ? { ...s, id: newId, projectId } : s),
      }));
      return newId;
    } catch (err) {
      console.warn('[VideoComposerDashboard] addSceneToProject failed:', err);
      // Roll back optimistic insert
      setProject(prev => ({ ...prev, scenes: prev.scenes.filter(s => s.id !== tempId) }));
      return undefined;
    }
  }, [project.id]);

  // ── Stock Video Handoff (Phase 6.3) ──
  // When the user clicks "Use in Composer" in /stock-videos we drop the
  // payload into sessionStorage and navigate here. Consume it once on mount
  // and append a ready-to-render `stock` scene.
  const stockHandoffConsumedRef = useRef(false);
  useEffect(() => {
    if (stockHandoffConsumedRef.current) return;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem('composer:incoming-stock-video'); } catch { /* noop */ }
    if (!raw) return;
    stockHandoffConsumedRef.current = true;
    try { sessionStorage.removeItem('composer:incoming-stock-video'); } catch { /* noop */ }
    try {
      const p = JSON.parse(raw);
      const dur = Math.max(2, Math.min(30, Math.round(Number(p.duration) || 5)));
      void addSceneToProject({
        sceneType: 'custom',
        clipSource: 'stock',
        clipQuality: 'standard',
        clipStatus: 'ready',
        clipUrl: p.url,
        durationSeconds: dur,
        stockKeywords: Array.isArray(p.tags) ? p.tags.slice(0, 6).join(', ') : undefined,
      } as any);
      toast({
        title: t('composer.stockImported', { defaultValue: 'Stock-Clip importiert' }),
        description: p.title || p.url,
      });
    } catch (err) {
      console.warn('[VideoComposerDashboard] stock handoff parse failed', err);
    }
  }, [addSceneToProject]);

  /**
   * Insert N new scenes immediately AFTER `parentSceneId` (taking its slot
   * when `removeParent` is true). Used by SceneDialogStudio so multi-speaker
   * lip-sync sub-scenes appear right where the dialog scene sat — not at
   * the end of the project.
   */
  const insertScenesAfter = useCallback(async (
    parentSceneId: string,
    partials: Partial<ComposerScene>[],
    opts?: { removeParent?: boolean },
  ): Promise<(string | undefined)[]> => {
    const removeParent = opts?.removeParent === true;
    // Read the freshest projectId from the ref — `project.id` from the
    // closure can still be undefined right after ensureProjectPersisted()
    // resolved in the same click handler.
    const projectId = projectIdRef.current || project.id;
    if (!projectId) {
      throw new Error('Projekt konnte nicht gespeichert werden — bitte oben „Speichern" klicken und erneut versuchen.');
    }

    // Build snake_case payload for the atomic DB function.
    const childrenPayload = partials.map((p) => ({
      scene_type: p.sceneType ?? 'custom',
      duration_seconds: p.durationSeconds ?? 5,
      clip_source: p.clipSource ?? 'stock',
      clip_quality: p.clipQuality ?? 'standard',
      clip_status: p.clipStatus ?? 'pending',
      clip_url: p.clipUrl ?? null,
      with_audio: p.withAudio !== false,
      lip_sync_with_voiceover: p.lipSyncWithVoiceover === true,
      ai_prompt: p.aiPrompt ?? null,
      stock_keywords: p.stockKeywords ?? null,
      upload_url: p.uploadUrl ?? null,
      upload_type: p.uploadType ?? null,
      reference_image_url: p.referenceImageUrl ?? null,
      text_overlay: (p.textOverlay ?? DEFAULT_TEXT_OVERLAY) as any,
      transition_type: p.transitionType ?? 'none',
      transition_duration: p.transitionDuration ?? 0,
      director_modifiers: (p.directorModifiers ?? {}) as any,
      shot_director: (p.shotDirector ?? {}) as any,
      prompt_slots: (p.promptSlots ?? null) as any,
      prompt_mode: p.promptMode ?? null,
      prompt_slot_order: (p.promptSlotOrder ?? null) as any,
      applied_style_preset_id: p.appliedStylePresetId ?? null,
      cinematic_preset_slug: p.cinematicPresetSlug ?? null,
      dialog_script: p.dialogScript ?? null,
      dialog_voices: (p.dialogVoices ?? null) as any,
      dialog_takes: (p.dialogTakes ?? {}) as any,
      engine_override: p.engineOverride ?? 'auto',
      character_shots: (p.characterShots ?? null) as any,
      continuity_locked: (p as any).continuityLocked === true,
      lock_reference_url: (p as any).lockReferenceUrl ?? null,
    }));

    // Atomic: shift tail → delete parent → insert children → shift back, all
    // in one transaction inside the database (avoids unique-key races).
    const { data, error } = await supabase.rpc('replace_composer_scene_with_children', {
      p_parent_scene_id: parentSceneId,
      p_children: childrenPayload as any,
      p_remove_parent: removeParent,
    });
    if (error) {
      console.error('[insertScenesAfter] RPC failed', error);
      throw new Error(error.message || 'Atomic scene replacement failed');
    }
    const newIds = ((data as unknown) as string[] | null) ?? [];
    if (!Array.isArray(newIds) || newIds.length !== partials.length) {
      throw new Error(`Atomic replacement returned unexpected result (${newIds?.length ?? 0}/${partials.length})`);
    }

    // Refetch from DB so local state reflects the new ordering & ids.
    // Pass the explicit projectId so refetch isn't skipped due to stale closure.
    try { await refetchScenesFromDb(projectId); } catch (e) {
      console.warn('[insertScenesAfter] refetch failed (non-fatal)', e);
    }

    return newIds;
  }, [project.id, refetchScenesFromDb]);

  // the user navigates away.
  useEffect(() => {
    return () => {
      if (scenesPersistTimerRef.current) {
        window.clearTimeout(scenesPersistTimerRef.current);
        scenesPersistTimerRef.current = null;
      }
      const pending = pendingScenesRef.current;
      pendingScenesRef.current = null;
      const pid = project.id;
      if (pending && pid) {
        // fire-and-forget; component is unmounting
        persistScenesToDb(pid, pending);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced DB-write of assembly_config so voiceover / music / subtitle
  // changes are persisted before the user triggers a render.
  const assemblyPersistTimer = useRef<number | null>(null);
  const updateAssembly = useCallback((config: Partial<AssemblyConfig>) => {
    setProject(prev => {
      const nextAssembly = { ...prev.assemblyConfig, ...config };
      const next = { ...prev, assemblyConfig: nextAssembly };

      // Schedule a debounced DB flush only for already-persisted projects.
      if (prev.id) {
        if (assemblyPersistTimer.current) {
          window.clearTimeout(assemblyPersistTimer.current);
        }
        assemblyPersistTimer.current = window.setTimeout(() => {
          persistAssemblyConfig(prev.id!, nextAssembly).catch(err =>
            console.warn('[VideoComposerDashboard] assembly persist failed:', err)
          );
        }, 800);
      }

      return next;
    });
  }, []);

  // Cleanup pending debounce on unmount.
  useEffect(() => {
    return () => {
      if (assemblyPersistTimer.current) {
        window.clearTimeout(assemblyPersistTimer.current);
      }
    };
  }, []);

  // Allow child components (e.g. Export-step Music Card) to switch tabs via event.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as TabId | undefined;
      if (detail && TAB_ORDER.includes(detail)) setActiveTab(detail);
    };
    window.addEventListener('composer:goto-tab', handler as EventListener);
    return () => window.removeEventListener('composer:goto-tab', handler as EventListener);
  }, []);

  const totalDuration = project.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
  const liveCost = project.scenes.reduce((sum, s) => sum + getClipCost(s.clipSource, s.clipQuality || 'standard', s.durationSeconds), 0);

  return (
    <ComposerHistoryContext.Provider value={{ pushEntry: pushHistoryEntry }}>
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {(() => {
              const currentIdx = TAB_ORDER.indexOf(activeTab);
              const prevId = currentIdx > 0 ? TAB_ORDER[currentIdx - 1] : null;
              const prevLabel = prevId
                ? (TABS.find((tt) => tt.id === prevId)?.label ?? '')
                : '';
              const prevTitle = prevId
                ? `${t('videoComposer.previousStep')}: ${prevLabel}`
                : t('videoComposer.firstStep');
              return (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => prevId && setActiveTab(prevId)}
                  disabled={!prevId}
                  title={prevTitle}
                  aria-label={prevTitle}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              );
            })()}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/home')}
              title={t('videoComposer.exitStudio')}
              aria-label={t('videoComposer.exitStudio')}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Film className="h-5 w-5 text-primary" />
                {t('videoComposer.title')}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('videoComposer.subtitle')} • {project.scenes.length} {t('videoComposer.scenes')} • {totalDuration}s
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {project.id && peers.length > 0 && (
              <CollaboratorAvatars peers={peers} />
            )}
            {project.id && (
              <ShareProjectDialog projectId={project.id} isOwner={isOwner} />
            )}
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{t('videoComposer.estimatedCost')}</p>
              <p className="text-sm font-semibold text-primary">
                €{liveCost.toFixed(2)}
              </p>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowAdDirector(true)}
              className="gap-2 bg-gradient-to-r from-amber-500/90 to-amber-600/90 hover:opacity-90 text-amber-950"
            >
              <Megaphone className="h-4 w-4" />
              <span className="hidden sm:inline">Ad Director</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowAutoDirector(true)}
              className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:opacity-90"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Auto-Director</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTemplatePicker(true)}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Template</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowResetDialog(true)}
              className="gap-2"
              aria-label={t('videoComposer.newProject')}
              disabled={isResetting}
            >
              <RotateCcw className={`h-4 w-4 ${isResetting ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {isResetting ? 'Stoppe…' : t('videoComposer.newProject')}
              </span>
            </Button>
          </div>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-destructive flex-1">{error}</p>
            <Button variant="ghost" size="sm" onClick={() => setError(null)} className="text-destructive hover:text-destructive">
              ✕
            </Button>
          </div>
        </div>
      )}

      {/* Workflow stepper (horizontal, sticky beneath the header) */}
      <div className="max-w-7xl mx-auto px-4">
        <MotionStudioTopStepper
          steps={STEPS}
          activeStep={activeTab}
          isStepDone={isStepDone}
          isStepAccessible={isStepAccessible}
          onSelect={(id) => handleTabChange(id as TabId)}
        />
      </div>

      {/* Pipeline-Progress-Bar wird ausschließlich im Storyboard angezeigt,
          damit kein doppelter Ladebalken erscheint. */}

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="min-w-0">
          <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as TabId)}>
            <TabsList className={`lg:hidden grid w-full max-w-3xl mx-auto mb-6 bg-card border border-border/40 ${showCampaignTab ? 'grid-cols-6' : 'grid-cols-5'}`}>
                {TABS.map((tab, i) => {
                  const Icon = tab.icon;
                  const isAccessible = i === 0 ||
                    (i === 1 && project.briefing.productName) ||
                    (i >= 2 && project.scenes.length > 0);
                  return (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      disabled={!isAccessible}
                      className="flex items-center gap-1.5 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary disabled:opacity-30"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

          <TabsContent value="briefing">
            <BriefingTab
              briefing={project.briefing}
              category={project.category}
              title={project.title}
              language={project.language}
              onUpdateBriefing={updateBriefing}
              onUpdateProject={updateProject}
              onGoToStoryboard={() => setActiveTab('storyboard')}
              onScenesGenerated={(scenes) => {
                setStoryboardError(null);
                setScenes(scenes);
                setActiveTab('storyboard');
              }}
              onGenerationStart={() => {
                setStoryboardError(null);
                setIsGeneratingStoryboard(true);
              }}
              onGenerationEnd={() => setIsGeneratingStoryboard(false)}
              onGenerationFailed={(err) => {
                // Keep the user on the Storyboard tab and surface the error
                // there via a persistent panel with a retry button — no
                // silent tab bounce back to Briefing.
                setIsGeneratingStoryboard(false);
                setStoryboardError(err);
                setActiveTab('storyboard');
              }}
              retryStoryboardNonce={retryStoryboardNonce}
              brandKitId={project.brandKitId ?? null}
              brandKitAutoSync={project.brandKitAutoSync ?? false}
              assemblyConfig={project.assemblyConfig}
              onChangeBrandKit={(id) => setProject((p) => ({ ...p, brandKitId: id }))}
              onChangeBrandKitAutoSync={(sync) => setProject((p) => ({ ...p, brandKitAutoSync: sync }))}
              onApplyAssembly={(next) => setProject((p) => ({ ...p, assemblyConfig: next }))}
              scenes={project.scenes}
              onUpdateScenes={setScenes}
            />
          </TabsContent>



          <TabsContent value="storyboard">
            <ComposerTabErrorBoundary label="Storyboard">
              <StoryboardTab
                scenes={project.scenes}
                onUpdateScenes={setScenes}
                onAddScene={addSceneToProject}
                onInsertScenesAfter={insertScenesAfter}
                onGoToClips={persistAndGoToClips}
                language={project.language}
                projectId={project.id}
                characters={project.briefing?.characters}
                onAddCharacter={(c) => updateBriefing({ characters: [...(project.briefing?.characters ?? []), c] })}
                preferredAspect={project.briefing?.aspectRatio}
                onRefetchScenes={refetchScenesFromDb}
                isGeneratingStoryboard={isGeneratingStoryboard}
                storyboardError={storyboardError}
                onRetryStoryboard={() => {
                  // Re-run BriefingTab's pipeline with the current briefing.
                  // Clear the error first so the loader takes over the panel.
                  setStoryboardError(null);
                  setRetryStoryboardNonce((n) => n + 1);
                }}
                onBackToBriefing={() => setActiveTab('briefing')}
                onEnsurePersisted={async () => {
                  const result = await ensureProjectPersisted(project);
                  // Sync ref BEFORE setState so any callback that fires inside
                  // the same click handler (e.g. insertScenesAfter) sees the
                  // freshly persisted UUID without waiting for a re-render.
                  projectIdRef.current = result.projectId;
                  setProject(prev => ({ ...prev, id: result.projectId, scenes: result.scenes }));
                  return result;
                }}
              />
            </ComposerTabErrorBoundary>
          </TabsContent>

          <TabsContent value="clips">
            <ClipsTab
              scenes={project.scenes}
              projectId={project.id}
              visualStyle={project.briefing?.visualStyle}
              characters={project.briefing?.characters}
              language={project.language}
              onUpdateScenes={setScenes}
              onUpdateScenesLocalOnly={setScenesLocalOnly}
              onGoToVoiceSubtitles={() => setActiveTab('text')}
              onEnsurePersisted={async () => {
                const result = await ensureProjectPersisted(project);
                projectIdRef.current = result.projectId;
                setProject(prev => ({ ...prev, id: result.projectId, scenes: result.scenes }));
                return result;
              }}
            />
          </TabsContent>

          <TabsContent value="text">
            <VoiceSubtitlesTab
              scenes={project.scenes}
              onUpdateScenes={setScenes}
              assemblyConfig={project.assemblyConfig}
              onUpdateAssembly={updateAssembly}
              language={project.language}
              briefing={project.briefing}
              onGoToAudio={() => setActiveTab('audio')}
              projectId={project.id}
            />
          </TabsContent>

          <TabsContent value="audio">
            <AudioTab
              assemblyConfig={project.assemblyConfig}
              onUpdateAssembly={updateAssembly}
              scenes={project.scenes}
              projectId={project.id}
              onGoToExport={() => setActiveTab('export')}
            />
          </TabsContent>

          <TabsContent value="export">
            <div className="space-y-6">
              <AssemblyTab
                project={project}
                assemblyConfig={project.assemblyConfig}
                onUpdateAssembly={updateAssembly}
                scenes={project.scenes}
                onMasterRenderComplete={async () => {
                  if (!project.id || !project.adMeta || project.parentProjectId) return;
                  try {
                    const spawned = await spawnAdCampaignChildren({
                      masterProjectId: project.id,
                      masterTitle: project.title,
                      briefing: project.briefing,
                      scenes: project.scenes,
                      assemblyConfig: project.assemblyConfig,
                      language: project.language,
                      brandKitId: project.brandKitId,
                      brandKitAutoSync: project.brandKitAutoSync,
                      adMeta: project.adMeta,
                    });
                    if (spawned.length > 0) {
                      const hasCutdowns = spawned.some(s => s.kind === 'cutdown');
                      toast({
                        title: 'Kampagne erweitert 🎬',
                        description: `${spawned.length} Variante(n): ${spawned.map(s => s.label).join(', ')}${hasCutdowns ? ' · Cutdowns ohne VO — bitte im Child neu synthetisieren.' : ''}`,
                      });
                      setActiveTab('campaign');
                    }
                  } catch (err) {
                    console.warn('[Dashboard] spawn campaign children failed:', err);
                  }
                }}
              />
              <NLEExportPanel projectId={project.id} />
            </div>
          </TabsContent>

          <TabsContent value="campaign">
            <AdCampaignTree
              masterProjectId={project.parentProjectId ?? project.id}
              masterTitle={project.title}
              masterStatus={project.status}
              masterOutputUrl={project.outputUrl}
              adMeta={project.adMeta}
              onOpenChild={(childId) => {
                // Reset draft and load the child project on next mount
                try {
                  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultProject, id: childId }));
                  localStorage.setItem(TAB_STORAGE_KEY, 'export' as TabId);
                } catch { /* ignore */ }
                window.location.reload();
              }}
            />
          </TabsContent>
            </Tabs>
          </div>
        </div>

      {/* Reset Confirmation Dialog */}
      <MotionStudioTemplatePicker
        open={showTemplatePicker}
        onOpenChange={setShowTemplatePicker}
        onSelectTemplate={applyTemplate}
        onStartBlank={handleStartBlank}
      />

      <AutoDirectorWizard
        open={showAutoDirector}
        onOpenChange={setShowAutoDirector}
        defaultLanguage={project.language}
        onProjectCreated={(newProjectId) => {
          // Belt & Suspenders: even if the wizard's navigate() loses the
          // query params, swap state directly so the user sees their new
          // project + scenes immediately. The DB-hydration effect then
          // backfills briefing/scenes from Supabase.
          clearDraft();
          setProject({ ...defaultProject, id: newProjectId });
          lastSyncedProjectIdRef.current = null; // re-arm hydration for new id
          setActiveTab('storyboard');
        }}
      />

      <AdDirectorWizard
        open={showAdDirector}
        onOpenChange={setShowAdDirector}
        language={project.language}
        projectId={project.id}
        onScenesGenerated={({ scenes, briefingPatch, title, voiceover, adMeta }) => {
          setProject((prev) => ({
            ...prev,
            title: title || prev.title,
            category: 'product-ad',
            briefing: { ...prev.briefing, ...briefingPatch },
            scenes,
            assemblyConfig: voiceover
              ? { ...prev.assemblyConfig, voiceover }
              : prev.assemblyConfig,
            status: 'storyboard',
            adMeta: adMeta as AdCampaignMeta,
            adVariantStrategy: adMeta?.variantStrategy ?? null,
          }));
          setActiveTab('storyboard');
          // Persist ad meta to DB if project is already saved (debounced); the
          // initial insert in ensureProjectPersisted will pick up adMeta from
          // state for fresh projects.
          if (project.id) {
            persistAdMeta(project.id, adMeta as AdCampaignMeta).catch(() => {});
          }
          try {
            localStorage.setItem(
              'video-composer-ad-meta',
              JSON.stringify({ ...adMeta }),
            );
          } catch { /* ignore */ }
        }}
      />

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('videoComposer.confirmResetTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('videoComposer.confirmResetDesc')}
              {' '}Alle laufenden Renders und Lip-Sync-Jobs werden abgebrochen — bereits verbrauchte Credits werden nicht refundiert.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('videoComposer.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>
              {t('videoComposer.confirmResetAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </ComposerHistoryContext.Provider>
  );
}
