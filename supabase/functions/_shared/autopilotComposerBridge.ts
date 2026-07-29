/**
 * autopilotComposerBridge
 * =============================================================================
 * Der Autopilot bekommt den gehärteten Lip-Sync des Video Composers / Motion
 * Studio — ohne eine zweite Pipeline und **ohne eine einzige Zeile** in
 * `compose-dialog-segments`, `compose-twoshot-audio`, `sync-so-webhook` oder
 * den geteilten `_shared`-Lip-Sync-Modulen zu ändern.
 *
 * Die Composer-Strecke ist tabellengebunden: sie liest und schreibt
 * `composer_scenes` und wird mit `{ scene_id }` angestoßen. Genau diese
 * bestehende Eintrittstür nutzt der Autopilot. Pro Produktion entsteht eine
 * versteckte Arbeitsmappe (`composer_projects.origin = 'autopilot'`), pro
 * Dialogszene eine Szenenzeile. Danach läuft alles, was das Motion Studio
 * heute stabil macht, automatisch mit:
 *
 *   Preclip-Isolation (kein Ghost-Mouthing bei 3–4 Sprechern) · Codec-Preflight
 *   · Face-Gate · Voiced-Windows · Slot-Routing · Retry-Matrix ·
 *   Circuit-Breaker · Audio-Mux · lipsync-watchdog
 *
 * Abrechnung:
 *   Der Composer bucht Credits gegen `wallets`, der Autopilot Euro gegen
 *   `ai_video_wallets`. Statt einen Bypass in den Composer zu bauen, gleicht
 *   die Brücke das aus: sie schreibt dem Kunden exakt die Credits gut, die der
 *   Composer gleich abbucht (net-neutral), und verrechnet den echten Betrag
 *   über die Autopilot-Stufe. Scheitert der Lauf, wird die Gutschrift wieder
 *   eingezogen und die Autopilot-Stufe erstattet.
 */

import type { AutopilotTurn } from "./autopilotLipSync.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Muss `computeCost` in compose-dialog-segments spiegeln (16 Cr/s, min 16). */
const LIPSYNC_CREDITS_PER_SEC = 16;
const LIPSYNC_MIN_CREDITS = 16;
/** Media-Credits: 100 Credits = 1,00 €. */
const CREDITS_PER_EURO = 100;

export function composerLipsyncCredits(durationSec: number, speakerCount: number): number {
  const perPass = Math.max(LIPSYNC_MIN_CREDITS, Math.ceil(Math.max(0, durationSec)) * LIPSYNC_CREDITS_PER_SEC);
  return perPass * Math.max(1, speakerCount);
}

export function creditsToEuros(credits: number): number {
  return Math.round((credits / CREDITS_PER_EURO) * 100) / 100;
}

function fnUrl(name: string): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`;
}

function serviceKey(): string {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

async function callFn(name: string, body: Record<string, unknown>): Promise<{
  status: number;
  json: Record<string, unknown>;
}> {
  const resp = await fetch(fnUrl(name), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey()}`,
    },
    body: JSON.stringify(body),
  });
  let parsed: Record<string, unknown> = {};
  try {
    parsed = (await resp.json()) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  return { status: resp.status, json: parsed };
}

// ───────────────────────────────────────────── Shadow-Arbeitsmappe & Szene

/**
 * Legt die versteckte Composer-Arbeitsmappe der Produktion an (einmalig) und
 * gibt ihre Id zurück. `origin='autopilot'` hält sie aus der Projektliste.
 */
