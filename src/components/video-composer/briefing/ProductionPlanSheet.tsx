/**
 * ProductionPlanSheet — the editable "Drehbuch"-Formular shown after the
 * deep-parser returns. The user can correct cast/location mappings, tweak
 * scene fields, then apply the plan to the storyboard.
 *
 * Lipsync safety: this UI displays — but never directly writes to —
 * lipsync DB tables. Apply runs through `useApplyProductionPlan` which
 * itself respects the protection filter.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Plus, Shield, Sparkles } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUnifiedMentionLibrary } from '@/hooks/useUnifiedMentionLibrary';
import { useApplyProductionPlan } from '@/hooks/useApplyProductionPlan';
import { ProductionPlan, type TProductionPlan, type TPlanScene } from '@/lib/video-composer/briefing/productionPlan';
import { ensureProductionPlanEnsemble } from '@/lib/video-composer/briefing/ensurePlanEnsemble';
import { finalizePlanCanonical } from '@/lib/video-composer/briefing/finalizePlanCanonical';
import { extractFunctionsErrorDetails } from '@/lib/functionsError';
import BriefingPlanSummary from './BriefingPlanSummary';
import SafePlanNotice from './SafePlanNotice';
import { resolveCatalogChip } from '@/lib/video-composer/catalog/useCatalogLabel';
import type { CatalogAxis } from '@/lib/video-composer/catalog';
import type { MotionStudioCharacter } from '@/types/motion-studio';
import {
  DEFAULT_OUTFIT_PRESETS,
  outfitPresetLabel,
} from '@/config/defaultOutfitPresets';
import type {
  ComposerScene,
  AssemblyConfig,
  ComposerBriefing,
} from '@/types/video-composer';


type Step = 'paste' | 'parsing' | 'review';

const isUuid = (val?: string | null) =>
  !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

const normalizeAssetKey = (value?: string | null) =>
  String(value ?? '')
    .trim()
    .replace(/^@/, '')
    .replace(/^(locationid|location|ort|place|setting)\s*@?\s*/i, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

