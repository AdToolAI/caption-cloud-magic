/**
 * SceneAvatarMode — Stage 18: Game-engine-style Character Workshop pane.
 *
 * Shows the active cast member of the current scene on a tilt-stage and
 * provides quick controls for:
 *   - swapping the avatar (own + purchased characters via useAccessibleCharacters)
 *   - toggling lip-sync for this scene (one of the two reasons users open
 *     ClipsTab today; we surface it in-context here)
 *   - jumping to the full /brand-characters editor for wardrobe/identity
 *
 * Pose / wardrobe variant grids are stubs that surface the existing system
 * (avatar_pose_variants, avatar_wardrobe_variants per memory) — full picker
 * integration is gated behind those tables existing per-character and is
 * wired up via the existing `<VariantPickerGrid>` flow in Stage 11. This
 * mode only deep-links the user into that flow without a tab switch.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Plus,
  Mic2,
  ExternalLink,
  Shirt,
  PersonStanding,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAccessibleCharacters } from '@/hooks/useAccessibleCharacters';
import type { ComposerScene, ComposerCharacter } from '@/types/video-composer';
import AvatarStage3D from './AvatarStage3D';

interface Props {
  scene: ComposerScene;
  characters?: ComposerCharacter[];
  onUpdate: (updates: Partial<ComposerScene>) => void;
}

export default function SceneAvatarMode({ scene, characters, onUpdate }: Props) {
  const navigate = useNavigate();
  const { data: accessible = [] } = useAccessibleCharacters();

  // Resolve the "active" character for this scene: prefer the first
  // characterShot (by characterId → name via briefing), fall back to the first
  // briefing character.
  const activeShotId =
    scene.characterShots?.[0]?.characterId ||
    scene.characterShot?.characterId ||
    characters?.[0]?.id;
  const activeShotName = useMemo(
    () => characters?.find((c) => c.id === activeShotId)?.name,
    [characters, activeShotId],
  );
  const activeChar = useMemo(
    () =>
      accessible.find((c) => c.name === activeShotName) ?? accessible[0],
    [accessible, activeShotName],
  );

  const stageImage =
    activeChar?.portrait_url ||
    activeChar?.reference_image_url ||
    null;

  const lipSyncOn = !!scene.lipSyncWithVoiceover;

  const setActiveCharacter = (name: string) => {
    const next = { name, screenTimePercent: 100 };
    onUpdate({
      characterShots: [next as any],
      characterShot: next as any,
    });
  };

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {/* Stage */}
      <AvatarStage3D
        imageUrl={stageImage}
        name={activeChar?.name}
        voiceLabel={activeChar?.default_voice_id ? 'Voice gesetzt' : undefined}
      />

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
                  // eslint-disable-next-line @next/next/no-img-element
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

      {/* Wardrobe & Pose hint row */}
      <div className="grid grid-cols-2 gap-2 px-1">
        <div className="rounded-xl border border-border/40 bg-card/40 p-2.5 flex items-start gap-2">
          <div className="h-7 w-7 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
            <Shirt className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-foreground">Wardrobe</div>
            <p className="text-[10px] text-muted-foreground line-clamp-2">
              Outfits werden als Variant-Set generiert. Öffne den Avatar-Editor.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/40 p-2.5 flex items-start gap-2">
          <div className="h-7 w-7 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
            <PersonStanding className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-foreground">Pose-Sheet</div>
            <p className="text-[10px] text-muted-foreground line-clamp-2">
              4 Stand-/Action-Posen pro Charakter. Auswahl im Avatar-Editor.
            </p>
          </div>
        </div>
      </div>

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
          onCheckedChange={(v) => onUpdate({ lipSyncWithVoiceover: v })}
        />
      </div>
    </div>
  );
}
