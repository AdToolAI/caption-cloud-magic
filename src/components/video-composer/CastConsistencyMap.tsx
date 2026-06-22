/**
 * CastConsistencyMap
 * --------------------------------------------------------------
 * Read-only matrix showing which character appears in which scene
 * + how the scene currently anchors continuity:
 *   • 🟢 Reference image (i2v) — strongest anchor
 *   • 🔗 Frame chain (last-frame of previous scene)
 *   • ◯  Prompt-only
 *
 * Lives in the Video Composer briefing area as a quick "story
 * cohesion at a glance" widget — no backend changes; surfaces
 * existing characterShot + clipSource data.
 */

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Users, Image as ImageIcon, Link2, Circle } from 'lucide-react';
import type { ComposerCharacter, ComposerScene } from '@/types/video-composer';

interface Props {
  scenes: ComposerScene[];
  characters: ComposerCharacter[];
  /** When true, skip the outer Card chrome + duplicate title (parent provides StagePanel). */
  embedded?: boolean;
}


type Anchor = 'reference' | 'chain' | 'prompt' | 'absent';

function getAnchor(scene: ComposerScene, character: ComposerCharacter, idx: number): Anchor {
  const shot = scene.characterShot;
  const hasShot = !!shot && !!shot.shotType && shot.shotType !== 'absent';
  // Match by exact id OR by name (covers `lib:…` ids and LLM id-drift).
  const idMatch = hasShot && shot!.characterId === character.id;
  const fullName = (character?.name ?? '').trim().toLowerCase();
  const firstName = fullName.split(/\s+/)[0] || '';
  const nameMatchInId =
    hasShot &&
    !!shot!.characterId &&
    !!firstName &&
    shot!.characterId.toLowerCase().includes(firstName);
  // Fallback: character's name appears verbatim in the scene prompt.
  const promptText = (scene.aiPrompt || '').toLowerCase();
  const nameMatchInPrompt =
    !!firstName &&
    ((!!fullName && promptText.includes(fullName)) || promptText.includes(firstName));

  if (!idMatch && !nameMatchInId && !nameMatchInPrompt) return 'absent';
  // Strong signature_items + AI scene → reference-style anchor (Sherlock-Holmes effect)
  if ((character.signatureItems?.trim() || character.referenceImageUrl) && scene.clipSource?.startsWith('ai-')) return 'reference';
  // First scene with the character → no chain possible, prompt-only
  if (idx === 0) return 'prompt';
  // Otherwise frame-chain anchor (extract-video-last-frame between AI scenes)
  return 'chain';
}

const ANCHOR_META: Record<Anchor, { label: string; icon: React.ReactNode; className: string }> = {
  reference: {
    label: 'Reference image (5★)',
    icon: <ImageIcon className="h-3 w-3" />,
    className: 'bg-primary/15 text-primary border-primary/30',
  },
  chain: {
    label: 'Frame chain',
    icon: <Link2 className="h-3 w-3" />,
    className: 'bg-accent/15 text-accent-foreground border-accent/30',
  },
  prompt: {
    label: 'Prompt only',
    icon: <Circle className="h-3 w-3" />,
    className: 'bg-muted/40 text-muted-foreground border-muted-foreground/20',
  },
  absent: {
    label: 'Absent',
    icon: <Circle className="h-3 w-3 opacity-30" />,
    className: 'opacity-25',
  },
};

