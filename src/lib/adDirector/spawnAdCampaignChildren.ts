/**
 * Auto-spawn cutdown + A/B variant child projects after the master ad render
 * completes. Each child is a fresh row in `composer_projects` with:
 *   - parent_project_id = master id
 *   - cutdown_type      = '15s' | '6s-hook' | null (null for variant siblings)
 *   - ad_variant_strategy = 'emotional' | 'rational' | 'curiosity' | null
 *
 * Children inherit briefing / brand kit / language from the master and reuse
 * the master's clip URLs verbatim (no extra AI cost). The user can later
 * re-render each child via the standard composer flow.
 */

import { supabase } from '@/integrations/supabase/client';
import { buildCutdown, type CutdownType } from './buildCutdowns';
import type {
  AdCampaignMeta,
  ComposerScene,
  AssemblyConfig,
  ComposerBriefing,
  AspectRatio,
} from '@/types/video-composer';

export interface SpawnInput {
  masterProjectId: string;
  masterTitle: string;
  briefing: ComposerBriefing;
  scenes: ComposerScene[];
  assemblyConfig: AssemblyConfig;
  language: string;
  brandKitId?: string | null;
  brandKitAutoSync?: boolean;
  adMeta: AdCampaignMeta;
}

export interface SpawnedChild {
  id: string;
  kind: 'cutdown' | 'variant' | 'aspect';
  label: string;
  cutdownType?: CutdownType;
  variantStrategy?: string;
  aspectRatio?: AspectRatio;
}

const VARIANT_LABEL: Record<string, string> = {
  emotional: 'Emotional Hook',
  rational: 'Rational Proof',
  curiosity: 'Curiosity Gap',
};

const CUTDOWN_LABEL: Record<CutdownType, string> = {
  master: 'Master',
  '15s': '15s Cutdown',
  '6s-hook': '6s Hook',
};

/** Strip volatile fields from a scene before reusing it in a child project. */
function freshSceneRow(s: ComposerScene, projectId: string, orderIndex: number) {
  return {
    project_id: projectId,
    order_index: orderIndex,
    scene_type: s.sceneType,
    duration_seconds: s.durationSeconds,
    clip_source: s.clipSource,
    clip_quality: s.clipQuality || 'standard',
    ai_prompt: s.aiPrompt ?? null,
    stock_keywords: s.stockKeywords ?? null,
    upload_url: s.uploadUrl ?? null,
    upload_type: s.uploadType ?? null,
    reference_image_url: s.referenceImageUrl ?? null,
    clip_url: s.clipUrl ?? null,
    clip_status: s.clipUrl ? 'ready' : 'pending',
    text_overlay: (s.textOverlay ?? null) as any,
    transition_type: s.transitionType || 'fade',
    transition_duration: s.transitionDuration ?? 0.5,
    cost_euros: 0,
    retry_count: 0,
    director_modifiers: (s.directorModifiers ?? {}) as any,
    shot_director: (s.shotDirector ?? {}) as any,
  };
}

async function createChildProject(args: {
  userId: string;
  input: SpawnInput;
  scenes: ComposerScene[];
  titleSuffix: string;
  cutdownType: CutdownType | null;
  variantStrategy: string | null;
  aspectRatio?: AspectRatio | null;
}): Promise<string | null> {
  const { userId, input, scenes, titleSuffix, cutdownType, variantStrategy, aspectRatio } = args;

  // Cutdown children: master VO would desync (30s VO on a 15s/6s cut). Disable
  // it by default and surface a hint so the user can re-synthesize a fresh VO
  // matching the new duration. A/B variant + aspect siblings keep the master VO.
  const childAssembly = cutdownType
    ? {
        ...input.assemblyConfig,
        voiceover: input.assemblyConfig?.voiceover
          ? { ...input.assemblyConfig.voiceover, enabled: false }
          : input.assemblyConfig?.voiceover,
      }
    : input.assemblyConfig;

  // For aspect-ratio siblings, override briefing.aspectRatio so the renderer
  // picks the correct canvas dimensions (Remotion crops/letterboxes accordingly).
  const childBriefing = aspectRatio
    ? { ...input.briefing, aspectRatio }
    : input.briefing;

  const { data: inserted, error: insErr } = await supabase
    .from('composer_projects')
    .insert({
      user_id: userId,
      title: `${input.masterTitle} — ${titleSuffix}`,
      category: 'product-ad',
      briefing: childBriefing as any,
      status: 'storyboard',
      assembly_config: childAssembly as any,
      total_cost_euros: 0,
      language: input.language,
      brand_kit_id: input.brandKitId ?? null,
      brand_kit_auto_sync: input.brandKitAutoSync ?? false,
      ad_meta: input.adMeta as any,
      ad_variant_strategy: variantStrategy,
      parent_project_id: input.masterProjectId,
      cutdown_type: cutdownType,
    } as any)
    .select('id')
    .single();

  if (insErr || !inserted) {
    console.warn('[spawnAdCampaignChildren] insert child failed:', insErr);
    return null;
  }

  if (scenes.length > 0) {
    const rows = scenes.map((s, i) => freshSceneRow(s, inserted.id, i));
    const { error: scnErr } = await supabase.from('composer_scenes').insert(rows as any);
    if (scnErr) {
      console.warn('[spawnAdCampaignChildren] insert scenes failed:', scnErr);
    }
  }

  return inserted.id;
}

