import { tx } from "@/lib/i18nText";
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
        ? tx({ de: 'wird als saubere Einblendung gelegt, nicht generieren', en: 'is placed as a clean fade-in, do not generate', es: 'se coloca como una entrada limpia, no generar' })
        : spec.styleOnly
          ? tx({ de: 'nur Look übernehmen, nicht den Inhalt', en: 'only adopt the look, not the content', es: 'Adopta solo la apariencia, no el contenido.' })
          : tx({ de: 'als Bildreferenz verwenden', en: 'use as image reference', es: 'usar como referencia visual' });
      return `- ${spec.label}: ${asset.description ?? asset.fileName} (${handling})${
        asset.note ? ` — ${tx({ de: 'Wunsch', en: 'Request', es: 'Petición' })}: ${asset.note}` : ''
      }`;
    });

  return [
    `${tx({ de: 'Ursprüngliches Briefing', en: 'Original briefing', es: 'Briefing original' })}: ${round.brief}`,
    '',
    `${tx({ de: 'Gewählte Idee', en: 'Selected idea', es: 'Idea seleccionada' })}: ${idea.title}`,
    `${tx({ de: 'Aufhänger (Sekunde 1)', en: 'Hook (second 1)', es: 'Gancho (segundo 1)' })}: ${idea.hook}`,
    `Logline: ${idea.logline}`,
    `${tx({ de: 'Bildwelt', en: 'Visual world', es: 'Mundo visual' })}: ${idea.visualWorld}`,
    '',
    tx({ de: 'Szenenfolge, exakt so umsetzen:', en: 'Scene sequence, implement exactly like this:', es: 'Secuencia de escenas, impleméntala exactamente así:' }),
    ...idea.beats.map((b, i) => `${i + 1}. [${b.beat}] ${b.description} (~${b.seconds}s)`),
    '',
    `${tx({ de: 'Zielgruppe', en: 'Target audience', es: 'Público objetivo' })}: ${round.strategy.audience}`,
    `${tx({ de: 'Nutzen', en: 'Benefit', es: 'Beneficio' })}: ${round.strategy.benefit}`,
    tx({ de: `Kaufhemmnis, das entkräftet wird: ${round.strategy.objection}`, en: `Purchase barrier that is being refuted: ${round.strategy.objection}`, es: `Barrera de compra que se está refutando: ${round.strategy.objection}` }),
    `${tx({ de: 'Tonalität', en: 'Tone', es: 'Tono' })}: ${round.strategy.tone}`,
    round.options.lipSync
      ? tx({ de: `Bis zu ${round.options.lipSyncSpeakers} Person(en) sprechen sichtbar in die Kamera.`, en: `Up to ${round.options.lipSyncSpeakers} person(s) speak visibly into the camera.`, es: `Hasta ${round.options.lipSyncSpeakers} persona(s) hablan visiblemente a la cámara.` })
      : tx({ de: 'Niemand spricht sichtbar in die Kamera.', en: 'Nobody speaks visibly into the camera.', es: 'Nadie habla visiblemente a la cámara.' }),
    assetLines.length ? '' : '',
    assetLines.length ? tx({ de: 'Kundenbilder, die vorkommen:', en: 'Customer images that appear:', es: 'Imágenes del cliente que aparecen:' }) : '',
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
          {tx({ de: "← Andere Idee wählen", en: "← Choose another idea", es: "← Elegir otra idea" })}
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