export function CastConsistencyMap({ scenes, characters, embedded = false }: Props) {
  // Defensive: filter out any cast entries without a usable name. A single
  // library asset that lost its name (e.g. legacy import, mid-edit draft)
  // would otherwise crash the whole Storyboard tab via `.name.toLowerCase()`.
  const safeCharacters = (characters ?? []).filter(
    (c): c is ComposerCharacter =>
      !!c && typeof c.name === 'string' && c.name.trim().length > 0,
  );
  if (safeCharacters.length === 0 || !scenes || scenes.length === 0) {
    return null;
  }

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    embedded ? (
      <div className="space-y-3">{children}</div>
    ) : (
      <Card className="p-4 bg-card/60 backdrop-blur-xl border-border/60 space-y-3">{children}</Card>
    );

  return (
    <Wrapper>
      {!embedded && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">Cast Consistency Map</h3>
            <Badge variant="outline" className="text-[10px]">
              {scenes.length} {scenes.length === 1 ? 'scene' : 'scenes'} · {safeCharacters.length} cast
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><ImageIcon className="h-2.5 w-2.5 text-primary" /> Reference</span>
            <span className="flex items-center gap-1"><Link2 className="h-2.5 w-2.5" /> Chain</span>
            <span className="flex items-center gap-1"><Circle className="h-2.5 w-2.5" /> Prompt</span>
          </div>
        </div>
      )}
      {embedded && (
        <div className="flex items-center justify-end gap-3 text-[10px] text-muted-foreground -mt-1">
          <Badge variant="outline" className="text-[10px]">
            {scenes.length} {scenes.length === 1 ? 'scene' : 'scenes'} · {safeCharacters.length} cast
          </Badge>
          <span className="flex items-center gap-1"><ImageIcon className="h-2.5 w-2.5 text-primary" /> Reference</span>
          <span className="flex items-center gap-1"><Link2 className="h-2.5 w-2.5" /> Chain</span>
          <span className="flex items-center gap-1"><Circle className="h-2.5 w-2.5" /> Prompt</span>
        </div>
      )}


      <TooltipProvider delayDuration={200}>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="text-left font-normal text-muted-foreground p-1 sticky left-0 bg-card">Cast</th>
                {scenes.map((s, i) => (
                  <th key={s.id} className="text-center font-normal text-muted-foreground p-1 min-w-[36px]">
                    <Tooltip>
                      <TooltipTrigger>S{i + 1}</TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px] max-w-[200px]">
                        {s.aiPrompt?.slice(0, 80) || `Scene ${i + 1}`}
                      </TooltipContent>
                    </Tooltip>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {safeCharacters.map((c) => (
                <tr key={c.id}>
                  <td className="p-1 sticky left-0 bg-card">
                    <div className="flex items-center gap-1.5">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[8px]">
                          {(c.name ?? '??').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate max-w-[80px]">{c.name}</span>
                    </div>
                  </td>
                  {scenes.map((s, i) => {
                    const anchor = getAnchor(s, c, i);
                    const meta = ANCHOR_META[anchor];
                    return (
                      <td key={s.id} className="p-0.5 text-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`inline-flex items-center justify-center h-6 w-6 rounded-md border ${meta.className}`}
                            >
                              {anchor !== 'absent' ? meta.icon : null}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-[10px]">
                            {c.name} · S{i + 1}: {meta.label}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TooltipProvider>

      {(() => {
        // Use the same sanitized list as the table so a nameless cast entry
        // can never crash this render via `.name`-access in the join below.
        const orphans = safeCharacters.filter((c) =>
          scenes.every((s, i) => getAnchor(s, c, i) === 'absent')
        );
        if (orphans.length === 0) return null;
        return (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            ⚠️ {orphans.map((o) => o.name).join(', ')} {orphans.length === 1 ? 'kommt' : 'kommen'} in keiner Szene vor.
            Klicke in einer Szene auf den Charakter-Button, um {orphans.length === 1 ? 'ihn' : 'sie'} als Anker hinzuzufügen — oder generiere das Storyboard neu.
          </div>
        );
      })()}

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Reference-Image (🟢) liefert die stärkste visuelle Konsistenz über mehrere Shots.
        Wenn ein Charakter ohne Anker erscheint, wird automatisch der letzte Frame der vorherigen Szene
        als Continuity-Brücke genutzt (Frame-Chain 🔗).
      </p>
    </Wrapper>

  );
}
