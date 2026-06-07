import { useMemo, useState } from 'react';
import { Sparkles, Loader2, ChevronDown, ChevronUp, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getSceneBudget, summarizeBudget } from '@/lib/sceneDirector/durationBudget';
import { applySceneAssetsToPrompt } from '@/lib/motion-studio/applySceneAssetsToPrompt';
import type { ComposerCharacter, ComposerScene, CharacterShot } from '@/types/video-composer';
import type { RealismPresetId } from '@/config/cinematicRealismPresets';

interface AssetEntry { id: string; name: string; reference_image_url?: string; description?: string | null }

interface SceneDirectorBoxProps {
  scene: ComposerScene;
  lang: 'en' | 'de' | 'es';
  characters?: ComposerCharacter[];          // briefing characters
  libraryCharacters: AssetEntry[];           // brand_characters
  locations: AssetEntry[];
  buildings: AssetEntry[];
  props: AssetEntry[];
  brandKitContext?: string;
  realismPreset?: RealismPresetId | null;
  onApply: (updates: {
    aiPrompt: string;
    dialogScript?: string;
    characterShots?: CharacterShot[];
    actionBeat?: ComposerScene['actionBeat'];
  }) => void;
  onAddCharacter?: (c: ComposerCharacter) => void;
  onInsertFollowups?: (descriptions: string[]) => void;
  onGenerateMissingAsset?: (kind: 'character' | 'location' | 'building' | 'prop', name: string, suggestedPrompt: string) => void;
}


const LABELS = {
  en: { title: 'Scene from description', desc: 'Describe the scene in your own words. The director picks matching library assets, fits the action to the duration and writes the AI prompt.', placeholder: 'WW2. A soldier drives a Leopard tank across a stone bridge at sunrise.', generate: 'Generate scene', regenerate: 'Re-roll', loading: 'Casting your library…', applied: 'Scene applied', dropped: 'Trimmed to fit duration', followup: 'Add follow-up scene', missing: 'Not in your library', generateAsset: 'Generate' },
  de: { title: 'Szene aus Beschreibung', desc: 'Beschreibe die Szene in deinen Worten. Der Director sucht passende Library-Assets, passt die Aktion an die Dauer an und schreibt den AI-Prompt.', placeholder: '2. Weltkrieg. Ein Soldat fährt einen Leopard-Panzer über eine Steinbrücke im Morgenrot.', generate: 'Szene generieren', regenerate: 'Neu würfeln', loading: 'Suche in deiner Library…', applied: 'Szene übernommen', dropped: 'Gekürzt auf die Szenendauer', followup: 'Folgeszene anlegen', missing: 'Nicht in deiner Library', generateAsset: 'Erzeugen' },
  es: { title: 'Escena desde descripción', desc: 'Describe la escena con tus palabras. El director encuentra los assets de tu biblioteca, los ajusta a la duración y escribe el prompt de IA.', placeholder: 'IIGM. Un soldado conduce un tanque Leopard sobre un puente de piedra al amanecer.', generate: 'Generar escena', regenerate: 'Re-tirar', loading: 'Buscando en tu biblioteca…', applied: 'Escena aplicada', dropped: 'Recortado a la duración', followup: 'Añadir escena siguiente', missing: 'No está en tu biblioteca', generateAsset: 'Generar' },
};

