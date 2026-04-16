import { useState, useCallback, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FileText, LayoutGrid, Film, Music, Download, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/hooks/useTranslation';
import BriefingTab from './BriefingTab';
import StoryboardTab from './StoryboardTab';
import ClipsTab from './ClipsTab';
import AudioTab from './AudioTab';
import AssemblyTab from './AssemblyTab';
import type {
  ComposerBriefing,
  ComposerScene,
  AssemblyConfig,
  ComposerCategory,
  ComposerStatus,
} from '@/types/video-composer';
import { CLIP_SOURCE_COSTS } from '@/types/video-composer';

type TabId = 'briefing' | 'storyboard' | 'clips' | 'audio' | 'export';

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
}

const STORAGE_KEY = 'video-composer-draft';

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
  const [activeTab, setActiveTab] = useState<TabId>('briefing');
  const [project, setProject] = useState<LocalProject>(() => loadDraft() || defaultProject);
  const [error, setError] = useState<string | null>(null);

  const TABS = [
    { id: 'briefing' as TabId, label: t('videoComposer.briefing'), icon: FileText },
    { id: 'storyboard' as TabId, label: t('videoComposer.storyboard'), icon: LayoutGrid },
    { id: 'clips' as TabId, label: t('videoComposer.clips'), icon: Film },
    { id: 'audio' as TabId, label: t('videoComposer.audio'), icon: Music },
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

  const updateAssembly = useCallback((config: Partial<AssemblyConfig>) => {
    setProject(prev => ({
      ...prev,
      assemblyConfig: { ...prev.assemblyConfig, ...config },
    }));
  }, []);

  const totalDuration = project.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);

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
                €{project.totalCostEuros.toFixed(2)}
              </p>
            </div>
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
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
          <TabsList className="grid grid-cols-5 w-full max-w-2xl mx-auto mb-6 bg-card border border-border/40">
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
              onGoToClips={() => setActiveTab('clips')}
              language={project.language}
            />
          </TabsContent>

          <TabsContent value="clips">
            <ClipsTab
              scenes={project.scenes}
              projectId={project.id}
              onUpdateScenes={setScenes}
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
    </div>
  );
}
