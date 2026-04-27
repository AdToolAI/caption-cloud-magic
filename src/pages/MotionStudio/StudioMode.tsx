import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clapperboard,
  Film,
  ImageIcon,
  Library,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import CharacterEditor from '@/components/motion-studio/CharacterEditor';
import LocationEditor from '@/components/motion-studio/LocationEditor';
import SceneSnippetPicker from '@/components/motion-studio/SceneSnippetPicker';
import AIDirectorBriefDialog, { type DirectorPlan } from '@/components/motion-studio/AIDirectorBriefDialog';
import type {
  MotionStudioCharacter,
  MotionStudioLocation,
  SceneSnippet,
} from '@/types/motion-studio';

type StepId = 'cast' | 'location' | 'storyboard' | 'render';

const STEPS: { id: StepId; title: string; subtitle: string; icon: typeof Users }[] = [
  { id: 'cast', title: 'Cast', subtitle: 'Wer spielt mit?', icon: Users },
  { id: 'location', title: 'Location', subtitle: 'Wo spielt es?', icon: MapPin },
  { id: 'storyboard', title: 'Storyboard', subtitle: 'Was passiert?', icon: Clapperboard },
  { id: 'render', title: 'Render', subtitle: 'Jetzt produzieren', icon: Sparkles },
];

interface DraftScene {
  id: string;
  prompt: string;
  duration: number;
}

