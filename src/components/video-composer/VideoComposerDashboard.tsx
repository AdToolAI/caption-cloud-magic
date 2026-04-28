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
import { getClipCost } from '@/types/video-composer';
import { useComposerPersistence, persistAssemblyConfig, persistAdMeta } from '@/hooks/useComposerPersistence';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import MotionStudioTemplatePicker from './MotionStudioTemplatePicker';
import MotionStudioStepSidebar, { type StepItem } from './MotionStudioStepSidebar';
import AutoDirectorWizard from './AutoDirectorWizard';
import AdDirectorWizard from './AdDirectorWizard';
import ShareProjectDialog from './ShareProjectDialog';
import CollaboratorAvatars from './CollaboratorAvatars';
import AdCampaignTree from './AdCampaignTree';
import { spawnAdCampaignChildren } from '@/lib/adDirector/spawnAdCampaignChildren';
import {
  useComposerPresence,
  useComposerScenesRealtime,
} from '@/hooks/useComposerCollaboration';
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
const TAB_ORDER: TabId[] = ['briefing', 'storyboard', 'clips', 'text', 'audio', 'export', 'campaign'];

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
    transitionStyle: 'fade',
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
    return loadDraft() || defaultProject;
  });
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (urlTab && TAB_ORDER.includes(urlTab)) return urlTab;
    return restoreActiveTab();
  });
  const [error, setError] = useState<string | null>(null);
  const [isPersisting, setIsPersisting] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
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
            aiPrompt: row.ai_prompt ?? local?.aiPrompt,
            stockKeywords: row.stock_keywords ?? local?.stockKeywords,
            uploadUrl: row.upload_url ?? local?.uploadUrl,
            uploadType: row.upload_type ?? local?.uploadType,
            referenceImageUrl: row.reference_image_url ?? local?.referenceImageUrl,
            clipUrl: row.clip_url ?? undefined,
            clipStatus: (row.clip_status || 'pending') as ClipStatus,
            clipLeadInTrimSeconds: Number(((row as any).clip_lead_in_trim_seconds as any) ?? local?.clipLeadInTrimSeconds ?? 0),
            textOverlay: row.text_overlay ?? local?.textOverlay ?? {
              text: '',
              position: 'bottom',
              animation: 'fade-in',
              fontSize: 48,
              color: '#FFFFFF',
            },
            transitionType: row.transition_type ?? local?.transitionType ?? 'fade',
            transitionDuration: row.transition_duration ?? local?.transitionDuration ?? 0.5,
            replicatePredictionId: row.replicate_prediction_id ?? local?.replicatePredictionId,
            retryCount: row.retry_count ?? 0,
            costEuros: Number(row.cost_euros ?? 0),
            directorModifiers: (row.director_modifiers as any) ?? local?.directorModifiers ?? {},
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
          };
        });

        const readyCount = dbScenes.filter(s =>
          s.clipStatus === 'ready' || (s.clipSource === 'upload' && !!s.uploadUrl)
        ).length;

        const hadDrift = dbScenes.some(s => {
          const local = localById.get(s.id);
          return local && local.clipStatus !== s.clipStatus;
        });

        setProject(prev => ({ ...prev, scenes: dbScenes }));

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
  const refetchScenesFromDb = useCallback(async () => {
    const projectId = project.id;
    if (!projectId) return;
    try {
      const { data, error: dbError } = await supabase
        .from('composer_scenes')
        .select('*')
        .eq('project_id', projectId)
        .order('order_index', { ascending: true });
      if (dbError) throw dbError;
      if (!data) return;

      setProject(prev => {
        const localById = new Map(prev.scenes.map(s => [s.id, s]));
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
            aiPrompt: row.ai_prompt ?? local?.aiPrompt,
            stockKeywords: row.stock_keywords ?? local?.stockKeywords,
            uploadUrl: row.upload_url ?? local?.uploadUrl,
            uploadType: row.upload_type ?? local?.uploadType,
            referenceImageUrl: row.reference_image_url ?? local?.referenceImageUrl,
            clipUrl: row.clip_url ?? undefined,
            clipStatus: (row.clip_status || 'pending') as ClipStatus,
            clipLeadInTrimSeconds: Number(((row as any).clip_lead_in_trim_seconds as any) ?? local?.clipLeadInTrimSeconds ?? 0),
            textOverlay: row.text_overlay ?? local?.textOverlay ?? {
              text: '', position: 'bottom', animation: 'fade-in', fontSize: 48, color: '#FFFFFF',
            },
            transitionType: row.transition_type ?? local?.transitionType ?? 'fade',
            transitionDuration: row.transition_duration ?? local?.transitionDuration ?? 0.5,
            replicatePredictionId: row.replicate_prediction_id ?? local?.replicatePredictionId,
            retryCount: row.retry_count ?? 0,
            costEuros: Number(row.cost_euros ?? 0),
            directorModifiers: (row.director_modifiers as any) ?? local?.directorModifiers ?? {},
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
          };
        });
        return { ...prev, scenes: dbScenes };
      });
    } catch (err) {
      console.warn('[VideoComposerDashboard] refetchScenesFromDb failed:', err);
    }
  }, [project.id]);

  // Realtime: when ANY collaborator updates a scene in this project, refetch.
  useComposerScenesRealtime(project.id, refetchScenesFromDb);

  const persistAndGoToClips = useCallback(async () => {
    setIsPersisting(true);
    try {
      const result = await ensureProjectPersisted(project);
      setProject(prev => ({ ...prev, id: result.projectId, scenes: result.scenes }));
      // If this is an Ad Director project, ensure ad_meta is up-to-date even
      // when the project row already existed (subsequent wizard runs).
      if (project.adMeta) {
        persistAdMeta(result.projectId, project.adMeta).catch(() => {});
      }
      setActiveTab('clips');
    } catch (err: any) {
      console.error('[VideoComposerDashboard] persist failed:', err);
      const msg = err?.message || 'Projekt konnte nicht gespeichert werden';
      setError(msg);
      toast({ title: 'Fehler beim Speichern', description: msg, variant: 'destructive' });
    } finally {
      setIsPersisting(false);
    }
  }, [project, ensureProjectPersisted]);

  const handleReset = useCallback(() => {
    clearDraft();
    setProject(defaultProject);
    setActiveTab('briefing');
    setError(null);
    setShowResetDialog(false);
    setShowTemplatePicker(true);
  }, []);

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
      transitionType: (s.transitionType ?? 'fade') as ComposerScene['transitionType'],
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

    if (next !== 'clips' || !project.id) return;
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


  const showCampaignTab = !!project.adMeta;
  const TABS = [
    { id: 'briefing' as TabId, label: t('videoComposer.briefing'), icon: FileText },
    { id: 'storyboard' as TabId, label: t('videoComposer.storyboard'), icon: LayoutGrid },
    { id: 'clips' as TabId, label: t('videoComposer.clips'), icon: Film },
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

  const STEPS: StepItem[] = TABS.map((t) => ({
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
          ai_prompt: s.aiPrompt ?? null,
          stock_keywords: s.stockKeywords ?? null,
          upload_url: s.uploadUrl ?? null,
          upload_type: s.uploadType ?? null,
          reference_image_url: s.referenceImageUrl ?? null,
          text_overlay: s.textOverlay as any,
          transition_type: s.transitionType,
          transition_duration: s.transitionDuration,
          character_shot: (s.characterShot ?? null) as any,
          director_modifiers: (s.directorModifiers ?? {}) as any,
          shot_director: (s.shotDirector ?? {}) as any,
          prompt_slots: (s.promptSlots ?? null) as any,
          prompt_mode: s.promptMode ?? null,
          prompt_slot_order: (s.promptSlotOrder ?? null) as any,
          applied_style_preset_id: s.appliedStylePresetId ?? null,
          cinematic_preset_slug: s.cinematicPresetSlug ?? null,
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
    setProject(prev => {
      // Schedule debounced DB flush only for already-persisted projects.
      if (prev.id) {
        pendingScenesRef.current = scenes;
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
      return { ...prev, scenes };
    });
  }, [persistScenesToDb]);

  // Flush pending scene-edit writes on unmount so they aren't lost when
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
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">{t('videoComposer.newProject')}</span>
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

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          <MotionStudioStepSidebar
            steps={STEPS}
            activeStep={activeTab}
            isStepDone={isStepDone}
            isStepAccessible={isStepAccessible}
            onSelect={(id) => handleTabChange(id as TabId)}
          />

          <div className="flex-1 min-w-0">
            <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as TabId)}>
              <TabsList className="lg:hidden grid grid-cols-6 w-full max-w-3xl mx-auto mb-6 bg-card border border-border/40">
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
                setScenes(scenes);
                setActiveTab('storyboard');
              }}
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
            <StoryboardTab
              scenes={project.scenes}
              onUpdateScenes={setScenes}
              onGoToClips={persistAndGoToClips}
              language={project.language}
              projectId={project.id}
              characters={project.briefing?.characters}
              preferredAspect={project.briefing?.aspectRatio}
              onRefetchScenes={refetchScenesFromDb}
            />
          </TabsContent>

          <TabsContent value="clips">
            <ClipsTab
              scenes={project.scenes}
              projectId={project.id}
              visualStyle={project.briefing?.visualStyle}
              characters={project.briefing?.characters}
              onUpdateScenes={setScenes}
              onGoToVoiceSubtitles={() => setActiveTab('text')}
              onEnsurePersisted={async () => {
                const result = await ensureProjectPersisted(project);
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
            />
          </TabsContent>

          <TabsContent value="audio">
            <AudioTab
              assemblyConfig={project.assemblyConfig}
              onUpdateAssembly={updateAssembly}
              scenes={project.scenes}
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
          setActiveTab('clips');
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
  );
}
