/**
 * sceneEngineRouter — Pure, side-effect-free UI *recommendation*.
 *
 * ⚠️  Diese Funktion darf NIEMALS Persistenz, Kosten oder Renders auslösen.
 *     Sie liefert eine Textempfehlung fürs Prompt-UI. Die tatsächliche
 *     Routing-Entscheidung (Cinematic-Sync ja/nein) trifft ausschließlich
 *     `isLipSyncIntentional()` in `lipSyncIntent.ts`.
 *
 * Ohne explizites User-Opt-in (Toggle "Lip-Sync AN", `dialogMode`, oder
 * manueller Engine-Override) empfehlen wir immer B-Roll. Auto-Heuristiken
 * (Dialog + Cast + Provider = Lip-Sync) sind bewusst entfernt — sie waren
 * die Ursache für unbeabsichtigt getriggerten Sync.so.
 */
import type { ComposerScene } from '@/types/video-composer';
import { isLipSyncIntentional } from './lipSyncIntent';

export type SceneEngine = 'sync-polish' | 'cinematic-sync' | 'sync-segments' | 'broll';

export interface EngineRecommendation {
  engine: SceneEngine;
  /** UI label, German default. */
  label: string;
  /** Short tooltip explaining *why* this engine. */
  reason: string;
  /** Estimated extra cost in EUR over the base AI clip cost (sync ≈ 0.05, segments ≈ 0.20+). */
  extraCostEur: number;
}

/** Does this scene contain dialog the user actually wants spoken on-screen? */
export function sceneHasDialog(scene: ComposerScene): boolean {
  const script = (scene.dialogScript ?? '').trim();
  return script.length > 0;
}

/** Does this scene reference at least one Brand-Character (cast)? */
export function sceneHasCast(scene: ComposerScene): boolean {
  if (Array.isArray(scene.characterShots) && scene.characterShots.length > 0) {
    return scene.characterShots.some(
      (cs) => cs && cs.shotType !== 'absent' && (cs.characterId || (cs as any).name),
    );
  }
  if (scene.characterShot && scene.characterShot.shotType !== 'absent') return true;
  return false;
}

/** Approximate HeyGen cost: €0.30 per speaker (capped 1-4). */
export function estimateHeygenCostEur(speakerCount: number): number {
  return Math.max(1, Math.min(4, speakerCount)) * 0.30;
}