const uuidInside = (value?: string | null) =>
  String(value ?? '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null;

type PlanCastSlot = NonNullable<TPlanScene['cast']>[number];
type PlanLocationSlot = NonNullable<TPlanScene['location']>;

const emptyCastSlot = (sceneIndex: number): PlanCastSlot => ({
  mentionKey: `S${String(sceneIndex).padStart(2, '0')} Sprecher`,
  characterId: null,
  characterName: 'Sprecher',
  outfitLookId: null,
  voiceId: null,
});

const emptyLocationSlot = (): PlanLocationSlot => ({
  mentionKey: 'Location',
  locationId: null,
  locationName: '',
  referenceImageUrl: null,
});

const cloneCastSlot = (slot: PlanCastSlot, sceneIndex: number): PlanCastSlot => ({
  ...slot,
  mentionKey: slot.mentionKey || `S${String(sceneIndex).padStart(2, '0')} Sprecher`,
  characterName: slot.characterName || 'Sprecher',
});

const shouldInheritContinuity = (scene: TPlanScene, axis: 'cast' | 'location') => {
  const haystack = [
    scene.continuityHint,
    scene.anchorPromptEN,
    scene.label,
    scene.beat,
    scene.voiceover?.text,
  ].filter(Boolean).join(' ').toLowerCase();

  if (axis === 'cast') {
    return scene.lipSync || !!scene.voiceover?.text || !!scene.dialogTurns?.length
      || /(same|gleiche|gleichen|selbe|derselbe|avatar|founder|sprecher|speaker|charakter|character)/i.test(haystack);
  }
  return /(same|gleiche|gleichen|selbe|derselbe|desk|location|ort|setting|home\s*office|büro|office)/i.test(haystack);
};

/**
 * Wave 3 chip: renders a catalog-resolved label (preferred) or the raw
 * free-text value, plus an `⚡ AI` micro-badge when the value came from a
 * Pass-C catalog id. Hidden when there's nothing to show.
 */
function CatalogChip({
  axis,
  id,
  raw,
  label,
}: {
  axis: CatalogAxis;
  id?: string | null;
  raw?: unknown;
  label: string;
}) {
  const chip = resolveCatalogChip(axis, id ?? null, raw);
  if (chip.empty) return null;
  return (
    <Badge
      variant="outline"
      className={`text-[10px] ${chip.fromCatalog ? 'border-amber-300/40 text-amber-200' : ''}`}
      title={id ? `${label}: ${chip.label} · catalog:${id}` : `${label}: ${chip.label}`}
    >
      {label}: {chip.label}
      {chip.fromCatalog ? <span className="ml-1 opacity-70">⚡</span> : null}
    </Badge>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string | undefined;
  language: string;
  currentScenes: ComposerScene[];
  currentAssembly: AssemblyConfig | undefined;
  currentBriefing: ComposerBriefing;
  onUpdateBriefing: (patch: Partial<ComposerBriefing>) => void;
  onUpdateScenes: (scenes: ComposerScene[]) => void;
  onApplyAssembly: (next: AssemblyConfig) => void;
  onApplied?: () => void;
  /**
   * Pre-loaded plan from the War Room flow. When set, the sheet opens
   * directly on the review step — the legacy paste-and-parse UI is
   * skipped. Used by the Briefing → Storyboard auto-analyse handoff.
   */
  initialPlan?: TProductionPlan | null;
}

export default function ProductionPlanSheet({
  open, onOpenChange,
  projectId, language,
  currentScenes, currentAssembly, currentBriefing,
  onUpdateBriefing, onUpdateScenes, onApplyAssembly,
  onApplied,
  initialPlan,
}: Props) {
  const [step, setStep] = useState<Step>(initialPlan ? 'review' : 'paste');
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<TProductionPlan | null>(initialPlan ?? null);
  const [progress, setProgress] = useState<'A' | 'B' | null>(null);
  const [progressLabel, setProgressLabel] = useState('');
  const { characters, locations } = useUnifiedMentionLibrary();
  const queryClient = useQueryClient();
  const applyPlan = useApplyProductionPlan();
  const [applying, setApplying] = useState(false);
  const [creatingLoc, setCreatingLoc] = useState<number | null>(null);
  const [applyResult, setApplyResult] = useState<{
    ok: boolean;
    message: string;
    warnings: string[];
  } | null>(null);
  const currentBriefingRef = useRef(currentBriefing);

  useEffect(() => {
    currentBriefingRef.current = currentBriefing;
  }, [currentBriefing]);

  // When a new initialPlan arrives (subsequent re-opens), refresh local state.
  useEffect(() => {
    if (initialPlan) {
      const withEnsemble = ensureProductionPlanEnsemble(initialPlan, currentBriefingRef.current);
      const finalized = finalizePlanCanonical(withEnsemble);
      setPlan(finalized?.plan ?? withEnsemble);
      setStep('review');
    }
  }, [initialPlan]);

  // Final display/apply gate. Everything visible in the review sheet must pass
  // through this derived plan, even if a stale raw plan reaches state via local
  // fallback, late initialPlan, HMR cache, or manual edits.
  const safePlanResult = useMemo(() => {
    if (!plan) return null;
    const withEnsemble = ensureProductionPlanEnsemble(plan, currentBriefingRef.current);
    return finalizePlanCanonical(withEnsemble);
  }, [plan, currentBriefing]);
  const safePlan = safePlanResult?.plan ?? null;

  // Board-Toggle folgt dem Briefing: sobald die Analyse eine kanonische
  // Gesamtdauer im Plan liefert (aus Skript-Timing abgeleitet), synchronisieren
  // wir den Briefing-Board-State darauf, damit Toggle und Skript nie
  // widersprüchliche Zahlen zeigen. Läuft für beide Pfade (War-Room initialPlan
  // + direkter Parse im Sheet). Idempotent via syncedSignatureRef.
  const syncedSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    const target = safePlan?.project?.totalDurationSec;
    if (!safePlan || !target || target < 1) return;
    const current = currentBriefingRef.current?.duration;
    const signature = `${safePlan.scenes?.length ?? 0}:${target}`;
    if (syncedSignatureRef.current === signature) return;
    if (typeof current === 'number' && Math.abs(current - target) < 0.5) {
      syncedSignatureRef.current = signature;
      return;
    }
    syncedSignatureRef.current = signature;
    const previous = current;
    try {
      onUpdateBriefing({ duration: target });
      toast({
        title: 'Dauer aus Briefing übernommen',
        description:
          typeof previous === 'number'
            ? `Board: ${previous}s → ${target}s (${safePlan.scenes?.length ?? 0} Szenen laut Skript).`
            : `Board auf ${target}s gesetzt (${safePlan.scenes?.length ?? 0} Szenen laut Skript).`,
      });
    } catch (err) {
      console.warn('[ProductionPlanSheet] board duration auto-sync failed', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePlan]);

  // Char options: split into Base avatars (no `outfit:` prefix) vs Outfit
  // looks. The cast picker shows base avatars in the Charakter dropdown
  // and a filtered outfit dropdown next to it (CastRef invariant: ID
  // separation is enforced at the picker boundary).
  const baseChars = useMemo(
    () => (characters ?? []).filter((c: MotionStudioCharacter) => c.meta?.kind !== 'outfit'),
    [characters],
  );
  const outfitMentions = useMemo(
    () => (characters ?? []).filter((c: MotionStudioCharacter) => c.meta?.kind === 'outfit'),
    [characters],
  );
  const charOptions = useMemo(
    () => baseChars.map((c) => ({ id: c.id, name: c.name, mention: c })),
    [baseChars],
  );
  const locOptions = useMemo(
    () => (locations ?? []).map((l: any) => ({ id: String(l.id), name: String(l.name ?? 'Location') })),
    [locations],
  );
  const findLocationOption = useMemo(() => {
    return (rawId?: string | null, rawName?: string | null) => {
      const id = rawId ? String(rawId) : '';
      if (id) {
        const exact = locOptions.find((o) => o.id === id);
        if (exact) return exact;
        const innerUuid = uuidInside(id);
        if (innerUuid) {
          const byUuid = locOptions.find((o) => o.id === innerUuid || o.id.endsWith(`:${innerUuid}`));
          if (byUuid) return byUuid;
        }
      }
      const key = normalizeAssetKey(rawName);
      if (!key) return undefined;
      return locOptions.find((o) => {
        const n = normalizeAssetKey(o.name);
        return n === key || n.includes(key) || key.includes(n);
      });
    };
  }, [locOptions]);

  // v180 Review Slot Hydrator: the parser may return incomplete scenes
  // (especially padded/continuity scenes). The review UI must still expose
  // editable Cast/Outfit/Location slots for EVERY scene, and Lip-Sync scenes
  // need a character slot so the Auto-Voice pool can assign a real Voice-ID.
  useEffect(() => {
    if (!plan) return;
    let changed = false;
    let lastResolvedCast: PlanCastSlot | null = null;
    let firstResolvedCast: PlanCastSlot | null = null;
    let lastResolvedLocation: PlanLocationSlot | null = null;
    let firstResolvedLocation: PlanLocationSlot | null = null;

    const scenes = plan.scenes.map((s) => {
      let next = s;
      const sourceCast = lastResolvedCast ?? firstResolvedCast;
      const cast = [...(s.cast ?? [])];

      if (cast.length === 0) {
        const inherited = sourceCast && shouldInheritContinuity(s, 'cast')
          ? cloneCastSlot(sourceCast, s.index)
          : emptyCastSlot(s.index);
        cast.push(inherited);
        changed = true;
      } else if (sourceCast && shouldInheritContinuity(s, 'cast')) {
        for (let i = 0; i < cast.length; i += 1) {
          if (!cast[i]?.characterId) {
            cast[i] = {
              ...cast[i],
              characterId: sourceCast.characterId,
              characterName: sourceCast.characterName,
              referenceImageUrl: sourceCast.referenceImageUrl,
              outfitLookId: cast[i].outfitLookId ?? sourceCast.outfitLookId ?? null,
              voiceId: cast[i].voiceId ?? sourceCast.voiceId ?? null,
              voiceName: cast[i].voiceName ?? sourceCast.voiceName,
              voiceAutoAssigned: cast[i].voiceAutoAssigned ?? sourceCast.voiceAutoAssigned,
            };
            changed = true;
          }
        }
      }

      const resolvedCast = cast.find((c) => c.characterId || c.outfitLookId) ?? null;
      if (resolvedCast) {
        lastResolvedCast = resolvedCast;
        if (!firstResolvedCast) firstResolvedCast = resolvedCast;
      }
      if (cast !== s.cast) next = { ...next, cast };

      const loc = next.location ?? null;
      const matched = findLocationOption(loc?.locationId, loc?.locationName ?? loc?.mentionKey);
      let location: PlanLocationSlot = loc ?? emptyLocationSlot();

      if (!loc) {
        const inherited = lastResolvedLocation ?? firstResolvedLocation;
        if (inherited) {
          location = { ...inherited };
        }
        changed = true;
      } else if (matched && (loc.locationId !== matched.id || loc.locationName !== matched.name)) {
        location = { ...loc, locationId: matched.id, locationName: matched.name };
        changed = true;
      } else if (!matched && !loc.locationId && (lastResolvedLocation ?? firstResolvedLocation)) {
        location = { ...(lastResolvedLocation ?? firstResolvedLocation)! };
        changed = true;
      }

      const resolvedLocation = findLocationOption(location.locationId, location.locationName ?? location.mentionKey);
      if (resolvedLocation) {
        location = { ...location, locationId: resolvedLocation.id, locationName: resolvedLocation.name };
        lastResolvedLocation = location;
        if (!firstResolvedLocation) firstResolvedLocation = location;
      }

      return {
        ...next,
        location,
      };
    });
    const basePlan = changed ? { ...plan, scenes } : plan;
    const nextPlan = ensureProductionPlanEnsemble(basePlan, currentBriefing);
    if (changed || nextPlan !== plan) setPlan(nextPlan);
  }, [plan, findLocationOption, currentBriefing]);

  /** Outfit looks belonging to a given base character id. */
  const outfitsByCharacter = useMemo(() => {
    const map = new Map<string, Array<{ lookId: string; name: string }>>();
    const seen = new Set<string>();
    for (const m of outfitMentions) {
      const base = m.meta?.baseCharacterId;
      const lookId = m.meta?.outfitLookId;
      if (!base || !lookId) continue;
      const dedupeKey = `${base}::${lookId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const fromMeta = m.meta?.outfitName ? String(m.meta.outfitName).trim() : '';
      const fromName = (m.name?.split(' — ')[1] ?? '').trim();
      // Only propagate real names. Fake fallbacks like "Unbenannter Look"
      // are dropped so the DB fallback / positional label wins.
      const rawName = fromMeta || fromName || '';
      const lookName = /^unbenannter look$/i.test(rawName) || /^standard-look$/i.test(rawName)
        ? ''
        : rawName;
      const arr = map.get(base) ?? [];
      arr.push({ lookId, name: lookName });
      map.set(base, arr);
    }
    return map;
  }, [outfitMentions]);

  /**
   * Global outfit lookup by lookId. Used so the UI can render a stable
   * label for ANY outfitLookId in the plan, even when the avatar library
   * hasn't loaded yet or when the resolver only stored `outfitLookId`
   * without a matching base character.
   */
  const outfitById = useMemo(() => {
    const map = new Map<string, { lookId: string; name: string; baseId: string | null }>();
    for (const m of outfitMentions) {
      const lookId = m.meta?.outfitLookId;
      if (!lookId || map.has(lookId)) continue;
      const fromMeta = m.meta?.outfitName ? String(m.meta.outfitName).trim() : '';
      const fromName = (m.name?.split(' — ')[1] ?? '').trim();
      // NOTE: never fall back to `m.name` — since v213 that is the base
      // avatar name (e.g. "Matthew Dusatko") which would leak into the
      // outfit dropdown label. Leaving `rawName` empty here triggers the
      // positional `Look N` fallback downstream, which is the correct UX.
      const rawName = fromMeta || fromName || '';
      const lookName = /^unbenannter look$/i.test(rawName) || /^standard-look$/i.test(rawName)
        ? ''
        : rawName;
      map.set(lookId, {
        lookId,
        name: lookName,
        baseId: m.meta?.baseCharacterId ?? null,
      });
    }
    return map;
  }, [outfitMentions]);

  // v178 Wave 2 — DB fallback for outfit look names.
  // When the unified mention library is still warming up (or the look was
  // saved after the last library refresh), the Sheet would otherwise label
  // the outfit "Standard-Look" / "Unbenannter Look". Pull names directly
  // from `avatar_outfit_looks` once and merge into the lookup map below.
  const outfitLookIdsInPlan = useMemo(() => {
    const set = new Set<string>();
    for (const s of safePlan?.scenes ?? plan?.scenes ?? []) {
      for (const c of (s.cast ?? [])) {
        if (c.outfitLookId) set.add(c.outfitLookId);
      }
    }
    return Array.from(set);
  }, [safePlan, plan]);
  const { data: dbOutfitLooks = [] } = useQuery({
    queryKey: ['avatar-outfit-looks-by-plan', outfitLookIdsInPlan.sort().join(',')],
    enabled: outfitLookIdsInPlan.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('avatar_outfit_looks')
        .select('id, name, avatar_id')
        .in('id', outfitLookIdsInPlan);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; avatar_id: string }>;
    },
    staleTime: 60_000,
  });
  const outfitLabelById = useMemo(() => {
    const map = new Map<string, string>();
    // Library mentions first — only real names, no fake fallbacks.
    for (const [lookId, info] of outfitById) {
      if (info.name) map.set(lookId, info.name);
    }
    // DB fallback wins for explicit names.
    for (const row of dbOutfitLooks) {
      const trimmed = String(row?.name ?? '').trim();
      if (row?.id && trimmed) map.set(row.id, trimmed);
    }
    return map;
  }, [outfitById, dbOutfitLooks]);

  /** Resolve any raw cast id (legacy `outfit:` or base UUID) to base + look. */
  const splitCastId = (rawId: string | null | undefined): { baseId: string | null; outfitLookId: string | null } => {
    if (!rawId) return { baseId: null, outfitLookId: null };
    if (rawId.startsWith('outfit:')) {
      const lookId = rawId.slice('outfit:'.length);
      const hit = outfitById.get(lookId);
      return {
        baseId: hit?.baseId ?? null,
        outfitLookId: lookId,
      };
    }
    if (rawId.startsWith('catalog:')) return { baseId: uuidInside(rawId) ?? rawId.split(':').pop() ?? null, outfitLookId: null };
    if (rawId.startsWith('lib:')) return { baseId: rawId.slice(4), outfitLookId: null };
    return { baseId: rawId, outfitLookId: null };
  };


  // Identify which existing scenes are lipsync-protected (display only).
  const protectedSceneIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of currentScenes) {
      const a = s as any;
      if (
        (s.clipStatus && s.clipStatus !== 'pending') ||
        s.clipUrl ||
        a.lipSyncStatus ||
        a.dialogLockedAt ||
        a.lockReferenceUrl
      ) set.add(s.id);
    }
    return set;
  }, [currentScenes]);

  useEffect(() => {
    if (!open) {
      // Reset after closing.
      setTimeout(() => {
        setStep('paste');
        setText('');
        setPlan(null);
        setProgress(null);
        setApplyResult(null);
      }, 200);
    }
  }, [open]);

  const handleParse = async () => {
    const briefing = text.trim();
    if (briefing.length < 40) {
      toast({
        title: 'Briefing zu kurz',
        description: 'Mindestens ein paar Sätze einfügen.',
        variant: 'destructive',
      });
      return;
    }
    if (!isUuid(projectId)) {
      toast({
        title: 'Projekt noch nicht gespeichert',
        description: 'Bitte erst über den Briefing-Flow ins Storyboard wechseln, damit ein echtes Projekt angelegt wird.',
        variant: 'destructive',
      });
      return;
    }
    setStep('parsing');
    setProgress('A');
    setProgressLabel('Pass A · Strukturextraktion');

    // Fake progress switch so the user sees the 2 phases moving.
    const phaseTimer = setTimeout(() => {
      setProgress('B');
      setProgressLabel('Pass B · Validierung & Resolver');
    }, 30_000);

    try {
      const { data, error } = await supabase.functions.invoke('briefing-deep-parse', {
        body: { briefing, projectId, language },
      });
      clearTimeout(phaseTimer);
      if (error) throw error;
      const parsed = ProductionPlan.safeParse(data?.plan);
      if (!parsed.success) {
        console.warn('[ProductionPlanSheet] plan validation failed', parsed.error);
        throw new Error('Plan-Validierung fehlgeschlagen');
      }
      // Selfheal: re-index duplicates so the UI never silently drops a scene.
      const seen = new Set<number>();
      const healed = {
        ...parsed.data,
        scenes: parsed.data.scenes.map((s, i) => {
          if (seen.has(s.index)) {
            return { ...s, index: i + 1 };
          }
          seen.add(s.index);
          return s;
        }),
      };
      // Second pass if first pass produced new collisions.
      healed.scenes = healed.scenes.map((s, i) => ({ ...s, index: i + 1 }));
      const withEnsemble = ensureProductionPlanEnsemble(healed, currentBriefing);
      const finalized = finalizePlanCanonical(withEnsemble);
      setPlan(finalized?.plan ?? withEnsemble);
      setStep('review');

    } catch (e: any) {
      clearTimeout(phaseTimer);
      const details = await extractFunctionsErrorDetails(e);
      const msg = details.message || 'Deep-Parse fehlgeschlagen';
      const status = details.status;
      console.error('[ProductionPlanSheet] deep-parse failed', { status, msg, body: details.body });
      toast({
        title: 'Briefing konnte nicht verarbeitet werden',
        description: status === 402 || /402/.test(msg) ? 'Keine AI-Credits mehr.'
          : status === 429 || /429/.test(msg) ? 'Zu viele Anfragen — bitte kurz warten.'
          : status ? `${status}: ${msg}` : msg,
        variant: 'destructive',
      });
      setStep('paste');
      setProgress(null);
    }
  };

  const handleApply = async () => {
    const planForApply = safePlan ?? plan;
    if (!planForApply) return;
    setApplyResult(null);
    if (!isUuid(projectId)) {
      const message = 'Projekt-ID fehlt — Plan wurde nicht angewendet.';
      setApplyResult({ ok: false, message, warnings: [] });
      toast({
        title: 'Plan blockiert',
        description: message,
        variant: 'destructive',
      });
      return;
    }
    if (durationInconsistent) {
      const message = 'Plan inkonsistent — Projekt-Gesamtdauer passt nicht zur Szenensumme.';
      setApplyResult({ ok: false, message, warnings: [] });
      toast({ title: 'Plan blockiert', description: message, variant: 'destructive' });
      return;
    }
    setApplying(true);
    try {
      const withEnsemble = ensureProductionPlanEnsemble(planForApply, currentBriefing);
      const finalized = finalizePlanCanonical(withEnsemble);
      const normalizedPlan = finalized?.plan ?? withEnsemble;
      const finalSum = Math.round((normalizedPlan.scenes ?? []).reduce((a, s) => a + Number(s.durationSec || 0), 0) * 10) / 10;
      const finalTarget = Number(normalizedPlan.project?.totalDurationSec);
      const finalConsistent = finalized?.normalization?.consistent !== false
        && Number.isFinite(finalTarget)
        && Math.abs(finalTarget - finalSum) < 0.5;
      if (!finalConsistent) {
        const message = `Plan inkonsistent — ${finalTarget || '—'}s Projekt vs. ${finalSum}s Szenensumme.`;
        setApplyResult({ ok: false, message, warnings: [] });
        toast({ title: 'Plan blockiert', description: message, variant: 'destructive' });
        return;
      }
      if (normalizedPlan !== plan) setPlan(normalizedPlan);
      const result = await applyPlan({
        plan: normalizedPlan,
        projectId,
        language,
        currentScenes,
        currentAssembly,
        currentBriefing,
        onUpdateBriefing,
        onUpdateScenes,
        onApplyAssembly,
      });
      const warnings = result.warnings ?? [];
      setApplyResult({
        ok: warnings.length === 0,
        message: `DB-verifiziert: ${result.scenesNew} neu · ${result.scenesReplaced} ersetzt · ${result.scenesProtected} geschützt`,
        warnings,
      });
      toast({
        title: warnings.length ? 'Plan übernommen — bitte Hinweise prüfen' : 'Plan übernommen und verifiziert',
        description: warnings.length
          ? warnings.join(' · ')
          : `${result.scenesNew} neu · ${result.scenesReplaced} ersetzt · ${result.scenesProtected} geschützt`,
        variant: warnings.length ? 'destructive' : undefined,
      });
      if (warnings.length === 0) {
        onApplied?.();
        onOpenChange(false);
      }
    } catch (e: any) {
      setApplyResult({ ok: false, message: e?.message ?? String(e), warnings: [] });
      toast({
        title: 'Plan konnte nicht angewendet werden',
        description: e?.message ?? String(e),
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  // ── Plan editing ────────────────────────────────────────────────────────
  const updateScene = (index: number, patch: Partial<TProductionPlan['scenes'][number]>) => {
    setPlan((p) => p && {
      ...p,
      scenes: p.scenes.map((s) => (s.index === index ? { ...s, ...patch } : s)),
    });
  };
  /**
   * Sets the BASE character on a cast slot (CastRef.characterId).
   * Resets `outfitLookId` so we never end up with an outfit that
   * belongs to a different avatar.
   */
  const updateSceneCastChar = (sceneIndex: number, castIdx: number, characterId: string | null) => {
    setPlan((p) => p && {
      ...p,
      scenes: p.scenes.map((s) => {
        if (s.index !== sceneIndex) return s;
        const cast = [...(s.cast ?? [])];
        while (cast.length <= castIdx) cast.push(emptyCastSlot(sceneIndex));
        const c = cast[castIdx] ?? emptyCastSlot(sceneIndex);
        const matched = charOptions.find((x) => x.id === characterId);
        cast[castIdx] = {
          ...c,
          characterId,
          characterName: matched?.name ?? c.characterName,
          // Outfit is a separate axis — reset it when the base avatar changes.
          outfitLookId: null,
        };
        return { ...s, cast };
      }),
    });
  };

  /** Sets the optional outfit look (CastRef.outfitLookId) on a cast slot. */
  const updateSceneCastOutfit = (sceneIndex: number, castIdx: number, outfitLookId: string | null) => {
    setPlan((p) => p && {
      ...p,
      scenes: p.scenes.map((s) => {
        if (s.index !== sceneIndex) return s;
        const cast = [...(s.cast ?? [])];
        while (cast.length <= castIdx) cast.push(emptyCastSlot(sceneIndex));
        const c = cast[castIdx] ?? emptyCastSlot(sceneIndex);
        // Selecting a real library look clears the prompt-only preset so
        // we never send both signals to the anchor compositor at once.
        cast[castIdx] = { ...c, outfitLookId, ...(outfitLookId ? { outfitPreset: null } : {}) };
        return { ...s, cast };
      }),
    });
  };

  /**
   * Sets the prompt-only default-outfit preset id on a cast slot.
   * Never touches `outfitLookId`; the apply step appends the English
   * preset fragment to the scene prompt.
   */
  const updateSceneCastPreset = (sceneIndex: number, castIdx: number, presetId: string | null) => {
    setPlan((p) => p && {
      ...p,
      scenes: p.scenes.map((s) => {
        if (s.index !== sceneIndex) return s;
        const cast = [...(s.cast ?? [])];
        while (cast.length <= castIdx) cast.push(emptyCastSlot(sceneIndex));
        const c = cast[castIdx] ?? emptyCastSlot(sceneIndex);
        cast[castIdx] = { ...c, outfitPreset: presetId };
        return { ...s, cast };
      }),
    });
  };

  const updateSceneLocation = (sceneIndex: number, locationId: string | null) => {
    setPlan((p) => p && {
      ...p,
      scenes: p.scenes.map((s) => {
        if (s.index !== sceneIndex) return s;
        const matched = findLocationOption(locationId, null);
        const baseLocation = s.location ?? emptyLocationSlot();
        return {
          ...s,
          location: {
            ...baseLocation,
            mentionKey: matched?.name ?? baseLocation.mentionKey,
            locationId: matched?.id ?? locationId,
            locationName: matched?.name ?? baseLocation.locationName,
          },
        };
      }),
    });
  };

  /**
   * v177.1 — Quick-create a stub Location in `brand_locations` when the
   * briefing mentions a location the library does not yet contain. Uses a
   * placeholder reference image so the row satisfies the NOT NULL constraint;
   * the user can re-shoot the reference in the Location library later.
   */
  const quickCreateLocation = async (sceneIndex: number, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreatingLoc(sceneIndex);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error('Not authenticated');
      const placeholder = `https://placehold.co/1024x576/050816/F5C76A?text=${encodeURIComponent(trimmed)}`;
      const { data: row, error } = await supabase
        .from('brand_locations' as any)
        .insert({
          user_id: auth.user.id,
          name: trimmed,
          description: `Stub angelegt aus Briefing — Referenzbild später ersetzen.`,
          reference_image_url: placeholder,
          tags: ['briefing-stub'],
        })
        .select('id, name')
        .single();
      if (error) throw error;
      const created = row as unknown as { id: string; name: string };
      await queryClient.invalidateQueries({ queryKey: ['brand-locations'] });

      // v178 Wave 2 — fan out the resolved locationId to ALL scenes that
      // reference the same mention/name. Without this every scene with
      // the same "@Home Office" would need its own quick-create click.
      const trigger = plan?.scenes.find((s) => s.index === sceneIndex);
      const triggerKey = normalizeAssetKey(
        trigger?.location?.mentionKey ?? trigger?.location?.locationName ?? trimmed,
      );
      let matched = 0;
      setPlan((p) =>
        p && {
          ...p,
          scenes: p.scenes.map((s) => {
            if (!s.location) return s;
            const key = normalizeAssetKey(s.location.mentionKey ?? s.location.locationName ?? '');
            if (s.index === sceneIndex || key === triggerKey) {
              matched += 1;
              return {
                ...s,
                location: { ...s.location, locationId: created.id, locationName: created.name },
              };
            }
            return s;
          }),
        },
      );
      toast({
        title: 'Location angelegt',
        description: matched > 1
          ? `„${created.name}" — für ${matched} Szenen übernommen.`
          : `„${created.name}" ist jetzt in der Library.`,
      });
    } catch (e: any) {
      toast({ title: 'Konnte Location nicht anlegen', description: e?.message || 'Unbekannter Fehler', variant: 'destructive' });
    } finally {
      setCreatingLoc(null);
    }
  };

  const totalPlanSec = useMemo(
    () => Math.round((safePlan?.scenes ?? []).reduce((a, s) => a + Number(s.durationSec || 0), 0) * 10) / 10,
    [safePlan],
  );

  // v215 — Consistency Gate: die zentrale Normalisierung garantiert
  // `project.totalDurationSec === sum(scenes)`. Falls das UI trotzdem einen
  // Delta zeigt (z.B. wegen manueller Edits), blockieren wir den Apply
  // und weisen den User darauf hin.
  const durationInconsistent = useMemo(() => {
    const target = Number(safePlan?.project?.totalDurationSec);
    if (!Number.isFinite(target) || target < 1) return false;
    const consistent = (safePlan as any)?._meta?.debug?.normalization?.consistent;
    return consistent === false || Math.abs(target - totalPlanSec) >= 0.5;
  }, [safePlan, totalPlanSec]);

  const normalizationMeta = (safePlan as any)?._meta?.debug?.normalization ?? null;

  // ── Live-recompute unresolved ───────────────────────────────────────────
  // The Edge Function emits `plan.unresolved` once. As the user edits the
  // cast/location dropdowns, items that point at now-resolved fields are
  // filtered out so the "offene Punkte"-Counter shrinks live.
  const liveUnresolved = useMemo(() => {
    if (!safePlan) return [] as TProductionPlan['unresolved'];
    return (safePlan.unresolved ?? []).filter((u) => {
      // Gemini/Pass-B has emitted both 0-based paths (scenes[0]) and
      // 1-based scene indexes (scenes[1]). Prefer the actual scene.index
      // contract, then fall back to array position for legacy rows.
      const scenesByPathRef = (ref: number) =>
        [safePlan.scenes.find((s) => s.index === ref), safePlan.scenes[ref]].filter(Boolean);
      const m = /^scenes\[(\d+)\]\.cast\[(\d+)\]\.characterId$/.exec(u.field);
      if (m) {
        const cIdx = Number(m[2]);
        if (scenesByPathRef(Number(m[1])).some((scene) => scene?.cast?.[cIdx]?.characterId)) return false;
      }
      const ml = /^scenes\[(\d+)\]\.location\.locationId$/.exec(u.field);
      if (ml) {
        if (scenesByPathRef(Number(ml[1])).some((scene) => {
          const loc = scene?.location;
          return !!(loc && findLocationOption(loc.locationId, loc.locationName ?? loc.mentionKey));
        })) return false;
      }
      if (u.field === 'project.totalDurationSec') {
        const proj = safePlan.project?.totalDurationSec;
        if (!proj || proj === totalPlanSec) return false;
      }
      return true;
    });
  }, [safePlan, totalPlanSec, findLocationOption]);

  /**
   * Auto-Resolve: for every missing cast/location slot, run the same fuzzy
   * matching as the server-side resolver. Location resolution accepts both
   * real UUIDs and catalog:* IDs from the unified mention library.
   */
  const handleAutoResolve = () => {
    if (!plan) return;
    let castFixed = 0;
    let locationFixed = 0;
    setPlan((p) => {
      if (!p) return p;
      let lastCast: PlanCastSlot | null = null;
      let firstCast: PlanCastSlot | null = null;
      let lastLocation: PlanLocationSlot | null = null;
      let firstLocation: PlanLocationSlot | null = null;

      const scenes = p.scenes.map((s) => {
        const cast = (s.cast ?? []).map((c) => {
          if (c.characterId) return c;
          const needle = normalizeAssetKey(c.mentionKey || c.characterName || '');
          if (!needle) return c;
          const hit = charOptions.find((o) => {
            const n = normalizeAssetKey(o.name);
            return n.includes(needle) || needle.includes(n);
          });
          if (!hit) return c;
          castFixed += 1;
          return {
            ...c,
            characterId: hit.id,
            characterName: hit.name,
            outfitLookId: null,
          };
        });
        if (cast.length === 0) cast.push(emptyCastSlot(s.index));
        for (let i = 0; i < cast.length; i += 1) {
          if (!cast[i].characterId && (lastCast ?? firstCast)) {
            cast[i] = cloneCastSlot((lastCast ?? firstCast)!, s.index);
            castFixed += 1;
          }
        }
        const resolvedCast = cast.find((c) => c.characterId || c.outfitLookId) ?? null;
        if (resolvedCast) {
          lastCast = resolvedCast;
          if (!firstCast) firstCast = resolvedCast;
        }

        let location = s.location ?? emptyLocationSlot();
        if (!findLocationOption(location.locationId, location.locationName ?? location.mentionKey)) {
          const hit = findLocationOption(null, location.mentionKey ?? location.locationName);
          if (hit) {
            locationFixed += 1;
            location = {
              ...location,
              locationId: hit.id,
              locationName: hit.name,
            };
          } else if (lastLocation ?? firstLocation) {
            locationFixed += 1;
            location = { ...(lastLocation ?? firstLocation)! };
          }
        }
        const resolvedLocation = findLocationOption(location.locationId, location.locationName ?? location.mentionKey);
        if (resolvedLocation) {
          location = { ...location, locationId: resolvedLocation.id, locationName: resolvedLocation.name };
          lastLocation = location;
          if (!firstLocation) firstLocation = location;
        }
        return { ...s, cast, location };
      });
      return { ...p, scenes };
    });
    const fixed = castFixed + locationFixed;
    toast({
      title: fixed > 0 ? `${fixed} Zuordnung${fixed === 1 ? '' : 'en'} automatisch repariert` : 'Keine weiteren Auto-Matches',
      description: fixed > 0
        ? `${castFixed} Cast · ${locationFixed} Location — du kannst alles im Dropdown noch anpassen.`
        : undefined,
    });
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90dvh] max-h-[90dvh] overflow-hidden grid grid-rows-[auto_minmax(0,1fr)_auto_auto] p-4 gap-3">
        <DialogHeader className="space-y-1 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-amber-300" />
            Production Plan — Briefing analysieren & übernehmen
            {safePlan?._meta?.source === 'local-fallback' && (
              <Badge variant="outline" className="ml-auto text-[10px] border-amber-400/40 text-amber-300 bg-amber-400/[0.06]">
                Lokaler Fallback-Plan
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {safePlan?._meta?.source === 'local-fallback'
              ? 'Die AI-Analyse war offline — dieser Plan wurde lokal aus deinem Briefing-Text extrahiert. Bitte vor dem Übernehmen prüfen.'
              : 'Editierbarer Drehplan aus deinem Briefing. Bereits gerenderte oder Lip-Sync-aktive Szenen werden nie überschrieben.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'paste' && (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Füge dein komplettes Briefing ein.\nAuch lang ok — Tabellen, VO-Skript, Voice-Settings, Captions, Negative Prompt.\nDie KI extrahiert deterministisch alle Felder.`}
              className="flex-1 min-h-[320px] font-mono text-xs"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {text.length.toLocaleString()} Zeichen ·
                ~{Math.ceil(text.length / 4).toLocaleString()} Tokens
                {text.length > 120_000 && <span className="text-destructive ml-2">— zu lang (max ~120k)</span>}
              </span>
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3" /> Lip-Sync-Pipeline geschützt
              </span>
            </div>
          </div>
        )}

        {step === 'parsing' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-amber-300" />
            <div className="text-sm font-medium">{progressLabel}</div>
            <div className="text-xs text-muted-foreground max-w-md text-center">
              Die KI liest dein Briefing in zwei Durchgängen. Das kann 1–2 Minuten dauern —
              Qualität geht vor Geschwindigkeit.
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Badge variant={progress === 'A' ? 'default' : 'outline'}>A · Extraktion</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant={progress === 'B' ? 'default' : 'outline'}>B · Resolver</Badge>
            </div>
          </div>
        )}

        {step === 'review' && safePlan && (() => {
          const plan = safePlan;
          return (
          <ScrollArea className="h-full min-h-0 pr-3 -mr-1">
            <div className="space-y-3">
              {/* v215 — Konsistenz-Blocker: nur sichtbar, wenn Projekt-Total und
                  Szenensumme voneinander abweichen. Wenn sichtbar → Apply ist blockiert. */}
              {durationInconsistent && (
                <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 font-medium text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Plan inkonsistent — Apply blockiert
                  </div>
                  <div className="text-muted-foreground">
                    Projekt-Gesamtdauer <b>{plan.project?.totalDurationSec}s</b> passt nicht
                    zur Szenensumme <b>{totalPlanSec}s ({plan.scenes.length} Szenen)</b>.
                    Bitte Szenendauern korrigieren oder das Briefing neu analysieren.
                  </div>
                </div>
              )}

              {/* v216 — SafePlanNotice: klare, deutsche Zusammenfassung aller
                  Auto-Repairs mit aufklappbaren Details (L1 + L2). */}
              {normalizationMeta && (
                <SafePlanNotice normalization={normalizationMeta} />
              )}

              {/* Projekt */}
              <SectionCard title="Projekt">
                <Row label="Name" value={plan.project?.name} />
                <Row label="Format" value={plan.project?.aspectRatio} />
                <Row label="FPS" value={plan.project?.fps?.toString()} />
                <Row label="Gesamtdauer" value={plan.project?.totalDurationSec ? `${plan.project.totalDurationSec}s` : undefined} />
                <Row label="Plattformen" value={plan.project?.platforms?.join(', ')} />
                <Row
                  label="Summe Szenen"
                  value={`${totalPlanSec}s (${plan.scenes.length} Szenen)`}
                  highlight={plan.project?.totalDurationSec ? totalPlanSec !== plan.project.totalDurationSec : false}
                />
              </SectionCard>

              {/* Szenen */}
              <SectionCard title={`Szenen (${plan.scenes.length})`}>
                {plan.scenes.length === 0 ? (
                  <div className="rounded border border-amber-300/40 bg-amber-300/[0.05] p-4 text-xs space-y-2">
                    <div className="font-medium text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Briefing zu dünn — keine Szenen geplant
                    </div>
                    <div className="text-muted-foreground">
                      Bitte zurück zum Briefing gehen und mindestens Produktname + 1–2 USPs oder
                      eine Szenenbeschreibung ergänzen. Optional ein oder mehrere Charaktere im
                      Briefing auswählen — die KI plant dann automatisch ein vollständiges Drehbuch.
                    </div>
                    <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
                      Zurück zu Briefing
                    </Button>
                  </div>
                ) : (
                <div className="space-y-3">
                  {plan.scenes.map((s, sIdx) => (
                    <div key={`scene-${sIdx}-${s.index}`} className="rounded border border-border/40 p-2 space-y-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">S{String(s.index).padStart(2, '0')}</Badge>
                        <span className="font-medium truncate">{s.label ?? s.beat ?? '—'}</span>

                        <Badge variant="secondary" className="text-[10px] ml-auto">{s.engine ?? 'auto'}</Badge>
                        {s.lipSync && (
                          <Badge variant="outline" className="text-[10px] border-amber-300/40 text-amber-300">
                            Lip-Sync
                          </Badge>
                        )}
                        <span className="text-muted-foreground">{s.durationSec}s</span>
                      </div>

                      {/* Verification status chips — at-a-glance check that
                          the plan actually carries the implemented fields. */}
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${s.voiceover?.text ? 'border-emerald-400/40 text-emerald-300' : 'border-amber-400/40 text-amber-300'}`}
                          title={s.voiceover?.text ? s.voiceover.text : 'Kein Skript im Plan — Szene würde ohne Voiceover/Lip-Sync rendern.'}
                        >
                          {s.voiceover?.text ? '✓ Skript' : '— Skript'}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${s.shotDirector?.framing || s.shotDirector?.movement ? 'border-emerald-400/40 text-emerald-300' : 'border-muted-foreground/30 text-muted-foreground'}`}
                          title={
                            s.shotDirector
                              ? `framing=${s.shotDirector.framing ?? '—'} · angle=${s.shotDirector.angle ?? '—'} · movement=${s.shotDirector.movement ?? '—'} · lighting=${s.shotDirector.lighting ?? '—'}`
                              : 'Keine Kameraführung im Plan.'
                          }
                        >
                          {s.shotDirector?.framing || s.shotDirector?.movement ? '✓ Shot-Director' : '— Shot-Director'}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${(s.cast ?? []).length > 0 ? 'border-emerald-400/40 text-emerald-300' : 'border-muted-foreground/30 text-muted-foreground'}`}
                          title={(s.cast ?? []).map((c) => c.mentionKey || c.characterName).join(', ') || 'Kein Cast im Plan.'}
                        >
                          {(s.cast ?? []).length > 0 ? `✓ Cast (${(s.cast ?? []).length})` : '— Cast'}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${s.anchorPromptEN ? 'border-emerald-400/40 text-emerald-300' : 'border-muted-foreground/30 text-muted-foreground'}`}
                          title={s.anchorPromptEN ?? 'Kein Anchor-Prompt im Plan.'}
                        >
                          {s.anchorPromptEN ? '✓ Anchor-Prompt' : '— Anchor-Prompt'}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${s.performance && (s.performance.mimik || s.performance.gestik || s.performance.blick) ? 'border-emerald-400/40 text-emerald-300' : 'border-muted-foreground/30 text-muted-foreground'}`}
                          title={s.performance ? `mimik=${s.performance.mimik ?? '—'} · gestik=${s.performance.gestik ?? '—'} · blick=${s.performance.blick ?? '—'} · energy=${s.performance.energy ?? '—'}` : 'Keine Performance-Anweisung.'}
                        >
                          {s.performance && (s.performance.mimik || s.performance.gestik || s.performance.blick) ? '✓ Performance' : '— Performance'}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${s.lipSync ? 'border-amber-400/40 text-amber-300' : 'border-muted-foreground/30 text-muted-foreground'}`}
                          title={s.lipSync ? 'Lip-Sync aktiv — HappyHorse Primary, Hailuo Fallback.' : 'B-Roll/HeyGen-Modus.'}
                        >
                          {s.lipSync ? '✓ Lip-Sync' : 'B-Roll'}
                        </Badge>
                        {/* Stage-3 mapping completion chips — 3-state:
                            ✓ explicit (emerald) · ✨ AI-inferred (amber) ·
                            — composer default (muted). */}
                        {(() => {
                          const aiFilled = new Set<string>(
                            ((s as any)._meta?.aiFilled ?? []) as string[],
                          );
                          const chip = (
                            key: string,
                            present: boolean,
                            label: string,
                            valueTitle: string,
                            defaultTitle: string,
                          ) => {
                            const inferred = aiFilled.has(key) && present;
                            const explicit = present && !inferred;
                            const cls = explicit
                              ? 'border-emerald-400/40 text-emerald-300'
                              : inferred
                                ? 'border-amber-400/40 text-amber-300'
                                : 'border-muted-foreground/30 text-muted-foreground';
                            const icon = explicit ? '✓' : inferred ? '✨' : '—';
                            const titleSuffix = explicit
                              ? ' · explizit im Briefing'
                              : inferred
                                ? ' · von KI ergänzt'
                                : '';
                            return (
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${cls}`}
                                title={(present ? valueTitle : defaultTitle) + titleSuffix}
                              >
                                {icon} {label}
                                {present && icon !== '—' ? '' : ''}
                              </Badge>
                            );
                          };
                          return (
                            <>
                              {chip(
                                'transition.type',
                                !!s.transition?.type,
                                s.transition?.type
                                  ? `Transition: ${s.transition.type} · ${s.transition.durationSec ?? 0.4}s`
                                  : '',
                                `Transition: ${s.transition?.type ?? 'crossfade'} (Default)`,
                                'Default crossfade 0.4s.',
                              )}
                              {chip(
                                'textOverlay.text',
                                !!s.textOverlay?.text,
                                s.textOverlay?.text
                                  ? `Overlay: "${s.textOverlay.text}" (${s.textOverlay.position ?? 'bottom'})`
                                  : '',
                                `Overlay: "${s.textOverlay?.text ?? ''}"`,
                                'Kein burnt-in Overlay (gewollt).',
                              )}
                              {chip(
                                'tone',
                                !!s.tone,
                                `Tone: ${s.tone}`,
                                `Tone: ${s.tone}`,
                                'Briefing-Tone fällt durch (gewollt).',
                              )}
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${typeof s.seed === 'number' ? 'border-emerald-400/40 text-emerald-300' : 'border-muted-foreground/30 text-muted-foreground'}`}
                                title={typeof s.seed === 'number'
                                  ? `Seed=${s.seed} · reproduzierbarer Render`
                                  : 'Kein Seed — Composer würfelt pro Render (gewollt für A/B-Tests).'}
                              >
                                {typeof s.seed === 'number' ? `✓ Seed (${s.seed})` : '— Seed · random'}
                              </Badge>
                              {(s.cast ?? []).some((c) => (c as any).shotType) && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] border-emerald-400/40 text-emerald-300"
                                  title={(s.cast ?? []).filter((c) => (c as any).shotType).map((c) => `${c.mentionKey}=${(c as any).shotType}`).join(' · ')}
                                >
                                  ✓ Cast-Shots
                                </Badge>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {s.voiceover?.text && (
                        <div className="italic text-muted-foreground line-clamp-2">
                          "{s.voiceover.text}"
                        </div>
                      )}

                      {/* Director's vision — anchor prompt (clamped) */}
                      {s.anchorPromptEN && (
                        <div className="rounded border border-amber-300/20 bg-amber-300/[0.03] p-1.5 text-[11px] text-foreground/90 line-clamp-3">
                          {s.anchorPromptEN}
                        </div>
                      )}

                      {/* Performance: Mimik / Gestik / Blick / Energy */}
                      {s.performance && (s.performance.mimik || s.performance.gestik || s.performance.blick || s.performance.energy != null || (s.performance as any).mimikId || (s.performance as any).gestikId || (s.performance as any).blickId || (s.performance as any).energyId) && (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Performance</Label>
                          <div className="flex flex-wrap gap-1">
                            <CatalogChip axis="mimik"  id={(s.performance as any).mimikId}  raw={s.performance.mimik}  label="Mimik" />
                            <CatalogChip axis="gestik" id={(s.performance as any).gestikId} raw={s.performance.gestik} label="Gestik" />
                            <CatalogChip axis="blick"  id={(s.performance as any).blickId}  raw={s.performance.blick}  label="Blick" />
                            <CatalogChip axis="energy" id={(s.performance as any).energyId} raw={s.performance.energy != null ? `${s.performance.energy}/5` : undefined} label="Energy" />
                          </div>
                        </div>
                      )}

                      {/* Dialog turns (multi-speaker, lipsync-ready) */}
                      {(s.dialogTurns ?? []).length > 0 && (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Dialog ({s.dialogTurns!.length} Turn{s.dialogTurns!.length === 1 ? '' : 's'})
                          </Label>
                          <div className="rounded border border-amber-300/20 bg-amber-300/[0.04] p-2 space-y-1 font-mono text-[11px]">
                            {s.dialogTurns!.map((t, i) => (
                              <div key={i}>
                                <span className="text-amber-300">
                                  {t.speakerMentionKey.replace(/^@/, '').toUpperCase()}
                                  {t.mood ? ` — ${t.mood.toUpperCase()}` : ''}:
                                </span>{' '}
                                <span className="text-muted-foreground">{t.text}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Stage-2 plan extras: brollHints / brandAnchor / continuity / music / per-scene negative */}
                      {(s.brollHints?.length || s.brandAnchor || s.musicCue || s.continuityHint || s.negativePromptScene) && (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Plan-Extras</Label>
                          <div className="flex flex-wrap gap-1">
                            {(s.brollHints ?? []).map((h, i) => (
                              <Badge key={`br-${i}`} variant="outline" className="text-[10px]">B-Roll: {h}</Badge>
                            ))}
                            {s.brandAnchor?.logoEndcard && (
                              <Badge variant="outline" className="text-[10px] border-amber-300/40 text-amber-300">Logo-Endcard</Badge>
                            )}
                            {s.brandAnchor?.primaryColorOverride && (
                              <Badge variant="outline" className="text-[10px]">Brand-Color: {s.brandAnchor.primaryColorOverride}</Badge>
                            )}
                            {s.brandAnchor?.fontOverride && (
                              <Badge variant="outline" className="text-[10px]">Font: {s.brandAnchor.fontOverride}</Badge>
                            )}
                            {s.musicCue?.energy && (
                              <Badge variant="outline" className="text-[10px]">♪ {s.musicCue.energy}{s.musicCue.marker ? ` · ${s.musicCue.marker}` : ''}</Badge>
                            )}
                            {s.continuityHint && (
                              <Badge variant="outline" className="text-[10px]">Continuity: {s.continuityHint}</Badge>
                            )}
                            {s.negativePromptScene && (
                              <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">--no {s.negativePromptScene.slice(0, 60)}{s.negativePromptScene.length > 60 ? '…' : ''}</Badge>
                            )}
                          </div>
                          {s.brandAnchor?.note && (
                            <div className="text-[11px] italic text-muted-foreground">Brand-Note: {s.brandAnchor.note}</div>
                          )}
                          {s.musicCue?.note && (
                            <div className="text-[11px] italic text-muted-foreground">Music: {s.musicCue.note}</div>
                          )}
                        </div>
                      )}


                      {(s.shotDirector || (s.shotDirector as any)) && (
                        ((s.shotDirector?.framing || s.shotDirector?.angle || s.shotDirector?.movement || s.shotDirector?.lighting ||
                          (s.shotDirector as any)?.framingId || (s.shotDirector as any)?.angleId || (s.shotDirector as any)?.movementId || (s.shotDirector as any)?.lightingId || (s.shotDirector as any)?.stylePresetId) ? (
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Shot Director</Label>
                            <div className="flex flex-wrap gap-1">
                              <CatalogChip axis="framing"      id={(s.shotDirector as any)?.framingId}     raw={s.shotDirector?.framing}     label="Framing" />
                              <CatalogChip axis="angle"        id={(s.shotDirector as any)?.angleId}       raw={s.shotDirector?.angle}       label="Angle" />
                              <CatalogChip axis="movement"     id={(s.shotDirector as any)?.movementId}    raw={s.shotDirector?.movement}    label="Move" />
                              <CatalogChip axis="lighting"     id={(s.shotDirector as any)?.lightingId}    raw={s.shotDirector?.lighting}    label="Licht" />
                              <CatalogChip axis="style_preset" id={(s.shotDirector as any)?.stylePresetId} raw={(s.shotDirector as any)?.stylePreset} label="Style" />
                            </div>
                          </div>
                        ) : null)
                      )}

                      {/* Cast resolver — CastRef: base character + optional outfit (separate dropdowns) */}
                      {(() => {
                        const castSlots = (s.cast ?? []).length > 0 ? (s.cast ?? []) : [emptyCastSlot(s.index)];
                        return (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Cast</Label>
                            {castSlots.length < 4 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[10px] gap-1"
                                onClick={() => {
                                  setPlan((p) => p && {
                                    ...p,
                                    scenes: p.scenes.map((sc) => sc.index === s.index
                                      ? { ...sc, cast: [...(sc.cast ?? []), emptyCastSlot(s.index)] }
                                      : sc),
                                  });
                                }}
                                title="Weiteren Charakter-Slot zu dieser Szene hinzufügen"
                              >
                                <Plus className="h-3 w-3" /> Cast-Slot
                              </Button>
                            )}
                          </div>
                          {castSlots.map((c, i) => {
                            const split = splitCastId(c.characterId);
                            const explicitLookId = c.outfitLookId ?? split.outfitLookId ?? null;
                            const lookHit = explicitLookId ? outfitById.get(explicitLookId) ?? null : null;
                            // Recover base character from outfit when the
                            // resolver only stored an outfitLookId.
                            const baseId = split.baseId ?? lookHit?.baseId ?? null;
                            const outfitId = explicitLookId;
                            const fromCharacter = baseId ? (outfitsByCharacter.get(baseId) ?? []) : [];
                            // Ensure the selected look is always a valid
                            // option in the dropdown — even if the library
                            // hasn't loaded it under this avatar yet.
                            // v178 Wave 2 — prefer DB-backed name over mention label.
                            const stableName = (id: string, fallback?: string, idx?: number) => {
                              const fromLabel = outfitLabelById.get(id);
                              if (fromLabel && fromLabel.trim()) return fromLabel;
                              const cleanFallback = (fallback ?? '').trim();
                              if (cleanFallback && !/^unbenannter look$/i.test(cleanFallback) && !/^standard-look$/i.test(cleanFallback)) {
                                return cleanFallback;
                              }
                              return `Look ${(idx ?? 0) + 1}`;
                            };
                            const merged = fromCharacter.map((o, idx) => ({
                              lookId: o.lookId,
                              name: stableName(o.lookId, o.name, idx),
                            }));
                            if (outfitId && !merged.some((o) => o.lookId === outfitId)) {
                              merged.push({
                                lookId: outfitId,
                                name: stableName(outfitId, lookHit?.name, merged.length),
                              });
                            }
                            const showOutfitPicker = !!baseId && merged.length > 0;
                            return (
                              <div key={`${c.mentionKey}-${i}`} className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-[10px] shrink-0">{c.mentionKey}</Badge>
                                <Select
                                  value={baseId ?? '__none__'}
                                  onValueChange={(v) => updateSceneCastChar(s.index, i, v === '__none__' ? null : v)}
                                >
                                  <SelectTrigger className="h-7 text-xs flex-1 min-w-[140px]">
                                    <SelectValue placeholder="Charakter wählen…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">— nicht zugeordnet —</SelectItem>
                                    {charOptions.map((o) => (
                                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {showOutfitPicker && (
                                  <Select
                                    value={outfitId ?? '__default__'}
                                    onValueChange={(v) => updateSceneCastOutfit(s.index, i, v === '__default__' ? null : v)}
                                  >
                                    <SelectTrigger className="h-7 text-xs min-w-[120px]">
                                      <SelectValue placeholder="Outfit…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__default__">Standard-Look</SelectItem>
                                      {merged.map((o, idx) => (
                                        <SelectItem key={o.lookId} value={o.lookId}>{o.name || `Look ${idx + 1}`}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                                {/*
                                  Preset picker — visible whenever the user
                                  has no library outfit selected for this
                                  slot. Prompt-only fallback so every
                                  character slot always has an outfit
                                  signal, even before the user builds their
                                  wardrobe library.
                                */}
                                {!outfitId && (
                                  <Select
                                    value={(c as any).outfitPreset ?? '__none__'}
                                    onValueChange={(v) => updateSceneCastPreset(s.index, i, v === '__none__' ? null : v)}
                                  >
                                    <SelectTrigger className="h-7 text-xs min-w-[160px]">
                                      <SelectValue placeholder="Standard-Outfit…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">— kein Preset —</SelectItem>
                                      {DEFAULT_OUTFIT_PRESETS.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                          {outfitPresetLabel(p, language)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                                {(c.voiceName || c.voiceId || baseId) && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    🎙 {c.voiceName ?? (c.voiceId ? 'Stimme' : 'Auto-Voice beim Anwenden')}
                                    {((c as any).voiceAutoAssigned || (!c.voiceId && !c.voiceName && baseId)) && (
                                      <span className="ml-1 text-amber-300" title="Stimme automatisch von der KI zugeordnet">⚡ AI</span>
                                    )}
                                  </Badge>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        );
                      })()}


                      {/* Location resolver — always visible so every scene can be manually mapped. */}
                      {(() => {
                        const loc = s.location;
                        const selectedLocation = findLocationOption(loc?.locationId, loc?.locationName ?? loc?.mentionKey);
                        return (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Location</Label>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{loc?.mentionKey ?? 'Location'}</Badge>
                            <Select
                              value={selectedLocation?.id ?? '__none__'}
                              onValueChange={(v) => updateSceneLocation(s.index, v === '__none__' ? null : v)}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Library-Location wählen…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— nicht zugeordnet —</SelectItem>
                                {locOptions.map((o) => (
                                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!selectedLocation && loc?.mentionKey && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[10px] gap-1 whitespace-nowrap"
                                disabled={creatingLoc === s.index}
                                onClick={() => quickCreateLocation(s.index, loc.locationName || loc.mentionKey)}
                                title="Als neue Location in der Library speichern"
                              >
                                {creatingLoc === s.index ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Plus className="h-3 w-3" />
                                )}
                                Anlegen
                              </Button>
                            )}
                          </div>
                          {!selectedLocation && (loc as any)?.description && (
                            <div className="text-[10px] text-muted-foreground italic pl-1 line-clamp-2">
                              Setting: {(loc as any).description}
                            </div>
                          )}
                        </div>
                        );
                      })()}

                      {/* Per-scene quick edits */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Dauer (s)</Label>
                          <Input
                            type="number" min={1} max={60}
                            value={s.durationSec}
                            onChange={(e) => updateScene(s.index, { durationSec: Number(e.target.value) || s.durationSec })}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Engine</Label>
                          <Select
                            value={s.engine}
                            onValueChange={(v) => updateScene(s.index, { engine: v as any })}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {['auto','broll','sync-polish','cinematic-sync','sync-segments','native-dialogue'].map((e) => (
                                <SelectItem key={e} value={e}>{e}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </SectionCard>

              {/* Voice */}
              {plan.voice && (
                <SectionCard title="Voiceover (ElevenLabs)">
                  <Row label="Voice" value={plan.voice.voiceName ?? plan.voice.voiceId} />
                  <Row label="Model" value={plan.voice.model} />
                  <Row label="Stability" value={plan.voice.stability?.toString()} />
                  <Row label="Similarity Boost" value={plan.voice.similarityBoost?.toString()} />
                  <Row label="Style" value={plan.voice.style?.toString()} />
                  <Row label="Speaker Boost" value={plan.voice.speakerBoost?.toString()} />
                  <Row label="Speed" value={plan.voice.speed?.toString()} />
                  <Row label="Request-Stitching" value={plan.voice.requestStitching ? 'an' : 'aus'} />
                </SectionCard>
              )}

              {/* Captions */}
              {plan.captions && (
                <SectionCard title="Captions">
                  <Row label="Font" value={plan.captions.font} />
                  <Row label="Größe" value={plan.captions.sizePx ? `${plan.captions.sizePx}px` : undefined} />
                  <Row label="Farbe" value={plan.captions.color} />
                  <Row label="Highlight" value={plan.captions.highlightColor} />
                  <Row label="Position" value={plan.captions.position} />
                  <Row label="Safe-Zone" value={plan.captions.safeZonePct ? `${plan.captions.safeZonePct}%` : undefined} />
                  <Row label="Burn-In" value={plan.captions.burnIn ? 'an' : 'aus'} />
                  {!!plan.captions.highlightWords?.length && (
                    <Row label="Highlight-Words" value={plan.captions.highlightWords.join(', ')} />
                  )}
                </SectionCard>
              )}

              {/* Negative Prompt */}
              {plan.negativePrompt && (
                <SectionCard title="Negative Prompt">
                  <div className="text-xs text-muted-foreground whitespace-pre-wrap">{plan.negativePrompt}</div>
                </SectionCard>
              )}

              {/* Protection panel */}
              {protectedSceneIds.size > 0 && (
                <div className="rounded-lg border border-amber-300/40 bg-amber-300/[0.06] p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1 font-medium text-amber-300">
                    <Shield className="h-3 w-3" /> {protectedSceneIds.size} bestehende Szene{protectedSceneIds.size === 1 ? '' : 'n'} geschützt
                  </div>
                  <div className="text-muted-foreground">
                    Diese Szenen sind bereits gerendert oder Lip-Sync-aktiv und werden vom Plan nicht überschrieben.
                    Die neuen Plan-Szenen werden dahinter angefügt.
                  </div>
                </div>
              )}

              {/* Unresolved (live) */}
              {liveUnresolved.length > 0 && (
                <div className="rounded-lg border border-amber-400/40 bg-amber-400/5 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {liveUnresolved.length} offene{liveUnresolved.length === 1 ? 'r' : ''} Punkt{liveUnresolved.length === 1 ? '' : 'e'}
                    </div>
                    <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={handleAutoResolve}>
                      Auto-Resolve
                    </Button>
                  </div>
                  <ul className="space-y-1">
                    {liveUnresolved.map((u, i) => (
                      <li key={i} className="text-muted-foreground">
                        <span className="text-amber-300">{u.field}:</span> {u.reason}
                        {u.suggestion && <span className="ml-1 italic">— {u.suggestion}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="h-4" />
            </div>
          </ScrollArea>
          );
        })()}

        {/* Pre-Apply Summary (Briefing Intelligence v2) — sticky above footer */}
        {step === 'review' && safePlan && (
          <div className="shrink-0">
            <BriefingPlanSummary plan={safePlan} />
          </div>
        )}

        <DialogFooter className="gap-2 shrink-0 border-t border-border/40 pt-3">
          {step === 'review' && applyResult && (
            <div className={`mr-auto rounded-lg border px-3 py-2 text-xs ${applyResult.ok ? 'border-emerald-400/40 bg-emerald-400/[0.06] text-emerald-300' : 'border-destructive/40 bg-destructive/[0.06] text-destructive'}`}>
              <div className="font-medium">{applyResult.message}</div>
              {applyResult.warnings.length > 0 && (
                <div className="mt-1 text-muted-foreground">{applyResult.warnings.join(' · ')}</div>
              )}
            </div>
          )}
          {step === 'paste' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button onClick={handleParse} disabled={text.length < 40} className="gap-2">
                <Sparkles className="h-4 w-4" /> Briefing analysieren
              </Button>
            </>
          )}
          {step === 'review' && safePlan && (
            <>
              <Button variant="outline" onClick={() => setStep('paste')}>Zurück</Button>
              <Button
                onClick={handleApply}
                disabled={applying || durationInconsistent}
                className="gap-2"
                title={durationInconsistent ? 'Projekt-Gesamtdauer passt nicht zur Szenensumme.' : undefined}
              >
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Plan anwenden
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/40 p-2.5">
      <div className="font-medium text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value?: string; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
      <span className={highlight ? 'text-amber-300 font-medium' : ''}>{value}</span>
    </div>
  );
}
