import { useState, useCallback, useEffect, useRef } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FileText, LayoutGrid, Film, Music, Download, ArrowLeft, AlertTriangle, RotateCcw, Mic } from 'lucide-react';
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
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/hooks/useTranslation';
import BriefingTab from './BriefingTab';
import StoryboardTab from './StoryboardTab';
import ClipsTab from './ClipsTab';
import VoiceSubtitlesTab from './VoiceSubtitlesTab';
import AudioTab from './AudioTab';
import AssemblyTab from './AssemblyTab';
import type {
  ComposerBriefing,
  ComposerScene,
  AssemblyConfig,
  ComposerCategory,
  ComposerStatus,
  ClipStatus,
  ClipSource,
  ClipQuality,
} from '@/types/video-composer';
import { getClipCost } from '@/types/video-composer';
import { useComposerPersistence, persistAssemblyConfig } from '@/hooks/useComposerPersistence';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type TabId = 'briefing' | 'storyboard' | 'clips' | 'text' | 'audio' | 'export';

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
}

const STORAGE_KEY = 'video-composer-draft';
const TAB_STORAGE_KEY = 'video-composer-draft-tab';
const TAB_ORDER: TabId[] = ['briefing', 'storyboard', 'clips', 'text', 'audio', 'export'];

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

/** Restore last active tab, but only if it's actually accessible
 *  given the current draft state (mirrors the `isAccessible` rule below). */
function restoreActiveTab(draft: LocalProject | null): TabId {
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY) as TabId | null;
    if (!stored || !TAB_ORDER.includes(stored) || !draft) return 'briefing';
    const idx = TAB_ORDER.indexOf(stored);
    if (idx === 0) return 'briefing';
    if (idx === 1 && !draft.briefing?.productName) return 'briefing';
    if (idx >= 2 && (!draft.scenes || draft.scenes.length === 0)) return 'briefing';
    return stored;
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

export default function VideoComposerDashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [project, setProject] = useState<LocalProject>(() => loadDraft() || defaultProject);
  const [activeTab, setActiveTab] = useState<TabId>(() => restoreActiveTab(loadDraft()));
  const [error, setError] = useState<string | null>(null);
  const [isPersisting, setIsPersisting] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const { ensureProjectPersisted } = useComposerPersistence();
  const didInitialSyncRef = useRef(false);

  // DB sync on mount: if the loaded draft has a project.id, hydrate scenes from DB
  useEffect(() => {
    if (didInitialSyncRef.current) return;
    didInitialSyncRef.current = true;

    const projectId = project.id;
    if (!projectId) return;

    (async () => {
      try {
        // Also pull project-level fields (output_url, status) so the rendered
        // video remains visible after a reload.
        const [{ data: projRow }, { data, error: dbError }] = await Promise.all([
          supabase
            .from('composer_projects')
            .select('output_url, status')
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
            outputUrl: projRow.output_url ?? prev.outputUrl,
            status: (projRow.status as ComposerStatus) ?? prev.status,
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
  }, []);

  const persistAndGoToClips = useCallback(async () => {
    setIsPersisting(true);
    try {
      const result = await ensureProjectPersisted(project);
      setProject(prev => ({ ...prev, id: result.projectId, scenes: result.scenes }));
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
  }, []);

  // One-shot DB re-fetch when user switches BACK to the Clips tab
  const handleTabChange = useCallback(async (next: TabId) => {
    setActiveTab(next);
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

  const TABS = [
    { id: 'briefing' as TabId, label: t('videoComposer.briefing'), icon: FileText },
    { id: 'storyboard' as TabId, label: t('videoComposer.storyboard'), icon: LayoutGrid },
    { id: 'clips' as TabId, label: t('videoComposer.clips'), icon: Film },
    { id: 'text' as TabId, label: t('videoComposer.voiceSubtitles'), icon: Mic },
    { id: 'audio' as TabId, label: t('videoComposer.music'), icon: Music },
    { id: 'export' as TabId, label: t('videoComposer.export'), icon: Download },
  ];

  useEffect(() => {
    saveDraft(project);
  }, [project]);

  const updateBriefing = useCallback((briefing: Partial<ComposerBriefing>) => {
    setProject(prev => ({
      ...prev,
      briefing: { ...prev.briefing, ...briefing },
    }));
  }, []);

  const updateProject = useCallback((updates: Partial<LocalProject>) => {
    setProject(prev => ({ ...prev, ...updates }));
  }, []);

  const setScenes = useCallback((scenes: ComposerScene[]) => {
    setProject(prev => ({ ...prev, scenes }));
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

  const totalDuration = project.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
  const liveCost = project.scenes.reduce((sum, s) => sum + getClipCost(s.clipSource, s.clipQuality || 'standard', s.durationSeconds), 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
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
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{t('videoComposer.estimatedCost')}</p>
              <p className="text-sm font-semibold text-primary">
                €{liveCost.toFixed(2)}
              </p>
            </div>
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
        <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as TabId)}>
          <TabsList className="grid grid-cols-6 w-full max-w-3xl mx-auto mb-6 bg-card border border-border/40">
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
            />
          </TabsContent>

          <TabsContent value="storyboard">
            <StoryboardTab
              scenes={project.scenes}
              onUpdateScenes={setScenes}
              onGoToClips={persistAndGoToClips}
              language={project.language}
              projectId={project.id}
            />
          </TabsContent>

          <TabsContent value="clips">
            <ClipsTab
              scenes={project.scenes}
              projectId={project.id}
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
            <AssemblyTab
              project={project}
              assemblyConfig={project.assemblyConfig}
              onUpdateAssembly={updateAssembly}
              scenes={project.scenes}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Reset Confirmation Dialog */}
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
