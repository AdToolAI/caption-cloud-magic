/**
 * SceneAvatarMode — Stage 19: Artlist-style Character Workshop pane.
 *
 * - Avatar Stage at the top shows the active character. When an outfit is
 *   selected from the Wardrobe sheet, the stage swaps the bust portrait for
 *   the full-body themed outfit render (Identity-locked Gemini variant).
 * - Wardrobe & Pose-Sheet are now INLINE expandable panels (Collapsible)
 *   with the full `<AvatarWardrobeSheet>` / `<AvatarPoseSheet>` grid embedded
 *   directly under the cast picker. No tab switch, no modal.
 * - Wardrobe sheet supports 5 theme packs: Lifestyle / Historical / Fantasy /
 *   Sci-Fi / Sport — clicking a variant assigns it to `scene.selectedOutfit`
 *   and instantly updates the stage.
 */
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Plus,
  Mic2,
  ExternalLink,
  Shirt,
  PersonStanding,
  Sparkles,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAccessibleCharacters } from '@/hooks/useAccessibleCharacters';
import type { ComposerScene, ComposerCharacter } from '@/types/video-composer';
import AvatarStage3D from './AvatarStage3D';
import { AvatarWardrobeSheet } from '@/components/brand-characters/AvatarWardrobeSheet';
import { AvatarPoseSheet } from '@/components/brand-characters/AvatarPoseSheet';
import { supabase } from '@/integrations/supabase/client';
import { markLipSyncPending, clearLipSyncPending } from '@/lib/video-composer/lipSyncPending';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
  scene: ComposerScene;
  characters?: ComposerCharacter[];
  onUpdate: (updates: Partial<ComposerScene>) => void;
}

