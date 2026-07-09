/**
 * useStoryboardTransition
 *
 * Owns the Briefing → Storyboard handoff. When the user navigates to the
 * Storyboard step for the first time on a fresh project, this hook:
 *
 *  1. Decides whether the briefing should be deep-parsed at all (guard).
 *  2. Triggers `briefing-deep-parse` and drives the War Room overlay
 *     with realistic phase + progress signals.
 *  3. Hands the resulting plan to the ProductionPlanSheet for review.
 *
 * Lip-Sync safety: the guard short-circuits as soon as ANY scene exists
 * with rendered/locked/lipsync state. We never re-analyze on top of a
 * touched storyboard, so the pipeline (compose-video-clips,
 * dialog_shots, syncso_*) is never disturbed.
 */

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProductionPlan, PlanScene, type TProductionPlan } from '@/lib/video-composer/briefing/productionPlan';
import { ensureProductionPlanEnsemble } from '@/lib/video-composer/briefing/ensurePlanEnsemble';
import { toast } from '@/hooks/use-toast';
import { extractFunctionsErrorDetails } from '@/lib/functionsError';
import type { ComposerScene, ComposerBriefing } from '@/types/video-composer';

/**
 * Build a deterministic Hook/Reveal/CTA arc so the user is never blocked
 * when the AI gateway is unreachable. Mirrors the server-side safety arc
 * in briefing-deep-parse but additionally **scans the raw briefing text**
 * for explicit `SZENE N` / `DIALOG …: "…"` / `SHOT:` / `KAMERA:` blocks
 * and lifts the user's actual values into the plan so the storyboard
 * isn't reduced to generic placeholders.
 */
type SceneHint = {
  beat?: string;
  dialog?: string;
  shot?: string;
  camera?: string;
  emotion?: string;
  framing?: string;
  movement?: string;
  lighting?: string;
  // Stage-3: plan→storyboard mapping completion
  transition?: 'none' | 'fade' | 'crossfade' | 'wipe' | 'slide' | 'zoom';
  transitionDurationSec?: number;
  overlayText?: string;
  overlayPosition?: 'top' | 'center' | 'bottom';
  tone?: string;
  seed?: number;
};

const FRAMING_TOKENS: Array<[RegExp, string]> = [
  [/extreme[-\s]?close[-\s]?up|ECU/i, 'extreme-close-up'],
  [/close[-\s]?up|\bCU\b/i, 'close-up'],
  [/medium[-\s]?close[-\s]?up|MCU/i, 'medium-close-up'],
  [/medium[-\s]?shot|medium\b/i, 'medium'],
  [/wide[-\s]?shot|extreme[-\s]?wide|establishing|wide\b/i, 'wide'],
  [/over[-\s]?the[-\s]?shoulder|OTS/i, 'over-the-shoulder'],
];
const MOVEMENT_TOKENS: Array<[RegExp, string]> = [
  [/static|statisch/i, 'static'],
  [/push[-\s]?in|dolly[-\s]?in/i, 'slow-push-in'],
  [/pull[-\s]?out|dolly[-\s]?out/i, 'slow-pull-out'],
  [/pan/i, 'pan'],
  [/track(ing)?/i, 'tracking'],
  [/handheld|breathing/i, 'handheld'],
];
const LIGHTING_TOKENS: Array<[RegExp, string]> = [
  [/laptop[-\s]?glow|monitor[-\s]?glow|screen[-\s]?glow/i, 'screen-glow'],
  [/golden[-\s]?hour/i, 'golden-hour'],
  [/window|tageslicht|natural[-\s]?light/i, 'soft-window'],
  [/neon/i, 'neon'],
  [/low[-\s]?key|dunkel|dark/i, 'low-key'],
  [/high[-\s]?key|hell|bright/i, 'high-key'],
];

function classify(text: string | undefined, table: Array<[RegExp, string]>): string | undefined {
  if (!text) return undefined;
  for (const [re, v] of table) if (re.test(text)) return v;
  return undefined;
}

/**
 * Splits the briefing into SZENE-blocks and pulls out DIALOG / SHOT /
 * KAMERA / EMOTION lines per block. Works on both German and English
 * briefings; tolerant of whitespace and ASCII dashes.
 */