export function SceneDirectorBox({
  scene,
  lang,
  characters,
  libraryCharacters,
  locations,
  buildings,
  props,
  brandKitContext,
  realismPreset,
  onApply,
  onAddCharacter,
  onInsertFollowups,
  onGenerateMissingAsset,
}: SceneDirectorBoxProps) {
  const t = LABELS[lang] ?? LABELS.en;
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const budget = useMemo(() => getSceneBudget(scene.durationSeconds), [scene.durationSeconds]);
  const budgetText = useMemo(() => summarizeBudget(budget, lang), [budget, lang]);

  const allCharacters = useMemo(() => {
    const m = new Map<string, AssetEntry>();
    (characters || []).forEach((c) => m.set(c.id, { id: c.id, name: c.name, description: c.appearance, reference_image_url: c.referenceImageUrl }));
    libraryCharacters.forEach((c) => { if (!m.has(c.id)) m.set(c.id, c); });
    return Array.from(m.values());
  }, [characters, libraryCharacters]);

  async function handleGenerate() {
    if (!description.trim()) return;
    setBusy(true);
    try {
      const payload = {
        description: description.trim(),
        durationSeconds: scene.durationSeconds,
        language: lang,
        brandKitContext,
        realismPreset: realismPreset ?? scene.realismPreset ?? null,
        library: {
          characters: allCharacters.map((c) => ({ id: c.id, name: c.name, descriptor: c.description ?? null })),
          locations:  locations.map((a) => ({ id: a.id, name: a.name, descriptor: a.description ?? null })),
          buildings:  buildings.map((a) => ({ id: a.id, name: a.name, descriptor: a.description ?? null })),
          props:      props.map((a) => ({ id: a.id, name: a.name, descriptor: a.description ?? null })),
        },
      };

      const { data, error } = await supabase.functions.invoke('scene-director', { body: payload });
      if (error) throw error;
      if (!data?.aiPrompt) throw new Error('Empty response');

      // Build the @-mention block from matched assets so the existing
      // mention-resolver pipeline forwards reference images to the renderers.
      const mentionAssets: { name: string }[] = [];
      const pickName = (id: string, pool: AssetEntry[]) => pool.find((a) => a.id === id)?.name;
      data.matchedAssets.locationIds?.forEach((id: string) => { const n = pickName(id, locations); if (n) mentionAssets.push({ name: n }); });
      data.matchedAssets.buildingIds?.forEach((id: string) => { const n = pickName(id, buildings); if (n) mentionAssets.push({ name: n }); });
      data.matchedAssets.propIds?.forEach((id: string) => { const n = pickName(id, props); if (n) mentionAssets.push({ name: n }); });
      // Characters: use names too so @mentions resolve in PromptMentionEditor
      data.matchedAssets.characterIds?.forEach((id: string) => { const n = pickName(id, allCharacters); if (n) mentionAssets.push({ name: n }); });

      const finalPrompt = applySceneAssetsToPrompt(data.aiPrompt, mentionAssets);

      // Cast slots from matched characters
      const characterShots: CharacterShot[] = (data.matchedAssets.characterIds || [])
        .slice(0, 4)
        .map((id: string) => ({ characterId: id, shotType: 'full' as const }));

      // Auto-add library characters that aren't in the briefing yet
      if (onAddCharacter && characters) {
        const briefingIds = new Set(characters.map((c) => c.id));
        for (const id of data.matchedAssets.characterIds || []) {
          if (!briefingIds.has(id)) {
            const lib = libraryCharacters.find((c) => c.id === id);
            if (lib) {
              onAddCharacter({
                id: lib.id,
                name: lib.name,
                appearance: lib.description ?? '',
                signatureItems: '',
                referenceImageUrl: lib.reference_image_url,
              });
            }
          }
        }
      }

      onApply({
        aiPrompt: finalPrompt,
        dialogScript: data.dialogScript || undefined,
        characterShots: characterShots.length > 0 ? characterShots : undefined,
        actionBeat: data.actionBeat
          ? {
              characterAction: data.actionBeat.characterAction || undefined,
              environmentMotion: data.actionBeat.environmentMotion || undefined,
              motionIntensity: data.actionBeat.motionIntensity || undefined,
            }
          : undefined,
      });

      setResult(data);

      const matchedCount =
        (data.matchedAssets.characterIds?.length ?? 0) +
        (data.matchedAssets.locationIds?.length ?? 0) +
        (data.matchedAssets.buildingIds?.length ?? 0) +
        (data.matchedAssets.propIds?.length ?? 0);

      toast({
        title: `✨ ${t.applied}`,
        description: `${matchedCount} assets · ${data.droppedActions?.length ?? 0} ${data.droppedActions?.length === 1 ? 'action' : 'actions'} ${t.dropped.toLowerCase()}`,
      });
    } catch (e: any) {
      toast({ title: 'Scene Director', description: e?.message ?? 'Failed', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-primary/20 bg-primary/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium">{t.title}</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5">{budgetText}</Badge>
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-primary/10 px-3 py-3 space-y-3">
          <p className="text-[10px] leading-relaxed text-muted-foreground/80">{t.desc}</p>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.placeholder}
            rows={3}
            className="text-xs"
            disabled={busy}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={busy || !description.trim()} onClick={handleGenerate}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {busy ? t.loading : (result ? t.regenerate : t.generate)}
            </Button>
            {result?.confidence && (
              <Badge variant={result.confidence === 'high' ? 'default' : result.confidence === 'medium' ? 'secondary' : 'outline'} className="text-[9px] h-4 px-1.5">
                {result.confidence}
              </Badge>
            )}
          </div>

          {result && (
            <div className="space-y-2 pt-1 border-t border-primary/10">
              {Array.isArray(result.droppedActions) && result.droppedActions.length > 0 && (
                <div className="text-[10px] text-muted-foreground/80">
                  <span className="font-medium">{t.dropped}:</span> {result.droppedActions.join(' · ')}
                </div>
              )}
              {Array.isArray(result.followupSceneSuggestions) && result.followupSceneSuggestions.length > 0 && (
                <div className="space-y-1">
                  {result.followupSceneSuggestions.map((s: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-[10px]">
                      <span className="text-muted-foreground/60 flex-1 italic">"{s}"</span>
                      {onInsertFollowups && (
                        <Button size="sm" variant="ghost" className="h-5 px-2 text-[9px]" onClick={() => onInsertFollowups([s])}>
                          + {t.followup}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {Array.isArray(result.missingAssets) && result.missingAssets.length > 0 && (
                <div className="space-y-1">
                  {result.missingAssets.map((m: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-amber-500/30 text-amber-600 dark:text-amber-400">{t.missing}</Badge>
                      <span className="flex-1">{m.kind}: <span className="font-medium">{m.name}</span></span>
                      {onGenerateMissingAsset && (
                        <Button size="sm" variant="ghost" className="h-5 px-2 text-[9px]" onClick={() => onGenerateMissingAsset(m.kind, m.name, m.suggestedPrompt)}>
                          {t.generateAsset}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SceneDirectorBox;