export default function StudioMode() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { characters, locations, loading } = useMotionStudioLibrary();

  const [step, setStep] = useState<StepId>('cast');
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [scenes, setScenes] = useState<DraftScene[]>([
    { id: `s_${Date.now()}`, prompt: '', duration: 5 },
  ]);
  const [projectTitle, setProjectTitle] = useState('');
  const [creating, setCreating] = useState(false);

  // Editor dialogs
  const [charEditorOpen, setCharEditorOpen] = useState(false);
  const [locEditorOpen, setLocEditorOpen] = useState(false);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [directorOpen, setDirectorOpen] = useState(false);

  const applyDirectorPlan = (plan: DirectorPlan) => {
    if (!projectTitle.trim()) setProjectTitle(plan.title);
    setScenes(
      plan.scenes.map((s, i) => ({
        id: `s_${Date.now()}_${i}`,
        prompt: s.prompt,
        duration: s.durationSeconds,
      }))
    );
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const isLast = stepIndex === STEPS.length - 1;

  const selectedCharacters = useMemo(
    () => characters.filter((c) => selectedCharIds.includes(c.id)),
    [characters, selectedCharIds]
  );
  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === selectedLocationId) ?? null,
    [locations, selectedLocationId]
  );

  const canAdvance = (() => {
    if (step === 'cast') return true; // optional
    if (step === 'location') return true; // optional
    if (step === 'storyboard')
      return scenes.some((s) => s.prompt.trim().length > 5);
    return true;
  })();

  const goNext = () => {
    if (!canAdvance) {
      if (step === 'storyboard')
        toast.error('Mindestens eine Szene mit Prompt benötigt');
      return;
    }
    const next = STEPS[Math.min(stepIndex + 1, STEPS.length - 1)];
    setStep(next.id);
  };
  const goPrev = () => {
    const prev = STEPS[Math.max(stepIndex - 1, 0)];
    setStep(prev.id);
  };

  const toggleChar = (id: string) =>
    setSelectedCharIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const insertSnippet = (snippet: SceneSnippet) => {
    setScenes((prev) => [
      ...prev.filter((s) => s.prompt.trim() || prev.length === 1 && !s.prompt.trim() ? true : true),
      {
        id: `s_${Date.now()}`,
        prompt: snippet.prompt,
        duration: snippet.duration_seconds ?? 5,
      },
    ]);
    if (snippet.cast_character_ids?.length) {
      setSelectedCharIds((prev) =>
        Array.from(new Set([...prev, ...snippet.cast_character_ids]))
      );
    }
    if (snippet.location_id && !selectedLocationId) {
      setSelectedLocationId(snippet.location_id);
    }
    toast.success(`Snippet „${snippet.name}" eingefügt`);
  };

  const launchInComposer = async () => {
    if (!user) {
      toast.error('Bitte zuerst anmelden');
      return;
    }
    const cleanScenes = scenes.filter((s) => s.prompt.trim().length > 0);
    if (cleanScenes.length === 0) {
      toast.error('Mindestens eine Szene benötigt');
      return;
    }
    setCreating(true);
    try {
      const title =
        projectTitle.trim() ||
        `Studio Mode · ${new Date().toLocaleDateString('de-DE')}`;

      const briefing = {
        mode: 'manual' as const,
        productName: title,
        productDescription:
          selectedLocation?.description ||
          selectedCharacters.map((c) => c.name).join(', ') ||
          '',
        usps: [],
        targetAudience: '',
        tone: 'professional' as const,
        duration: cleanScenes.reduce((sum, s) => sum + s.duration, 0),
        aspectRatio: '16:9' as const,
        brandColors: [],
        characters: selectedCharacters.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          signatureItems: c.signature_items,
          referenceImageUrl: c.reference_image_url ?? undefined,
          voiceId: c.voice_id ?? undefined,
        })),
      };

      const { data: inserted, error: insErr } = await supabase
        .from('composer_projects')
        .insert({
          user_id: user.id,
          title,
          category: 'storytelling',
          briefing: briefing as any,
          status: 'storyboard',
          assembly_config: {} as any,
          total_cost_euros: 0,
          language: 'de',
        } as any)
        .select('id')
        .single();

      if (insErr || !inserted) {
        throw new Error(insErr?.message || 'Projekt konnte nicht erstellt werden');
      }

      // Insert scenes — schema-compatible minimal payload
      const sceneRows = cleanScenes.map((s, idx) => ({
        project_id: inserted.id,
        order_index: idx,
        scene_type: 'custom',
        ai_prompt: s.prompt,
        duration_seconds: s.duration,
        mentioned_character_ids: selectedCharIds,
        mentioned_location_ids: selectedLocationId ? [selectedLocationId] : [],
        clip_status: 'pending',
      }));

      const { error: scErr } = await supabase
        .from('composer_scenes')
        .insert(sceneRows as any);
      if (scErr) {
        // Non-fatal — composer can still load briefing & let user edit
        console.warn('[studio-mode] scene seed failed:', scErr);
      }

      toast.success('Studio-Projekt angelegt – willkommen im Composer ✨');
      navigate(`/video-composer?project=${inserted.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Studio Mode | Motion Studio</title>
        <meta
          name="description"
          content="Geführte 4-Schritt KI-Videoproduktion: Cast wählen, Location scouten, Storyboard bauen, in Sekunden rendern."
        />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        {/* Sticky header with stepper */}
        <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl">
          <div className="container max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between gap-4 mb-4">
              <Button asChild variant="ghost" size="sm" className="gap-2">
                <Link to="/motion-studio">
                  <ArrowLeft className="h-4 w-4" />
                  Hub
                </Link>
              </Button>
              <Badge variant="outline" className="gap-1.5">
                <Wand2 className="h-3 w-3 text-primary" />
                Studio Mode · Geführter Flow
              </Badge>
            </div>

            <Stepper currentIndex={stepIndex} onJump={(i) => setStep(STEPS[i].id)} />
          </div>
        </header>

        <main className="container max-w-6xl mx-auto px-4 py-8">
          {step === 'cast' && (
            <CastStep
              loading={loading}
              characters={characters}
              selectedIds={selectedCharIds}
              onToggle={toggleChar}
              onAddNew={() => setCharEditorOpen(true)}
            />
          )}

          {step === 'location' && (
            <LocationStep
              loading={loading}
              locations={locations}
              selectedId={selectedLocationId}
              onSelect={(id) =>
                setSelectedLocationId((prev) => (prev === id ? null : id))
              }
              onAddNew={() => setLocEditorOpen(true)}
            />
          )}

          {step === 'storyboard' && (
            <StoryboardStep
              scenes={scenes}
              onChange={setScenes}
              onOpenSnippets={() => setSnippetOpen(true)}
              onOpenDirector={() => setDirectorOpen(true)}
              selectedCharacters={selectedCharacters}
              selectedLocation={selectedLocation}
            />
          )}

          {step === 'render' && (
            <RenderStep
              title={projectTitle}
              onTitleChange={setProjectTitle}
              characters={selectedCharacters}
              location={selectedLocation}
              scenes={scenes.filter((s) => s.prompt.trim())}
              creating={creating}
              onLaunch={launchInComposer}
            />
          )}
        </main>

        {/* Sticky footer nav */}
        <footer className="sticky bottom-0 z-40 border-t border-border/40 bg-background/80 backdrop-blur-xl">
          <div className="container max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={goPrev}
              disabled={stepIndex === 0}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Zurück
            </Button>
            <div className="text-xs text-muted-foreground hidden sm:block">
              Schritt {stepIndex + 1} von {STEPS.length} · {STEPS[stepIndex].title}
            </div>
            {!isLast ? (
              <Button onClick={goNext} disabled={!canAdvance} className="gap-2">
                Weiter
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={launchInComposer}
                disabled={creating}
                className="gap-2 bg-gradient-to-r from-primary to-accent"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                In Composer öffnen
              </Button>
            )}
          </div>
        </footer>
      </div>

      {/* Editors */}
      <CharacterEditor
        open={charEditorOpen}
        onOpenChange={setCharEditorOpen}
        onSaved={(c) => setSelectedCharIds((prev) => [...prev, c.id])}
      />
      <LocationEditor
        open={locEditorOpen}
        onOpenChange={setLocEditorOpen}
        onSaved={(l) => setSelectedLocationId(l.id)}
      />
      <SceneSnippetPicker
        open={snippetOpen}
        onOpenChange={setSnippetOpen}
        onInsert={insertSnippet}
      />
      <AIDirectorBriefDialog
        open={directorOpen}
        onOpenChange={setDirectorOpen}
        castNames={selectedCharacters.map((c) => c.name)}
        locationNames={selectedLocation ? [selectedLocation.name] : []}
        onApply={applyDirectorPlan}
      />
    </>
  );
}

/* ─────────────────────────── Stepper ─────────────────────────── */

function Stepper({
  currentIndex,
  onJump,
}: {
  currentIndex: number;
  onJump: (i: number) => void;
}) {
  return (
    <ol className="flex items-center w-full gap-2 sm:gap-4">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const isDone = i < currentIndex;
        const isActive = i === currentIndex;
        return (
          <li key={s.id} className="flex-1 min-w-0">
            <button
              onClick={() => onJump(i)}
              className="w-full text-left group"
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center border transition-all shrink-0',
                    isActive &&
                      'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/30',
                    isDone &&
                      'bg-primary/15 text-primary border-primary/40',
                    !isActive &&
                      !isDone &&
                      'bg-muted/40 text-muted-foreground border-border/40'
                  )}
                >
                  {isDone ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <div className="hidden md:block min-w-0">
                  <div
                    className={cn(
                      'text-xs font-semibold truncate',
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {s.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {s.subtitle}
                  </div>
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'mt-2 h-px w-full',
                    isDone ? 'bg-primary/40' : 'bg-border/40'
                  )}
                />
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ─────────────────────────── Step: Cast ─────────────────────────── */

function CastStep({
  loading,
  characters,
  selectedIds,
  onToggle,
  onAddNew,
}: {
  loading: boolean;
  characters: MotionStudioCharacter[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onAddNew: () => void;
}) {
  return (
    <section className="space-y-6">
      <StepHeader
        icon={Users}
        title="Cast deine Charaktere"
        subtitle="Wähle wiederkehrende Figuren aus deiner Library — sie bleiben über alle Szenen visuell konsistent."
        action={
          <Button onClick={onAddNew} className="gap-2">
            <Plus className="h-4 w-4" /> Neuer Charakter
          </Button>
        }
      />

      {loading ? (
        <SkeletonGrid />
      ) : characters.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Noch keine Charaktere"
          desc="Lege deinen ersten Charakter an — mit Reference-Image und Voice für maximale Konsistenz."
          actionLabel="Charakter anlegen"
          onAction={onAddNew}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {characters.map((c) => {
            const selected = selectedIds.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => onToggle(c.id)}
                className={cn(
                  'relative group rounded-xl overflow-hidden border-2 transition-all text-left',
                  selected
                    ? 'border-primary shadow-lg shadow-primary/20 scale-[1.02]'
                    : 'border-border/40 hover:border-primary/40'
                )}
              >
                <div className="aspect-square bg-muted relative">
                  {c.reference_image_url ? (
                    <img
                      src={c.reference_image_url}
                      alt={c.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Users className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                  )}
                  {selected && (
                    <div className="absolute top-2 right-2 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="p-3 bg-card/80 backdrop-blur">
                  <div className="font-semibold text-sm truncate">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {c.description || '—'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedIds.length > 0 && (
        <SelectionBar
          label={`${selectedIds.length} Charakter${selectedIds.length > 1 ? 'e' : ''} ausgewählt`}
        />
      )}
    </section>
  );
}

/* ─────────────────────────── Step: Location ─────────────────────────── */

function LocationStep({
  loading,
  locations,
  selectedId,
  onSelect,
  onAddNew,
}: {
  loading: boolean;
  locations: MotionStudioLocation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddNew: () => void;
}) {
  return (
    <section className="space-y-6">
      <StepHeader
        icon={MapPin}
        title="Location scouten"
        subtitle="Wähle einen Schauplatz aus deiner Library oder lege einen neuen an. Lighting-Varianten generierst du im Editor."
        action={
          <Button onClick={onAddNew} className="gap-2">
            <Plus className="h-4 w-4" /> Neue Location
          </Button>
        }
      />

      {loading ? (
        <SkeletonGrid />
      ) : locations.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Noch keine Locations"
          desc="Lege deinen ersten Schauplatz an — mit Reference-Image und Lighting-Notes."
          actionLabel="Location anlegen"
          onAction={onAddNew}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map((l) => {
            const selected = l.id === selectedId;
            return (
              <button
                key={l.id}
                onClick={() => onSelect(l.id)}
                className={cn(
                  'relative group rounded-xl overflow-hidden border-2 transition-all text-left',
                  selected
                    ? 'border-primary shadow-lg shadow-primary/20 scale-[1.01]'
                    : 'border-border/40 hover:border-primary/40'
                )}
              >
                <div className="aspect-video bg-muted relative">
                  {l.reference_image_url ? (
                    <img
                      src={l.reference_image_url}
                      alt={l.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                  )}
                  {selected && (
                    <div className="absolute top-2 right-2 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="p-3 bg-card/80 backdrop-blur">
                  <div className="font-semibold text-sm truncate">{l.name}</div>
                  <div className="text-[11px] text-muted-foreground line-clamp-2">
                    {l.description || '—'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────── Step: Storyboard ─────────────────────────── */

function StoryboardStep({
  scenes,
  onChange,
  onOpenSnippets,
  onOpenDirector,
  selectedCharacters,
  selectedLocation,
}: {
  scenes: DraftScene[];
  onChange: (s: DraftScene[]) => void;
  onOpenSnippets: () => void;
  onOpenDirector: () => void;
  selectedCharacters: MotionStudioCharacter[];
  selectedLocation: MotionStudioLocation | null;
}) {
  const updateScene = (id: string, patch: Partial<DraftScene>) =>
    onChange(scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeScene = (id: string) =>
    onChange(scenes.filter((s) => s.id !== id));
  const addScene = () =>
    onChange([
      ...scenes,
      { id: `s_${Date.now()}`, prompt: '', duration: 5 },
    ]);

  const total = scenes.reduce((sum, s) => sum + s.duration, 0);

  return (
    <section className="space-y-6">
      <StepHeader
        icon={Clapperboard}
        title="Storyboard skizzieren"
        subtitle="Beschreibe Szene für Szene was passiert. Cast & Location werden automatisch in jeden Prompt eingewoben."
        action={
          <div className="flex gap-2">
            <Button
              onClick={onOpenDirector}
              className="gap-2 bg-gradient-to-r from-primary to-accent"
            >
              <Wand2 className="h-4 w-4" /> AI-Director
            </Button>
            <Button variant="outline" onClick={onOpenSnippets} className="gap-2">
              <Library className="h-4 w-4" /> Snippets
            </Button>
            <Button variant="outline" onClick={addScene} className="gap-2">
              <Plus className="h-4 w-4" /> Szene
            </Button>
          </div>
        }
      />

      {/* Context strip */}
      {(selectedCharacters.length > 0 || selectedLocation) && (
        <Card className="p-4 bg-muted/30 border-border/40">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {selectedCharacters.length > 0 && (
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span className="text-muted-foreground">Cast:</span>
                {selectedCharacters.map((c) => (
                  <Badge key={c.id} variant="secondary">{c.name}</Badge>
                ))}
              </div>
            )}
            {selectedLocation && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                <span className="text-muted-foreground">Location:</span>
                <Badge variant="secondary">{selectedLocation.name}</Badge>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Curated CTA — only when storyboard is empty */}
      {scenes.filter((s) => s.prompt.trim()).length === 0 && (
        <Card
          className="p-5 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-accent/5 cursor-pointer hover:border-primary/50 transition-all group"
          onClick={onOpenSnippets}
        >
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">Schnellstart mit kuratierten Szenen</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                24+ ready-to-use Templates: Product Hero, Lifestyle, Talking Head, Establishing & mehr.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-primary group-hover:translate-x-1 transition-transform" />
          </div>
        </Card>
      )}

      <ScrollArea className="max-h-[55vh]">
        <ol className="space-y-3 pr-3">
          {scenes.map((scene, idx) => (
            <li key={scene.id}>
              <Card className="p-4 bg-card/60 backdrop-blur border-border/40">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0 text-sm">
                    {idx + 1}
                  </div>
                  <div className="flex-1 space-y-3 min-w-0">
                    <Textarea
                      value={scene.prompt}
                      onChange={(e) =>
                        updateScene(scene.id, { prompt: e.target.value })
                      }
                      placeholder="Was passiert in dieser Szene? z. B. Held betritt langsam den Raum, Kamera fährt rückwärts, warmes Sonnenlicht durch Fenster…"
                      rows={3}
                      className="bg-background/60 resize-none text-sm"
                    />
                    <div className="flex items-center gap-3">
                      <Label className="text-[11px] text-muted-foreground">
                        Dauer
                      </Label>
                      <Input
                        type="number"
                        min={2}
                        max={15}
                        value={scene.duration}
                        onChange={(e) =>
                          updateScene(scene.id, {
                            duration: Math.max(
                              2,
                              Math.min(15, parseInt(e.target.value) || 5)
                            ),
                          })
                        }
                        className="w-20 h-8 bg-background/60 text-sm"
                      />
                      <span className="text-[11px] text-muted-foreground">
                        Sekunden
                      </span>
                      {scenes.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeScene(scene.id)}
                          className="ml-auto h-8 text-xs text-destructive hover:bg-destructive/10"
                        >
                          Entfernen
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </ScrollArea>

      <SelectionBar
        label={`${scenes.filter((s) => s.prompt.trim()).length} Szene${scenes.filter((s) => s.prompt.trim()).length !== 1 ? 'n' : ''} · ${total}s gesamt`}
      />
    </section>
  );
}

/* ─────────────────────────── Step: Render ─────────────────────────── */

function RenderStep({
  title,
  onTitleChange,
  characters,
  location,
  scenes,
  creating,
  onLaunch,
}: {
  title: string;
  onTitleChange: (v: string) => void;
  characters: MotionStudioCharacter[];
  location: MotionStudioLocation | null;
  scenes: DraftScene[];
  creating: boolean;
  onLaunch: () => void;
}) {
  const total = scenes.reduce((sum, s) => sum + s.duration, 0);
  return (
    <section className="space-y-6">
      <StepHeader
        icon={Sparkles}
        title="Bereit zum Rendern"
        subtitle="Dein Studio-Setup wird als neues Composer-Projekt angelegt — dort wählst du Engine, generierst Clips parallel und exportierst final."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Summary */}
        <Card className="lg:col-span-2 p-6 bg-card/60 backdrop-blur border-border/40 space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Projekt-Titel</Label>
            <Input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder={`Studio Mode · ${new Date().toLocaleDateString('de-DE')}`}
              className="bg-background/60"
            />
          </div>

          <SummaryRow icon={Users} label="Cast">
            {characters.length === 0 ? (
              <span className="text-muted-foreground text-sm">Keiner ausgewählt</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {characters.map((c) => (
                  <Badge key={c.id} variant="secondary">{c.name}</Badge>
                ))}
              </div>
            )}
          </SummaryRow>

          <SummaryRow icon={MapPin} label="Location">
            {location ? (
              <Badge variant="secondary">{location.name}</Badge>
            ) : (
              <span className="text-muted-foreground text-sm">Keine ausgewählt</span>
            )}
          </SummaryRow>

          <SummaryRow icon={Clapperboard} label={`Storyboard · ${scenes.length} Szenen · ${total}s`}>
            <ol className="space-y-1.5 text-sm w-full">
              {scenes.map((s, i) => (
                <li
                  key={s.id}
                  className="flex items-start gap-2 p-2 rounded-md bg-background/40 border border-border/30"
                >
                  <span className="text-[11px] font-bold text-primary shrink-0 mt-0.5">
                    #{i + 1}
                  </span>
                  <span className="flex-1 line-clamp-2">{s.prompt}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {s.duration}s
                  </span>
                </li>
              ))}
            </ol>
          </SummaryRow>
        </Card>

        {/* CTA */}
        <Card className="p-6 bg-gradient-to-br from-primary/15 via-card/60 to-accent/10 backdrop-blur border-primary/30 space-y-4">
          <div className="space-y-2">
            <Film className="h-7 w-7 text-primary" />
            <h3 className="text-lg font-bold">Im Composer öffnen</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Dein Cast, deine Location und das Storyboard werden in ein neues
              Video-Composer-Projekt übernommen. Dort wählst du die KI-Engine
              (Sora, Kling, Hailuo …), generierst Clips parallel und exportierst.
            </p>
          </div>
          <Button
            onClick={onLaunch}
            disabled={creating || scenes.length === 0}
            className="w-full gap-2 bg-gradient-to-r from-primary to-accent"
            size="lg"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Studio-Projekt erstellen
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            Du kannst alles im Composer noch anpassen.
          </p>
        </Card>
      </div>
    </section>
  );
}

/* ─────────────────────────── Helpers ─────────────────────────── */

function StepHeader({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: typeof Users;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Users;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SelectionBar({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-xs font-medium text-primary inline-flex items-center gap-2">
      <Check className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <Skeleton key={i} className="aspect-square w-full rounded-xl" />
      ))}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  desc,
  actionLabel,
  onAction,
}: {
  icon: typeof Users;
  title: string;
  desc: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Card className="p-12 bg-card/40 border-dashed border-border/40 text-center">
      <Icon className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
        {desc}
      </p>
      <Button onClick={onAction} className="gap-2">
        <Plus className="h-4 w-4" /> {actionLabel}
      </Button>
    </Card>
  );
}