function extractSceneHints(briefingText: string): SceneHint[] {
  if (!briefingText) return [];
  // Split on "SZENE N" / "SCENE N" / "SZENE 1 —" markers.
  const parts = briefingText.split(/(?:^|\n)\s*(?:SZENE|SCENE)\s+(\d+)\b/i);
  // parts = [pre, '1', block1, '2', block2, ...]
  const blocks: Array<{ idx: number; body: string }> = [];
  for (let i = 1; i < parts.length; i += 2) {
    const idx = Number(parts[i]);
    const body = String(parts[i + 1] ?? '');
    if (Number.isFinite(idx) && body) blocks.push({ idx, body });
  }
  if (blocks.length === 0) return [];

  // Quoted dialog ("..." or „…" or “…”). First match wins per block.
  const dialogRe = /DIALOG[^"„“]*["„“]([^"„“]+)["“”]/i;
  const shotRe = /SHOT\s*:\s*([^\n]+)/i;
  const camRe = /(?:KAMERA|CAMERA)\s*:\s*([^\n]+)/i;
  const emoRe = /(?:EMOTION|MOOD)\s*:\s*([^\n]+)/i;
  const beatRe = /(?:^|\n)\s*(?:—\s*)?(HOOK|REVEAL|PUNCHLINE|CTA|PROBLEM|PAIN|SOLUTION|LÖSUNG|DEMO|PROOF)\b/i;
  // Stage-3 extractors
  const transitionRe = /(?:TRANSITION|ÜBERGANG|UEBERGANG)\s*:\s*(none|cut|hard\s*cut|fade|crossfade|wipe|slide|zoom)(?:\s*[,·\-]\s*([0-9.]+)\s*s?)?/i;
  const overlayRe = /(?:OVERLAY|TEXT[-\s]?OVERLAY|ON[-\s]?SCREEN[-\s]?TEXT|EINBLENDUNG)\s*:\s*["„“]?([^"\n„“”]+)["“”]?(?:\s*[\(\[]\s*(top|center|middle|bottom)\s*[\)\]])?/i;
  const toneRe = /(?:TONE|TON|STIMMUNG)\s*:\s*([^\n]+)/i;
  const seedRe = /SEED\s*[:=]\s*(\d{1,10})/i;

  return blocks
    .sort((a, b) => a.idx - b.idx)
    .map(({ body }) => {
      const dialog = body.match(dialogRe)?.[1]?.trim();
      const shot = body.match(shotRe)?.[1]?.trim();
      const camera = body.match(camRe)?.[1]?.trim();
      const emotion = body.match(emoRe)?.[1]?.trim();
      const beat = body.match(beatRe)?.[1]?.trim();
      const blob = `${shot ?? ''} ${camera ?? ''}`;

      // Transition
      const tMatch = body.match(transitionRe);
      let transition: SceneHint['transition'];
      let transitionDurationSec: number | undefined;
      if (tMatch) {
        const raw = tMatch[1].toLowerCase().replace(/\s+/g, '');
        transition = raw === 'cut' || raw === 'hardcut' ? 'none'
          : (['none','fade','crossfade','wipe','slide','zoom'].includes(raw) ? (raw as SceneHint['transition']) : undefined);
        const d = Number(tMatch[2]);
        if (Number.isFinite(d) && d >= 0 && d <= 3) transitionDurationSec = d;
      }
      // Overlay
      const oMatch = body.match(overlayRe);
      const overlayText = oMatch?.[1]?.trim();
      const overlayPosRaw = oMatch?.[2]?.toLowerCase();
      const overlayPosition: SceneHint['overlayPosition'] =
        overlayPosRaw === 'top' ? 'top'
        : overlayPosRaw === 'center' || overlayPosRaw === 'middle' ? 'center'
        : overlayPosRaw === 'bottom' ? 'bottom'
        : undefined;
      // Tone & seed
      const tone = body.match(toneRe)?.[1]?.trim().slice(0, 80);
      const seedRaw = body.match(seedRe)?.[1];
      const seed = seedRaw ? Number(seedRaw) : undefined;

      return {
        beat,
        dialog,
        shot,
        camera,
        emotion,
        framing: classify(blob, FRAMING_TOKENS),
        movement: classify(blob, MOVEMENT_TOKENS),
        lighting: classify(`${shot ?? ''} ${body}`, LIGHTING_TOKENS),
        transition,
        transitionDurationSec,
        overlayText,
        overlayPosition,
        tone,
        seed: Number.isFinite(seed) ? seed : undefined,
      } as SceneHint;
    });
}

function buildLocalFallbackPlan(briefing: ComposerBriefing, briefingText: string): TProductionPlan {
  const hints = extractSceneHints(briefingText);
  const total = Number(briefing.duration) || 15;
  const firstMention = briefingText.match(/@[a-z0-9][a-z0-9-_]{1,47}/i)?.[0] ?? null;
  const firstChar = briefing.characters?.[0];
  const selectedCast = (briefing.characters ?? []).slice(0, 4).map((c) => ({
    mentionKey: `@${toMentionSlug(c.name)}`,
    characterId: c.brandCharacterId ?? null,
    characterName: c.name,
    voiceId: null,
  }));
  const cast = selectedCast.length > 0
    ? selectedCast
    : firstMention
    ? [{
        mentionKey: firstMention,
        characterId: firstChar?.brandCharacterId ?? null,
        characterName: firstChar?.name ?? firstMention.replace(/^@/, ''),
        voiceId: null,
      }]
    : [];

  const defaultBeats: Array<{ beat: string; framing: string; movement: string; energy: 'low' | 'mid' | 'high' }> = [
    { beat: 'Hook',   framing: 'medium-close-up', movement: 'slow-push-in', energy: 'high' },
    { beat: 'Reveal', framing: 'wide',            movement: 'tracking',     energy: 'mid'  },
    { beat: 'CTA',    framing: 'medium',          movement: 'static',       energy: 'high' },
  ];

  const sceneCount = Math.max(hints.length, defaultBeats.length);
  const per = Math.max(3, Math.min(12, Math.round(total / sceneCount)));

  const hasDialogAnywhere = hints.some((h) => !!h.dialog);

  const scenes = Array.from({ length: sceneCount }).map((_, i) => {
    const h = hints[i];
    const fallback = defaultBeats[i] ?? defaultBeats[defaultBeats.length - 1];
    const beatLabel = h?.beat ?? fallback.beat;
    const framing = h?.framing ?? fallback.framing;
    const movement = h?.movement ?? fallback.movement;
    const lighting = h?.lighting ?? 'soft-window';
    const anchor = h?.shot
      ? h.shot
      : `${beatLabel} beat for ${briefing.productName ?? 'the brand'}: cinematic ${framing} shot, ${movement}, ${lighting} lighting.`;
    const voiceover = h?.dialog ? { text: h.dialog } : undefined;
    const isRequiredEnsemble = cast.length >= 2 && (i === 0 || (sceneCount >= 6 && i === sceneCount - 1));
    const sceneCast = isRequiredEnsemble ? cast : cast.slice(0, 1);
    return {
      index: i + 1,
      label: beatLabel,
      beat: beatLabel,
      durationSec: per,
      engine: (firstMention && (h?.dialog || !hasDialogAnywhere)) ? 'cinematic-sync' as const : 'broll' as const,
      lipSync: !!(firstMention && h?.dialog),
      cast: sceneCast,
      shotDirector: {
        framing,
        angle: 'eye-level',
        movement,
        lighting,
      },
      anchorPromptEN: anchor,
      voiceover,
      performance: {
        mimik: h?.emotion ?? (beatLabel.toLowerCase().includes('hook') ? 'confident' : beatLabel.toLowerCase().includes('cta') ? 'warm-smile' : 'curious'),
        gestik: beatLabel.toLowerCase().includes('cta') ? 'open-palms' : 'still',
        blick: (h?.dialog || beatLabel.toLowerCase().includes('cta')) ? 'to-camera' : 'away',
        energy: fallback.energy === 'high' ? 4 : 3,
      },
      musicCue: { energy: fallback.energy },
      // Stage-3: surface extracted plan→storyboard fields when present.
      transition: h?.transition
        ? { type: h.transition, durationSec: h.transitionDurationSec ?? 0.4 }
        : undefined,
      textOverlay: h?.overlayText
        ? { text: h.overlayText, position: h.overlayPosition ?? 'bottom', animation: 'fade-in' }
        : undefined,
      tone: h?.tone,
      seed: typeof h?.seed === 'number' ? h.seed : undefined,
    };
  });

  return ensureProductionPlanEnsemble(ProductionPlan.parse({
    project: {
      name: briefing.productName,
      aspectRatio: briefing.aspectRatio as any,
      totalDurationSec: per * sceneCount,
    },
    scenes,
    unresolved: [{
      field: 'auto-director',
      reason: hints.length
        ? `Auto-Analyse offline — ${hints.length} Szene(n) wurden direkt aus deinem Briefing-Text extrahiert. Vor Render prüfen.`
        : 'AI-Director offline — deterministischer Plan erstellt. Bitte vor dem Rendern prüfen.',
      severity: 'warn',
    }],
    _meta: { source: 'local-fallback' },
  }), briefing);
}

type Phase = 'idle' | 'A' | 'B' | 'done';

interface Args {
  briefing: ComposerBriefing;
  projectId: string | undefined;
  scenes: ComposerScene[];
  /** Project language (de/en/es/…) — forwarded to deep-parse for LANGUAGE LOCK. */
  language: string;
  /** Ensures a draft project has a real DB UUID before deep-parse/plan persistence. */
  ensureProjectId?: () => Promise<string>;
  /** Navigation hook: switches the dashboard tab to 'storyboard'. */
  navigateToStoryboard: () => void;
}

const isUuid = (val?: string | null) =>
  !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

/**
 * Returns true when a scene is "off-limits" for plan replacement.
 * Mirrors the guard in `useApplyProductionPlan` so we keep behaviour
 * consistent between the entry guard and the apply guard.
 */
function isProtected(s: ComposerScene): boolean {
  if (s.clipUrl) return true;
  // Failed/canceled scenes without a render are repairable fallback rows and
  // MUST be replaceable by a later full Briefing plan. Protect only real output
  // or in-flight state.
  if (s.clipStatus === 'generating' || s.clipStatus === 'ready') return true;
  const a = s as any;
  if (a.lipSyncStatus) return true;
  if (a.dialogLockedAt) return true;
  if (a.lockReferenceUrl) return true;
  return false;
}

function isRepairableFailedScene(s: ComposerScene): boolean {
  const status = String(s.clipStatus ?? '');
  return (status === 'failed' || status === 'canceled') && !isProtected(s);
}

/** Slugify a character name into a stable @-mention key. */
function toMentionSlug(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'cast';
}

/**
 * Detect whether the user's briefing already carries an explicit script
 * (speaker lines like `NAME:` or scene markers `SZENE N` / `SCENE N`).
 * In that case we switch the parser into LITERAL mode so it does NOT
 * redistribute dialogue or invent new speakers.
 */
export function detectBriefingFidelity(b: ComposerBriefing): {
  mode: 'literal' | 'auto';
  hasSceneMarkers: boolean;
  hasSpeakerLines: boolean;
  speakerLabels: string[];
} {
  const src = String(b.productDescription ?? '');
  const hasSceneMarkers = /(?:^|\n)\s*(?:szene|scene|shot)\s*\d+\b/i.test(src);
  // NAME: text  — 2+ letters, uppercase-first token, followed by a colon and text.
  const speakerRe = /(?:^|\n)\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-\.\s]{1,40}?)\s*[:—-]\s+\S/g;
  const labels = new Set<string>();
  for (const m of src.matchAll(speakerRe)) {
    const raw = (m[1] ?? '').trim();
    // Filter obvious non-speaker prefixes (Section titles etc.)
    if (/^(szene|scene|shot|hook|reveal|cta|pain|proof|beat|kamera|shot|framing|mood|note|tone|dialog|dialogue|voiceover|vo|inhalt|briefing|thema|target|zielgruppe|projekt|project)$/i.test(raw)) continue;
    if (raw.length < 2 || raw.length > 40) continue;
    labels.add(raw);
  }
  const speakerLabels = Array.from(labels);
  const hasSpeakerLines = speakerLabels.length > 0;
  const mode: 'literal' | 'auto' = (hasSceneMarkers || hasSpeakerLines) ? 'literal' : 'auto';
  return { mode, hasSceneMarkers, hasSpeakerLines, speakerLabels };
}