export async function spawnAdCampaignChildren(
  input: SpawnInput,
): Promise<SpawnedChild[]> {
  const { adMeta } = input;
  const spawned: SpawnedChild[] = [];

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    console.warn('[spawnAdCampaignChildren] no auth user');
    return spawned;
  }

  // Idempotency: don't spawn twice for the same master.
  const { data: existing } = await supabase
    .from('composer_projects')
    .select('id, cutdown_type, ad_variant_strategy, briefing')
    .eq('parent_project_id', input.masterProjectId);
  if (existing && existing.length > 0) {
    return existing.map((row: any) => {
      const isAspect =
        typeof row.ad_variant_strategy === 'string' &&
        row.ad_variant_strategy.startsWith('aspect:');
      const ar = isAspect
        ? (row.ad_variant_strategy.slice('aspect:'.length) as AspectRatio)
        : undefined;
      return {
        id: row.id,
        kind: row.cutdown_type ? 'cutdown' : isAspect ? 'aspect' : 'variant',
        label: row.cutdown_type
          ? (CUTDOWN_LABEL[row.cutdown_type as CutdownType] ?? row.cutdown_type)
          : isAspect
          ? `Format ${ar}`
          : (VARIANT_LABEL[row.ad_variant_strategy] ?? row.ad_variant_strategy ?? 'Variant'),
        cutdownType: row.cutdown_type as CutdownType | undefined,
        variantStrategy: isAspect ? undefined : (row.ad_variant_strategy ?? undefined),
        aspectRatio: ar,
      } as SpawnedChild;
    });
  }

  // 1. Cutdowns
  for (const cd of adMeta.cutdowns ?? []) {
    const result = buildCutdown(input.scenes, cd);
    const childId = await createChildProject({
      userId: user.id,
      input,
      scenes: result.scenes,
      titleSuffix: CUTDOWN_LABEL[cd],
      cutdownType: cd,
      variantStrategy: null,
    });
    if (childId) {
      spawned.push({
        id: childId,
        kind: 'cutdown',
        label: CUTDOWN_LABEL[cd],
        cutdownType: cd,
      });
    }
  }

  // 2. A/B Variants — spawn one project per script variant (excluding the
  // already-rendered master variant). Scenes carry the same clip URLs but the
  // text overlay text is replaced with the variant script's first line.
  if (adMeta.renderAllVariants && adMeta.allVariantScripts?.length) {
    for (const v of adMeta.allVariantScripts) {
      if (v.id === adMeta.variantStrategy) continue; // skip master's chosen variant
      const variantScenes = input.scenes.map((s, i) => ({
        ...s,
        textOverlay: {
          ...s.textOverlay,
          text: v.lines[i] ?? s.textOverlay?.text ?? '',
        },
      }));
      const label = VARIANT_LABEL[v.id] ?? v.id;
      const childId = await createChildProject({
        userId: user.id,
        input,
        scenes: variantScenes as ComposerScene[],
        titleSuffix: label,
        cutdownType: null,
        variantStrategy: v.id,
      });
      if (childId) {
        spawned.push({
          id: childId,
          kind: 'variant',
          label,
          variantStrategy: v.id,
        });
      }
    }
  }

  // 3. Multi-Aspect siblings — clone master scenes 1:1 with a different
  // briefing.aspectRatio. No extra AI cost — Remotion crops/letterboxes to fit.
  // Master's own aspect ratio is excluded from spawning.
  const masterAspect = input.briefing.aspectRatio;
  const wantedAspects = (adMeta.aspectRatios ?? []).filter(
    (ar) => ar && ar !== masterAspect,
  );
  for (const ar of wantedAspects) {
    const childId = await createChildProject({
      userId: user.id,
      input,
      scenes: input.scenes,
      titleSuffix: `Format ${ar}`,
      cutdownType: null,
      variantStrategy: `aspect:${ar}`,
      aspectRatio: ar,
    });
    if (childId) {
      spawned.push({
        id: childId,
        kind: 'aspect',
        label: `Format ${ar}`,
        aspectRatio: ar,
      });
    }
  }

  return spawned;
}