/** Count speakers from a dialog script — matches `[NAME]:` or `NAME:` blocks. */
export function countSpeakers(scene: ComposerScene): number {
  const script = (scene.dialogScript ?? '').trim();
  if (!script) return 0;
  const speakers = new Set<string>();
  for (const line of script.split('\n')) {
    const m = line.match(/^\s*\[?([A-Za-zÀ-ÿ][\w\s.'-]{1,40}?)\]?\s*[:：]/);
    if (m) speakers.add(m[1].trim().toLowerCase());
  }
  return speakers.size;
}

/**
 * Action-First detection — June 2026.
 *
 * The Cinematic Pipeline routes scenes with ANY physical action (driving,
 * walking, gesturing, working with props) to `cinematic-sync` so we
 * generate a real Hailuo/Kling action plate first and polish the lip-sync
 * on top. Only truly static "presenter speaks directly to camera" beats
 * still go to HeyGen Photo-Avatar.
 */
const ACTION_KEYWORDS_RE =
  /\b(driv|steer|walk|run|jog|stride|cycl|bik|ride|fly|pilot|sail|swim|climb|jump|dance|fight|cook|build|carry|push|pull|throw|catch|reach|gesture|gestur|point|grab|hold|lift|paint|type|write|hammer|drill|sweep|pour|stir|serve|enter|exit|arrive|leav|approach|turn|spin|lean|crouch|kneel|wave|sport|train|workout|exercise|skat|surf|ski|snowboard|race|chase|hike|wander|explore|present.{0,12}(?:product|item)|interact|examine|inspect|demonstrat|operat)/i;

export function detectMotionIntensity(scene: ComposerScene): 'static' | 'subtle' | 'moderate' | 'high' {
  // Explicit Action-Beat wins.
  const beat = scene.actionBeat?.motionIntensity;
  if (beat) return beat;

  const haystack = [
    scene.actionBeat?.characterAction ?? '',
    scene.actionBeat?.environmentMotion ?? '',
    scene.aiPrompt ?? '',
    (scene as any).promptSlots?.action ?? '',
    (scene as any).promptSlots?.subject ?? '',
  ]
    .join(' ')
    .toLowerCase();

  if (!haystack.trim()) return 'static';
  return ACTION_KEYWORDS_RE.test(haystack) ? 'moderate' : 'static';
}

export function recommendEngineForScene(scene: ComposerScene): EngineRecommendation {
  const override = scene.engineOverride ?? 'auto';
  const hasDialog = sceneHasDialog(scene);
  const hasCast = sceneHasCast(scene);
  const speakers = Math.max(1, countSpeakers(scene));
  const motion = detectMotionIntensity(scene);
  const isStatic = motion === 'static';

  // ── User override wins ─────────────────────────────────────────────
  // Legacy `heygen` override is silently rerouted to Cinematic-Sync
  // (Sync.so segments) — the Composer's HeyGen/Talking-Head portrait path
  // was removed. Standalone Talking-Head module (`/talking-head`) is
  // unaffected.

  if (override === 'broll') {
    return {
      engine: 'broll',
      label: '🎬 B-Roll (manuell)',
      reason: 'Vom Nutzer erzwungen — kein Lip-Sync, klassischer B-Roll-Render.',
      extraCostEur: 0,
    };
  }
  if (override === 'sync-polish') {
    return {
      engine: 'sync-polish',
      label: '✨ Sync.so Polish (manuell)',
      reason: 'Vom Nutzer erzwungen — Hailuo + Sync.so Polish-Pass.',
      extraCostEur: 0.05,
    };
  }
  if (override === 'cinematic-sync' || override === 'sync-segments') {
    return {
      engine: 'sync-segments',
      label: speakers >= 2 ? `⚡ Fast Dialog · ${speakers} Sprecher (1-Call)` : '⚡ Fast Dialog · 1-Call',
      reason:
        'Sync.so Segments API: ein einziger Lipsync-Call über die Action-Plate mit segments[] pro Sprecher-Turn.',
      extraCostEur: Math.max(0.20, 0.083 * Math.max(4, speakers * 2)),
    };
  }

  // ── Auto routing — Action-First (June 2026) ────────────────────────
  if (hasDialog && hasCast) {
    // Composer dialog scenes ALWAYS route to Cinematic-Sync (sync-segments)
    // on a real Hailuo/HappyHorse action plate + Sync.so lip-sync. The
    // static-single-speaker HeyGen shortcut was removed together with the
    // legacy Talking-Head/Portrait Composer path.
    void isStatic;
    return {
      engine: 'sync-segments',
      label: speakers >= 2 ? `🎬 Action + Lip-Sync · ${speakers} Sprecher (Auto)` : '🎬 Action + Lip-Sync (Auto)',
      reason:
        'Action-First: echte Hailuo/HappyHorse-Plate mit physischer Bewegung, Sync.so legt präzisen Lip-Sync drauf — kein starrer Talking-Head-Bust.',
      extraCostEur: Math.max(0.20, 0.083 * Math.max(4, speakers * 2)),
    };
  }


  if (scene.lipSyncWithVoiceover && hasCast) {
    return {
      engine: 'sync-polish',
      label: '✨ Sync.so Polish',
      reason:
        'B-Roll mit Sync.so-Polish-Pass — Qualität auf KI-Gesichtern variiert, nutze HeyGen für sichere Sprecher-Inserts.',
      extraCostEur: 0.05,
    };
  }

  return {
    engine: 'broll',
    label: '🎬 B-Roll',
    reason: 'Off-Screen-Narration — Voiceover läuft über die Szene, keine Lip-Sync nötig.',
    extraCostEur: 0,
  };
}