/**
 * Builds the freeform briefing blob the deep-parser expects.
 * In AUTO-DIRECTOR mode (default), the parser is allowed to synthesize a
 * full screenplay from the structured briefing + selected cast.
 * In LITERAL mode (script detected), the parser MUST reproduce the script
 * verbatim — no speaker reassignment, no dialog rewriting.
 */
function buildBriefingText(b: ComposerBriefing): string {
  const lines: string[] = [];
  const fidelity = detectBriefingFidelity(b);

  if (fidelity.mode === 'literal') {
    lines.push('Mode: LITERAL (reproduce the ## Verbatim Script 1:1 — do NOT reassign speakers, do NOT rewrite dialog, do NOT invent scenes)');
  } else {
    lines.push('Mode: AUTO-DIRECTOR (synthesize full screenplay from briefing + cast)');
  }
  lines.push('');
  if (b.productName) lines.push(`# ${b.productName}`);
  if (b.productDescription) lines.push('', b.productDescription);
  if (b.usps?.length) {
    lines.push('', '## USPs / Key Messages');
    for (const u of b.usps) lines.push(`- ${u}`);
  }
  if (b.targetAudience) lines.push('', `## Target Audience`, b.targetAudience);

  // Cast — the heart of AUTO-DIRECTOR. Each entry becomes an addressable
  // mention key the parser can place into scenes.
  if (b.characters && b.characters.length) {
    lines.push('', '## Cast (selected in briefing)');
    for (const c of b.characters) {
      const slug = toMentionSlug(c.name);
      const libSuffix = c.brandCharacterId ? `  (library:${c.brandCharacterId})` : '';
      lines.push(`- @${slug} — **${c.name}**${libSuffix}`);
      if (c.appearance) lines.push(`  · Appearance: ${c.appearance}`);
      if (c.signatureItems) lines.push(`  · Signature items: ${c.signatureItems}`);
      if (c.appearanceFrequency) lines.push(`  · Frequency: ${c.appearanceFrequency}`);
    }
  }

  // LITERAL-mode helpers: give the parser a stable Speaker-Map from
  // detected script labels → @-mentions of briefed cast (best fuzzy match by
  // name prefix). Also duplicate the raw script into a dedicated block so
  // the server can extract it back out and enforce fidelity server-side.
  if (fidelity.mode === 'literal') {
    if (fidelity.speakerLabels.length && b.characters?.length) {
      const norm = (s: string) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
      const manualMap = b.speakerMap ?? {};
      lines.push('', '## Speaker Map (script label → @mention)');
      for (const label of fidelity.speakerLabels) {
        // Manual override wins — the user explicitly picked this mapping in
        // the ScriptSpeakerMapper UI. Fall back to fuzzy name match otherwise.
        const manualId = manualMap[label];
        const manualHit = manualId ? b.characters.find((c) => c.id === manualId) : null;
        const hit = manualHit ?? b.characters.find((c) => {
          const n = norm(label);
          const cn = norm(c.name);
          return cn && n && (cn.startsWith(n) || n.startsWith(cn) || cn.includes(n) || n.includes(cn));
        });
        if (hit) {
          const tag = manualHit ? ' [manual]' : '';
          lines.push(`- ${label} → @${toMentionSlug(hit.name)}${tag}`);
        } else {
          lines.push(`- ${label} → (unmapped — assign to the closest briefed cast member by role/context)`);
        }
      }
    }
    if (b.productDescription) {
      lines.push('', '## Verbatim Script', '```', b.productDescription.trim(), '```');
    }
  }

  lines.push('', '## Project');
  if (b.tone) lines.push(`- Tone: ${b.tone}`);
  if (b.duration) lines.push(`- Total duration: ${b.duration}s`);
  if (b.aspectRatio) lines.push(`- Aspect: ${b.aspectRatio}`);
  if (b.videoMode) lines.push(`- Video mode: ${b.videoMode}`);
  if (b.visualStyle) lines.push(`- Visual style: ${b.visualStyle}`);
  if (b.brandColors?.length) lines.push(`- Brand colors: ${b.brandColors.join(', ')}`);
  if (b.defaultQuality) lines.push(`- Default quality: ${b.defaultQuality}`);
  if (b.preferStock) lines.push(`- Prefer stock footage when appropriate`);

  return lines.join('\n').trim();
}