export default function SceneAvatarMode({ scene, characters, onUpdate }: Props) {
  const navigate = useNavigate();
  const { data: accessible = [] } = useAccessibleCharacters();
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [poseOpen, setPoseOpen] = useState(false);

  const activeShotId =
    scene.characterShots?.[0]?.characterId ||
    scene.characterShot?.characterId ||
    characters?.[0]?.id;
  const activeShotName = useMemo(
    () => characters?.find((c) => c.id === activeShotId)?.name,
    [characters, activeShotId],
  );
  const activeChar = useMemo(
    () => accessible.find((c) => c.name === activeShotName) ?? accessible[0],
    [accessible, activeShotName],
  );

  // Stage image: prefer selected outfit (full-body Artlist look), then portrait.
  const stageImage =
    scene.selectedOutfit?.imageUrl ||
    activeChar?.portrait_url ||
    activeChar?.reference_image_url ||
    null;

  const stageBadge = scene.selectedOutfit
    ? `${scene.selectedOutfit.label} · Showroom`
    : activeChar?.default_voice_id
      ? 'Voice gesetzt'
      : undefined;

  const lipSyncOn = !!scene.lipSyncWithVoiceover;

  const setActiveCharacter = (name: string) => {
    const next = { name, screenTimePercent: 100 };
    onUpdate({
      characterShots: [next as any],
      characterShot: next as any,
      // Reset outfit when switching characters — outfits are per-avatar.
      selectedOutfit: undefined,
    });
  };

  const clearOutfit = () => onUpdate({ selectedOutfit: undefined });

  const noActive = !activeChar;

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {/* Stage */}
      <div className="relative">
        <AvatarStage3D
          imageUrl={stageImage}
          name={activeChar?.name}
          voiceLabel={stageBadge}
        />
        {scene.selectedOutfit && (
          <button
            type="button"
            onClick={clearOutfit}
            className="absolute top-3 right-3 z-20 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/70 backdrop-blur border border-primary/40 text-[10px] uppercase tracking-wider text-primary hover:bg-primary/15 transition-colors"
            title="Outfit zurücksetzen — zeigt wieder das Standard-Porträt"
          >
            <RotateCcw className="h-3 w-3" />
            Reset Outfit
          </button>
        )}
      </div>

      {/* Quick stats / actions row */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-[10px] py-0.5 border-primary/40 bg-primary/10 text-primary"
          >
            <Sparkles className="h-2.5 w-2.5 mr-1" />
            {accessible.length} Avatare verfügbar
          </Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate('/brand-characters')}
          className="gap-1 h-7 text-[10px] text-primary/80 hover:text-primary"
        >
          <ExternalLink className="h-3 w-3" />
          Avatare verwalten
        </Button>
      </div>

      {/* Cast picker */}
      <div className="px-1">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-1.5">
          Cast für diese Szene
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {accessible.slice(0, 7).map((c) => {
            const isActive = activeChar?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCharacter(c.name)}
                className={cn(
                  'group relative aspect-[3/4] rounded-xl overflow-hidden border bg-card/40 transition-all',
                  isActive
                    ? 'border-primary/70 shadow-[0_0_18px_-4px_hsl(var(--primary)/0.55)] ring-1 ring-primary/40'
                    : 'border-border/40 hover:border-primary/40',
                )}
              >
                {(c.portrait_url || c.reference_image_url) ? (
                  <img
                    src={c.portrait_url || c.reference_image_url}
                    alt={c.name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-card/40 to-black/50 text-muted-foreground/60 text-[10px]">
                    {c.name?.slice(0, 2)?.toUpperCase()}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/85 via-black/50 to-transparent">
                  <p className="text-[10px] text-white truncate font-medium">
                    {c.name}
                  </p>
                </div>
                {isActive && (
                  <div className="absolute top-1 right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-bold">
                    ✓
                  </div>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => navigate('/brand-characters')}
            className="aspect-[3/4] rounded-xl border border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="text-[10px]">Neu</span>
          </button>
        </div>
      </div>

      {/* Wardrobe (collapsible inline) */}
      <Collapsible open={wardrobeOpen} onOpenChange={setWardrobeOpen}>
        <CollapsibleTrigger asChild disabled={noActive}>
          <button
            type="button"
            className={cn(
              'w-full rounded-xl border bg-card/40 px-3 py-2.5 flex items-center gap-2 text-left transition-all',
              noActive
                ? 'border-border/30 opacity-50 cursor-not-allowed'
                : 'border-border/40 hover:border-primary/40 hover:bg-primary/5',
              wardrobeOpen && 'border-primary/50 bg-primary/5',
            )}
          >
            <div className="h-7 w-7 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
              <Shirt className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-foreground flex items-center gap-2">
                Wardrobe
                {scene.selectedOutfit && (
                  <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-primary/40 bg-primary/15 text-primary">
                    {scene.selectedOutfit.label}
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-1">
                {noActive
                  ? 'Bitte erst einen Cast wählen.'
                  : 'Lifestyle · Historical · Fantasy · Sci-Fi · Sport — Identity-locked.'}
              </p>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform shrink-0',
                wardrobeOpen && 'rotate-180 text-primary',
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up overflow-hidden">
          {activeChar && (
            <div className="mt-2 rounded-xl border border-primary/20 bg-card/30 p-3">
              <AvatarWardrobeSheet
                avatarId={activeChar.id}
                initialPack={scene.selectedOutfit?.themePack ?? 'lifestyle'}
                onSelect={(variant) =>
                  onUpdate({
                    selectedOutfit: variant,
                    referenceImageUrl: variant.imageUrl,
                  })
                }
              />
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Pose-Sheet (collapsible inline) */}
      <Collapsible open={poseOpen} onOpenChange={setPoseOpen}>
        <CollapsibleTrigger asChild disabled={noActive}>
          <button
            type="button"
            className={cn(
              'w-full rounded-xl border bg-card/40 px-3 py-2.5 flex items-center gap-2 text-left transition-all',
              noActive
                ? 'border-border/30 opacity-50 cursor-not-allowed'
                : 'border-border/40 hover:border-primary/40 hover:bg-primary/5',
              poseOpen && 'border-primary/50 bg-primary/5',
            )}
          >
            <div className="h-7 w-7 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
              <PersonStanding className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-foreground">Pose-Sheet</div>
              <p className="text-[10px] text-muted-foreground line-clamp-1">
                {noActive ? 'Bitte erst einen Cast wählen.' : '4 Stand-/Action-Posen — Identity-locked.'}
              </p>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform shrink-0',
                poseOpen && 'rotate-180 text-primary',
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up overflow-hidden">
          {activeChar && (
            <div className="mt-2 rounded-xl border border-primary/20 bg-card/30 p-3">
              <AvatarPoseSheet avatarId={activeChar.id} />
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Lip-sync toggle */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center shrink-0">
            <Mic2 className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-foreground">
              Talking-Head & Lip-Sync
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-2">
              Schaltet automatischen Lip-Sync mit der Voiceover-Stimme an. Render dauert ~30s länger.
            </p>
          </div>
        </div>
        <Switch
          checked={lipSyncOn}
          onCheckedChange={async (v) => {
            // Optimistic local flip + same atomic DB write as SceneCard's
            // toggle button, so this entry point is race-safe too.
            onUpdate({ lipSyncWithVoiceover: v });
            markLipSyncPending(scene.id, v);
            if (UUID_RE.test(scene.id)) {
              try {
                const { error } = await supabase
                  .from('composer_scenes')
                  .update({ lip_sync_with_voiceover: v })
                  .eq('id', scene.id);
                if (error) throw error;
              } catch (e) {
                console.warn('[SceneAvatarMode] lip-sync toggle persist failed', e);
                clearLipSyncPending(scene.id);
                onUpdate({ lipSyncWithVoiceover: !v });
              }
            }
          }}
        />
      </div>
    </div>
  );
}
