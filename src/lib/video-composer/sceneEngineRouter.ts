import { tx } from "@/lib/i18nText";
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
      label: tx({ de: '🎬 B-Roll (manuell)', en: '🎬 B-roll (manual)', es: '🎬 B-roll (manual)' }),
      reason: tx({ de: 'Vom Nutzer erzwungen — kein Lip-Sync, klassischer B-Roll-Render.', en: 'Enforced by user — no lip sync, classic B-roll render.', es: 'Forzado por el usuario: sin sincronización labial, renderizado B-roll clásico.' }),
      extraCostEur: 0,
    };
  }
  if (override === 'sync-polish') {
    return {
      engine: 'sync-polish',
      label: tx({ de: '✨ Sync.so Polish (manuell)', en: '✨ Sync.so Polish (manual)', es: '✨ Sync.so Polish (manual)' }),
      reason: tx({ de: 'Vom Nutzer erzwungen — Hailuo + Sync.so Polish-Pass.', en: 'Enforced by user — Hailuo + Sync.so Polish pass.', es: 'Forzado por el usuario — pase de pulido de Hailuo + Sync.so.' }),
      extraCostEur: 0.05,
    };
  }
  if (override === 'cinematic-sync' || override === 'sync-segments') {
    return {
      engine: 'sync-segments',
      label: speakers >= 2 ? tx({ de: `⚡ Fast Dialog · ${speakers} Sprecher (1-Call)`, en: `⚡ Fast Dialog · ${speakers} speakers (1-call)`, es: `⚡ Diálogo rápido · ${speakers} oradores (1 llamada)` }) : tx({ de: '⚡ Fast Dialog · 1-Call', en: '⚡ Fast Dialog · 1-call', es: '⚡ Diálogo rápido · 1 llamada' }),
      reason:
        tx({ de: 'Sync.so Segments API: ein einziger Lipsync-Call über die Action-Plate mit segments[] pro Sprecher-Turn.', en: 'Sync.so Segments API: a single Lipsync call via the Action-Plate with segments[] per speaker turn.', es: 'API de segmentos de Sync.so: una sola llamada de Lipsync a través de la Action-Plate con segments[] por turno de orador.' }),
      extraCostEur: Math.max(0.20, 0.083 * Math.max(4, speakers * 2)),
    };
  }

  // ── Auto routing — Opt-in only (June 2026 clean rewrite) ───────────
  // Kein impliziter Sync.so-Trigger mehr. Nur wenn der User explizit
  // opt-in gemacht hat (Toggle / dialogMode / expliziter Override),
  // schlagen wir eine Lip-Sync-Engine vor. Sonst immer B-Roll.
  if (isLipSyncIntentional(scene) && hasCast) {
    if (speakers >= 2) {
      return {
        engine: 'sync-segments',
        label: tx({ de: `🎬 Action + Lip-Sync · ${speakers} Sprecher`, en: `🎬 Action + lip sync · ${speakers} speakers`, es: `🎬 Acción + sincronización labial · ${speakers} oradores` }),
        reason:
          tx({ de: 'Sync.so Segments API auf einer Hailuo/HappyHorse-Action-Plate — ein Lipsync-Call mit segments[] pro Sprecher-Turn.', en: 'Sync.so Segments API on a Hailuo/HappyHorse Action-Plate — a Lipsync call with segments[] per speaker turn.', es: 'API de segmentos de Sync.so en una Action-Plate de Hailuo/HappyHorse — una llamada de Lipsync con segments[] por turno de orador.' }),
        extraCostEur: Math.max(0.20, 0.083 * Math.max(4, speakers * 2)),
      };
    }
    return {
      engine: 'sync-polish',
      label: tx({ de: '✨ Sync.so Polish', en: '✨ Sync.so Polish', es: '✨ Sync.so Polish' }),
      reason:
        tx({ de: 'Hailuo/HappyHorse-Plate mit Sync.so Polish-Pass — echte Mundbewegung auf KI-Gesicht.', en: 'Hailuo/HappyHorse Plate with Sync.so Polish Pass — real mouth movement on AI face.', es: 'Hailuo/HappyHorse Plate con Sync.so Polish Pass: movimiento real de la boca en la cara de la IA.' }),
      extraCostEur: 0.05,
    };
  }

  void isStatic;
  return {
    engine: 'broll',
    label: tx({ de: '🎬 B-Roll', en: '🎬 B-roll', es: '🎬 B-roll' }),
    reason:
      hasDialog && hasCast
        ? tx({ de: 'Off-Screen-Narration — aktiviere den Lip-Sync-Toggle für echte Mundbewegung.', en: 'Off-screen narration — activate the lip sync toggle for real mouth movement.', es: 'Narración fuera de pantalla: activa la sincronización de labios para un movimiento real de la boca.' })
        : tx({ de: 'Off-Screen-Narration — Voiceover läuft über die Szene, keine Lip-Sync nötig.', en: 'Off-Screen Narration — Voiceover plays over the scene, no Lip-Sync needed.', es: 'Narración fuera de pantalla — La voz en off se reproduce sobre la escena, no se necesita sincronización labial.' }),
    extraCostEur: 0,
  };
}

