/**
 * The Autopilot flow: briefing → five ideas → storyboard → production.
 *
 * The container owns nothing but the step. Each stage is a self-contained
 * component, so a user can walk back to the briefing without losing an idea
 * round they already paid for.
 */

import { useState } from 'react';
import { DirectorsTable, type DirectorsTableBriefing } from '@/components/autopilot/DirectorsTable';
import {
  AutopilotIdeaLauncher,
  type LauncherOptions,
  type UploadedAsset,
} from '@/components/autopilot/AutopilotIdeaLauncher';
import { IdeaGallery } from '@/components/autopilot/IdeaGallery';
import { supabase } from '@/integrations/supabase/client';
import { useBrandCharacters } from '@/hooks/useBrandCharacters';
import { ASSET_ROLES } from '@/lib/autopilot/assetRoles';
import type { AutopilotIdea, AutopilotStrategy } from '@/lib/autopilot/strategy';
import type { AutopilotAspect, AutopilotGenre } from '@/lib/autopilot/types';

interface Round {
  ideaRecordId: string;
  strategy: AutopilotStrategy;
  ideas: AutopilotIdea[];
  brief: string;
  options: LauncherOptions;
  assets: UploadedAsset[];
}

/**
 * The chosen idea becomes the brief for the treatment stage. Handing over the
 * beats verbatim is what keeps the storyboard faithful to the concept the
 * customer picked — the treatment model refines, it does not re-invent.
 */
function briefFromIdea(round: Round, idea: AutopilotIdea): string {
  const assetLines = round.assets
    .filter((asset) => idea.usesAssetIds.includes(asset.id))
    .map((asset) => {
      const spec = ASSET_ROLES[asset.role];
      const handling = spec.useAsOverlay
        ? 'wird als saubere Einblendung gelegt, nicht generieren'
        : spec.styleOnly
          ? 'nur Look übernehmen, nicht den Inhalt'
          : 'als Bildreferenz verwenden';
      return `- ${spec.label}: ${asset.description ?? asset.fileName} (${handling})${
        asset.note ? ` — Wunsch: ${asset.note}` : ''
      }`;
    });

  return [
    `Ursprüngliches Briefing: ${round.brief}`,
    '',
    `Gewählte Idee: ${idea.title}`,
    `Aufhänger (Sekunde 1): ${idea.hook}`,
    `Logline: ${idea.logline}`,
    `Bildwelt: ${idea.visualWorld}`,
    '',
    'Szenenfolge, exakt so umsetzen:',
    ...idea.beats.map((b, i) => `${i + 1}. [${b.beat}] ${b.description} (~${b.seconds}s)`),
    '',
    `Zielgruppe: ${round.strategy.audience}`,
    `Nutzen: ${round.strategy.benefit}`,
    `Kaufhemmnis, das entkräftet wird: ${round.strategy.objection}`,
    `Tonalität: ${round.strategy.tone}`,
    round.options.lipSync
      ? `Bis zu ${round.options.lipSyncSpeakers} Person(en) sprechen sichtbar in die Kamera.`
      : 'Niemand spricht sichtbar in die Kamera.',
    assetLines.length ? '' : '',
    assetLines.length ? 'Kundenbilder, die vorkommen:' : '',
    ...assetLines,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .trim();
}

export function AutopilotStudio() {
  const { characters } = useBrandCharacters();
  const [round, setRound] = useState<Round | null>(null);
  const [briefing, setBriefing] = useState<DirectorsTableBriefing | null>(null);

  if (briefing) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setBriefing(null)}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Andere Idee wählen
        </button>
        <DirectorsTable briefing={briefing} />
      </div>
    );
  }

  if (round) {
    return (
      <IdeaGallery
        strategy={round.strategy}
        ideas={round.ideas}
        options={round.options}
        onBack={() => setRound(null)}
        onSelect={async (idea) => {
          await supabase
            .from('autopilot_ideas')
            .update({ selected_index: idea.index })
            .eq('id', round.ideaRecordId);

          setBriefing({
            brief: briefFromIdea(round, idea),
            genre: (idea.genre as AutopilotGenre) || undefined,
            aspect: round.options.aspect as AutopilotAspect,
            language: round.options.language,
            lipSync: round.options.lipSync,
            duration: Math.round(idea.beats.reduce((acc, b) => acc + b.seconds, 0)),

            characters: characters
              .filter((c) => round.options.characterIds.includes(c.id))
              .map((c) => ({ id: c.id, name: c.name, description: c.description ?? undefined })),
          });
        }}
      />
    );
  }

  return <AutopilotIdeaLauncher onIdeas={setRound} />;
}