export async function ensureShadowProject(admin: Admin, args: {
  productionId: string;
  userId: string;
  title?: string | null;
  language?: string | null;
}): Promise<string | null> {
  const { data: prod } = await admin
    .from("autopilot_productions")
    .select("composer_project_id, brief")
    .eq("id", args.productionId)
    .maybeSingle();

  const existing = prod?.composer_project_id as string | undefined;
  if (existing) return existing;

  const { data: created, error } = await admin
    .from("composer_projects")
    .insert({
      user_id: args.userId,
      title: `Autopilot — ${(args.title ?? prod?.brief ?? "Produktion").toString().trim()}`.slice(0, 120),
      origin: "autopilot",
      language: args.language ?? "de",
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    console.error("[autopilotComposerBridge] shadow project insert failed", error?.message);
    return null;
  }

  await admin
    .from("autopilot_productions")
    .update({ composer_project_id: created.id, updated_at: new Date().toISOString() })
    .eq("id", args.productionId);

  return created.id as string;
}

export interface BridgeSceneArgs {
  projectId: string;
  productionId: string;
  sceneIndex: number;
  clipUrl: string;
  anchorUrl?: string | null;
  durationSeconds: number;
  turns: AutopilotTurn[];
  language: string;
}

/**
 * Schreibt (oder aktualisiert) die Composer-Szenenzeile für eine Autopilot-
 * Dialogszene. Kanonische Charakter-IDs wandern unverändert in `dialog_turns`
 * — kein Name-Matching, keine Übersetzungsschicht.
 */
export async function upsertBridgeScene(admin: Admin, args: BridgeSceneArgs): Promise<string | null> {
  const speakers = Array.from(
    new Set(args.turns.map((t) => t.speakerCharacterId).filter((id): id is string => !!id)),
  );

  const dialogTurns = args.turns.map((t, i) => ({
    turnId: t.id,
    characterId: t.speakerCharacterId ?? "",
    text: t.text,
    order: i,
  }));

  const dialogVoices: Record<string, { voiceId: string; language: string }> = {};
  for (const t of args.turns) {
    if (t.speakerCharacterId && t.voiceId) {
      dialogVoices[t.speakerCharacterId] = {
        voiceId: t.voiceId,
        language: t.language ?? args.language,
      };
    }
  }

  const dialogScript = args.turns
    .map((t) => `${(t.speakerName ?? "Sprecher").toUpperCase()}: ${t.text}`)
    .join("\n");

  const row = {
    project_id: args.projectId,
    order_index: args.sceneIndex,
    scene_type: "custom",
    clip_url: args.clipUrl,
    clip_status: "completed",
    clip_source: "ai-hailuo",
    clip_error: null,
    duration_seconds: args.durationSeconds,
    reference_image_url: args.anchorUrl ?? null,
    dialog_mode: true,
    with_audio: true,
    lip_sync_with_voiceover: true,
    engine_override: "cinematic-sync",
    dialog_script: dialogScript,
    dialog_turns: dialogTurns,
    dialog_voices: dialogVoices,
    character_shots: speakers.map((id) => ({ characterId: id, shotType: "full" })),
    scene_assets: speakers.map((id) => ({ type: "character", id })),
    lip_sync_status: "pending",
    twoshot_stage: null,
    dialog_shots: null,
    updated_at: new Date().toISOString(),
  };

  // Bereits vorhandene Brückenszene wiederverwenden (idempotenter Retry).
  const { data: scene } = await admin
    .from("autopilot_production_scenes")
    .select("composer_scene_id")
    .eq("production_id", args.productionId)
    .eq("scene_index", args.sceneIndex)
    .maybeSingle();

  const existing = scene?.composer_scene_id as string | undefined;
  if (existing) {
    const { error } = await admin.from("composer_scenes").update(row).eq("id", existing);
    if (!error) return existing;
    console.warn("[autopilotComposerBridge] bridge scene update failed, recreating", error.message);
  }

  const { data: created, error } = await admin
    .from("composer_scenes")
    .insert(row)
    .select("id")
    .single();

  if (error || !created?.id) {
    console.error("[autopilotComposerBridge] bridge scene insert failed", error?.message);
    return null;
  }

  await admin
    .from("autopilot_production_scenes")
    .update({ composer_scene_id: created.id, updated_at: new Date().toISOString() })
    .eq("production_id", args.productionId)
    .eq("scene_index", args.sceneIndex);

  return created.id as string;
}

// ───────────────────────────────────────────────────────── Credit-Ausgleich

/** Schreibt dem Kunden die Credits gut, die der Composer gleich abbucht. */
export async function grantBridgeCredits(admin: Admin, userId: string, credits: number): Promise<boolean> {
  if (credits <= 0) return true;
  const { data: wallet } = await admin
    .from("wallets")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (!wallet) {
    const { error } = await admin.from("wallets").insert({ user_id: userId, balance: credits });
    if (error) {
      console.error("[autopilotComposerBridge] wallet insert failed", error.message);
      return false;
    }
    return true;
  }

  const { error } = await admin
    .from("wallets")
    .update({ balance: Number(wallet.balance ?? 0) + credits, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) {
    console.error("[autopilotComposerBridge] wallet grant failed", error.message);
    return false;
  }
  return true;
}

/** Zieht eine Gutschrift wieder ein (Dispatch abgelehnt oder Composer-Refund). */
export async function revokeBridgeCredits(admin: Admin, userId: string, credits: number): Promise<void> {
  if (credits <= 0) return;
  const { data: wallet } = await admin
    .from("wallets")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (!wallet) return;
  const next = Math.max(0, Number(wallet.balance ?? 0) - credits);
  await admin
    .from("wallets")
    .update({ balance: next, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}

// ────────────────────────────────────────────────────────────── Der Lauf

export interface BridgeRunResult {
  ok: boolean;
  outputUrl?: string;
  masterAudioUrl?: string;
  /** Klartext fürs Regie-Log. */
  reason?: string;
  /** Composer-`clip_error`, wenn vorhanden — Basis für den Motion-Retry. */
  clipError?: string | null;
  /** True, wenn der Composer die Credits selbst erstattet hat. */
  composerRefunded: boolean;
  speakerCount: number;
  grantedCredits: number;
}

const POLL_INTERVAL_MS = 6_000;
const POLL_TIMEOUT_MS = 9 * 60_000;

/**
 * Fährt eine Autopilot-Dialogszene komplett durch die Composer-Strecke:
 * Audio-Prep → Credit-Ausgleich → Lip-Sync-Dispatch → Warten auf das Ergebnis.
 */
export async function runComposerLipSync(admin: Admin, args: {
  sceneId: string;
  userId: string;
  durationSeconds: number;
  speakerCount: number;
}): Promise<BridgeRunResult> {
  const speakerCount = Math.max(1, args.speakerCount);
  const base: BridgeRunResult = {
    ok: false,
    composerRefunded: false,
    speakerCount,
    grantedCredits: 0,
  };

  // 1) Stimmen bauen — genau der Weg, den das Motion Studio geht.
  const audio = await callFn("compose-twoshot-audio", { scene_id: args.sceneId });
  if (audio.status >= 400) {
    return { ...base, reason: `audio_prep_failed:${audio.json?.error ?? audio.status}` };
  }

  const { data: prepped } = await admin
    .from("composer_scenes")
    .select("audio_plan, duration_seconds")
    .eq("id", args.sceneId)
    .maybeSingle();

  const twoshot = ((prepped?.audio_plan ?? {}) as Record<string, any>).twoshot ?? {};
  const masterAudioUrl = typeof twoshot.url === "string" ? twoshot.url : undefined;
  const totalSec = Number(twoshot.totalSec ?? args.durationSeconds) || args.durationSeconds;
  if (!masterAudioUrl) {
    return { ...base, reason: "audio_plan_incomplete" };
  }

  // 2) Credits bereitstellen, die der Composer gleich abbucht (net-neutral).
  const credits = composerLipsyncCredits(totalSec, speakerCount);
  const granted = await grantBridgeCredits(admin, args.userId, credits);
  if (!granted) {
    return { ...base, masterAudioUrl, reason: "credit_bridge_failed" };
  }

  // 3) Dispatch über die bestehende Tür.
  const dispatch = await callFn("compose-dialog-segments", { scene_id: args.sceneId });
  if (dispatch.status >= 400) {
    await revokeBridgeCredits(admin, args.userId, credits);
    return {
      ...base,
      masterAudioUrl,
      reason: `dispatch_rejected:${dispatch.json?.error ?? dispatch.status}`,
    };
  }

  // 4) Auf das Ergebnis warten. Webhook + Cron treiben die Pässe voran.
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const { data: row } = await admin
      .from("composer_scenes")
      .select("lip_sync_status, clip_error, dialog_shots, clip_url")
      .eq("id", args.sceneId)
      .maybeSingle();

    const status = String(row?.lip_sync_status ?? "");
    const shots = (row?.dialog_shots ?? {}) as Record<string, any>;

    if (status === "completed" || status === "done" || shots.status === "done") {
      const outputUrl = (typeof shots.final_url === "string" && shots.final_url) ||
        (typeof row?.clip_url === "string" ? row.clip_url : undefined);
      return {
        ...base,
        ok: true,
        outputUrl,
        masterAudioUrl,
        grantedCredits: credits,
      };
    }

    if (status === "failed" || status === "canceled" || shots.status === "failed") {
      const composerRefunded = shots.refunded === true;
      if (composerRefunded) await revokeBridgeCredits(admin, args.userId, credits);
      return {
        ...base,
        masterAudioUrl,
        clipError: (row?.clip_error as string) ?? (shots.error as string) ?? null,
        reason: String(row?.clip_error ?? shots.error ?? "lipsync_failed"),
        composerRefunded,
        grantedCredits: credits,
      };
    }
  }

  return {
    ...base,
    masterAudioUrl,
    reason: "lipsync_timeout",
    grantedCredits: credits,
  };
}

/** Fehlerklassen, bei denen ein engeres Ankerbild realistisch hilft. */
export function isFramingFailure(clipError: string | null | undefined): boolean {
  if (!clipError) return false;
  const e = clipError.toLowerCase();
  return (
    e.includes("face_validation_failed") ||
    e.includes("face_gate") ||
    e.includes("bbox_geometry_insane") ||
    e.includes("min_face") ||
    e.includes("face_too_small") ||
    e.includes("no_face")
  );
}