export interface StoryboardTransitionState {
  warRoomOpen: boolean;
  phase: Phase;
  progress: number;
  phaseLabel: string;
  planSheetOpen: boolean;
  initialPlan: TProductionPlan | null;
  activeProjectId: string | null;
}

export function useStoryboardTransition({
  briefing, projectId, scenes, language, ensureProjectId, navigateToStoryboard,
}: Args) {
  const [state, setState] = useState<StoryboardTransitionState>({
    warRoomOpen: false,
    phase: 'idle',
    progress: 0,
    phaseLabel: '',
    planSheetOpen: false,
    initialPlan: null,
    activeProjectId: null,
  });

  const cancelledRef = useRef(false);
  const progressTimerRef = useRef<number | null>(null);

  const stopProgress = () => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  /** Drives a pseudo-progress curve while the edge function runs. */
  const startProgressLoop = () => {
    stopProgress();
    progressTimerRef.current = window.setInterval(() => {
      setState((s) => {
        // Cap at 70% until the real response lands.
        const next = Math.min(s.progress + (s.progress < 50 ? 1.1 : 0.35), 70);
        const phase: Phase = next < 60 ? 'A' : 'B';
        // Briefing-Intelligence v2 — 4 inhaltliche Schritte:
        //   0–20%  Briefing-Modus erkennen (Storytelling/Brand/Produkt/…)
        //   20–45% Research & Wissens-Anreicherung (KI füllt Lücken)
        //   45–65% Strukturextraktion (Szenen, VO, Cast)
        //   65–95% Cast & Locations gegen deine Library auflösen
        const phaseLabel =
          next < 20
            ? 'Schritt 1/4 · Briefing-Modus erkennen'
            : next < 45
              ? 'Schritt 2/4 · Research & Wissens-Anreicherung (KI füllt Lücken)'
              : next < 65
                ? 'Schritt 3/4 · Strukturextraktion (Szenen, VO, Cast)'
                : 'Schritt 4/4 · Cast & Locations gegen Library auflösen';
        return { ...s, progress: next, phase, phaseLabel };
      });
    }, 700);
  };

  const close = useCallback(() => {
    cancelledRef.current = true;
    stopProgress();
    setState({
      warRoomOpen: false,
      phase: 'idle',
      progress: 0,
      phaseLabel: '',
      planSheetOpen: false,
      initialPlan: null,
      activeProjectId: null,
    });
  }, []);

  /**
   * Decide + run. Returns true when the caller should NOT navigate itself
   * (we'll handle navigation after the plan is applied). Returns false
   * when the caller should fall through with normal tab navigation.
   */
  const attempt = useCallback(async (): Promise<{ handled: boolean }> => {
    // GUARD 1 — protected scenes exist: never re-analyse.
    if (scenes.some(isProtected)) {
      return { handled: false };
    }
    // GUARD 2 — already has user-created scenes: skip auto-analyse. Exception:
    // failed/canceled fallback rows are repairable and should be replaced by the
    // full plan instead of trapping the user in stale placeholders.
    if (scenes.length > 0 && !scenes.every(isRepairableFailedScene)) {
      return { handled: false };
    }
    // GUARD 3 — empty briefing: nothing to analyse.
    const text = buildBriefingText(briefing);
    if (text.length < 40) {
      return { handled: false };
    }

    let activeProjectId = projectId;
    if (!isUuid(activeProjectId)) {
      if (!ensureProjectId) {
        toast({
          title: 'Projekt noch nicht gespeichert',
          description: 'Bitte kurz speichern und erneut versuchen.',
          variant: 'destructive',
        });
        return { handled: true };
      }
      try {
        activeProjectId = await ensureProjectId();
      } catch (err: any) {
        toast({
          title: 'Projekt konnte nicht vorbereitet werden',
          description: err?.message ?? String(err),
          variant: 'destructive',
        });
        return { handled: true };
      }
      if (!isUuid(activeProjectId)) {
        toast({
          title: 'Projekt-ID fehlt',
          description: 'Die Analyse wurde gestoppt, damit kein unverbundener Plan entsteht.',
          variant: 'destructive',
        });
        return { handled: true };
      }
    }

    cancelledRef.current = false;
    setState({
      warRoomOpen: true,
      phase: 'A',
      progress: 2,
      phaseLabel: 'Schritt 1/4 · Briefing-Modus erkennen …',
      planSheetOpen: false,
      initialPlan: null,
      activeProjectId,
    });
    startProgressLoop();

    // Direct fetch with 120s AbortController. Backend now uses a Flash-first
    // chain (Flash 35s ×2 → Pro 60s → Flash-Lite 25s) that typically returns
    // in 8-25s; 120s is the worst-case ceiling with all fallbacks burning.
    // `supabase.functions.invoke` imposes a ~30s timeout that kicks in before
    // deep-parse can finish, so we use raw fetch.
    const CLIENT_TIMEOUT_MS = 120_000;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/briefing-deep-parse`;
    const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token ?? anon;

    const doFetch = async (): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
      try {
        return await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'apikey': anon,
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ briefing: text, projectId: activeProjectId, language }),
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
    };


    const parsePlan = (data: any): { plan: TProductionPlan | null; dropped: number; error?: string } => {
      let dropped = 0;
      const parsed = ProductionPlan.safeParse(data?.plan);
      if (parsed.success) return { plan: ensureProductionPlanEnsemble(parsed.data, briefing), dropped };
      console.error('[useStoryboardTransition] plan validation failed', parsed.error.flatten());
      const rawScenes: any[] = Array.isArray(data?.plan?.scenes) ? data.plan.scenes : [];
      const survivors: any[] = [];
      for (const s of rawScenes) {
        const sp = PlanScene.safeParse(s);
        if (sp.success) survivors.push(sp.data); else dropped += 1;
      }
      if (survivors.length > 0) {
        const retry = ProductionPlan.safeParse({ ...(data?.plan ?? {}), scenes: survivors });
        if (retry.success) return { plan: ensureProductionPlanEnsemble(retry.data, briefing), dropped };
      }
      const issues = parsed.error.issues.slice(0, 2)
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`).join(' · ');
      return { plan: null, dropped, error: `Plan-Validierung fehlgeschlagen — ${issues || 'unbekannter Fehler'}` };
    };

    try {
      // First attempt; on transient 502/503/504, retry once after 2s before
      // surfacing any error — backend chain has its own retries but a fresh
      // edge-runtime cold start can still kick a 503.
      let res = await doFetch();
      if (!res.ok && (res.status === 502 || res.status === 503 || res.status === 504)) {
        console.warn(`[useStoryboardTransition] deep-parse ${res.status} — 1× client retry after 2s`);
        try { await res.text(); } catch { /* drain */ }
        await new Promise((r) => setTimeout(r, 2000));
        if (cancelledRef.current) return { handled: true };
        res = await doFetch();
      }
      stopProgress();
      if (cancelledRef.current) return { handled: true };

      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        const err: any = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        err.body = bodyText;
        throw err;
      }
      const data = await res.json();
      const { plan, dropped, error: validationErr } = parsePlan(data);
      if (!plan) throw new Error(validationErr || 'Plan-Validierung fehlgeschlagen');

      // T-1 — attach the response envelope onto plan._meta.debug so the
      // ProductionPlanSheet can surface parser diagnostics behind ?debug=1
      // without a second round-trip.
      try {
        (plan as any)._meta = {
          ...((plan as any)._meta ?? {}),
          debug: {
            passA_model: data?.passA_model ?? null,
            passB_model: data?.passB_model ?? null,
            passA_error: data?.passA_error ?? null,
            passB_error: data?.passB_error ?? null,
            passA_diagnostics: data?.passA_diagnostics ?? [],
            passB_diagnostics: data?.passB_diagnostics ?? [],
            timings: data?.timings ?? null,
            ensemble_repair: data?.ensemble_repair ?? null,
            strict_cast: data?.strict_cast ?? null,
            fidelity: data?.fidelity ?? null,
            version: data?.version ?? null,
          },
        };
      } catch { /* non-fatal — debug chip just stays hidden */ }

      if (dropped > 0) {
        toast({
          title: 'Plan teilweise übernommen',
          description: `${dropped} Szene(n) konnten nicht validiert werden und wurden übersprungen.`,
        });
      }

      // Smoothly drive the bar to 100% before swapping to the plan sheet.
      setState((s) => ({ ...s, progress: 100, phase: 'done', phaseLabel: 'Plan bereit' }));
      await new Promise((r) => setTimeout(r, 650));

      setState({
        warRoomOpen: false,
        phase: 'idle',
        progress: 0,
        phaseLabel: '',
        planSheetOpen: true,
        initialPlan: plan,
        activeProjectId,
      });
      return { handled: true };
    } catch (e: any) {
      stopProgress();
      if (cancelledRef.current) return { handled: true };

      const isAbort = e?.name === 'AbortError';
      const status: number | undefined = e?.status;
      const msg: string = isAbort ? `Timeout nach ${Math.round(CLIENT_TIMEOUT_MS / 1000)}s` : (e?.message || 'Deep-Parse fehlgeschlagen');
      console.error('[useStoryboardTransition] deep-parse failed', { status, msg, body: e?.body, isAbort });


      // Hard blocks (credits / rate-limit / payload): keep classic toast + navigate.
      if (status === 402 || status === 429 || status === 413) {
        toast({
          title: 'Briefing-Analyse fehlgeschlagen',
          description: status === 402 ? 'Keine AI-Credits mehr — bitte aufladen.'
            : status === 429 ? 'Zu viele Anfragen — bitte kurz warten und erneut versuchen.'
            : 'Briefing zu lang — bitte kürzen.',
          variant: 'destructive',
        });
        setState((s) => ({ ...s, warRoomOpen: false, phase: 'idle', progress: 0 }));
        navigateToStoryboard();
        return { handled: true };
      }

      // Soft fail: build a local fallback plan so the user is never stuck.
      try {
        const fallback = buildLocalFallbackPlan(briefing, text);
        const reason = isAbort
          ? 'Timeout (>180s)'
          : status ? (status === 504 ? `Timeout (${status})` : `Status ${status}`)
          : 'Netzwerkfehler';
        toast({
          title: 'Auto-Analyse dauert länger als erwartet',
          description: `${reason} — Basis-Plan eingeblendet. Wir versuchen den vollen Plan im Hintergrund nachzuladen.`,
        });
        setState({
          warRoomOpen: false,
          phase: 'idle',
          progress: 0,
          phaseLabel: '',
          planSheetOpen: true,
          initialPlan: fallback,
          activeProjectId,
        });

        // LATE-ARRIVAL: if the timeout fired but the function is still
        // running on the backend, retry once without a timeout and swap
        // the fallback plan when the real one arrives — but only while
        // the user is still viewing the (untouched) fallback sheet.
        // Also retry on 502/503/504 — the function is often still running.
        if (isAbort || status === 504 || status === 502 || status === 503) {
          (async () => {
            try {
              const lateRes = await fetch(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': anon,
                  'Authorization': `Bearer ${authToken}`,
                },
                  body: JSON.stringify({ briefing: text, projectId: activeProjectId, language }),
              });
              if (!lateRes.ok) return;
              const lateData = await lateRes.json();
              const { plan: latePlan } = parsePlan(lateData);
              if (!latePlan) return;
              setState((s) => {
                // v176: even if the user already closed the sheet (e.g. clicked
                // "Plan anwenden" against the fallback), reopen it with the
                // real plan so they can re-apply. The apply-hook's protection
                // filter (clip_status='pending' && clip_url IS NULL &&
                // !lipSyncStatus && !dialogLockedAt) ensures we never overwrite
                // rendered or locked scenes.
                const sheetWasClosed = !s.planSheetOpen;
                toast({
                  title: sheetWasClosed
                    ? '✨ Vollständiger Plan nachgeladen — bitte erneut anwenden'
                    : '✨ Vollständiger Plan nachgeladen',
                  description: sheetWasClosed
                    ? 'Dein Briefing wurde im Hintergrund analysiert. Klicke „Plan anwenden", um Fallback-Szenen zu ersetzen.'
                    : 'Der AI-generierte Plan ist jetzt verfügbar.',
                });
                return { ...s, planSheetOpen: true, initialPlan: latePlan, activeProjectId };
              });
            } catch (lateErr) {
              console.warn('[useStoryboardTransition] late-arrival failed', lateErr);
            }
          })();
        }
      } catch (fallbackErr: any) {
        console.error('[useStoryboardTransition] local fallback failed', fallbackErr);
        toast({
          title: 'Briefing-Analyse fehlgeschlagen',
          description: status ? `${status}: ${msg}` : msg,
          variant: 'destructive',
        });
        setState((s) => ({ ...s, warRoomOpen: false, phase: 'idle', progress: 0 }));
        navigateToStoryboard();
      }
      return { handled: true };
    }
  }, [briefing, projectId, scenes, language, ensureProjectId, navigateToStoryboard]);

  const setPlanSheetOpen = useCallback((open: boolean) => {
    setState((s) => ({ ...s, planSheetOpen: open, initialPlan: open ? s.initialPlan : null }));
  }, []);

  return {
    state,
    attempt,
    close,
    setPlanSheetOpen,
  };
}
