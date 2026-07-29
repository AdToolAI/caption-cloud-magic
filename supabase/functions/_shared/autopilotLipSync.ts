/**
 * autopilotLipSync — die gehärtete Lip-Sync-Strecke für den Autopiloten.
 *
 * Bisher rief `autopilot-orchestrate` blind `lip-sync-video` auf: kein
 * Preflight, kein Face-Gate, kein Retry — und die Abrechnung lief dort gegen
 * die alte `wallets`-Tabelle, obwohl der Autopilot über `ai_video_wallets`
 * bucht. Dieses Modul ersetzt den Pfad vollständig:
 *
 *   1. Circuit-Breaker + MP4-Probe, bevor irgendetwas dispatcht wird
 *   2. Face-Gate auf dem Ankerbild (das i2v-Eingangsbild = Plate-Geometrie)
 *   3. Sprecher→Gesicht-Zuordnung row-major, ein Sync.so-Pass pro Sprecher
 *   4. Retry mit Backoff bei transienten Fehlern, Klartext-Grund sonst
 *
 * Sprachneutral: Sync.so ist audiogetrieben. Deutsches ElevenLabs-Audio geht
 * unverändert durch — im Gegensatz zu Kling Omni, das die Stimme selbst
 * erzeugt und kein Deutsch kann. Deshalb bleibt Sync.so hier gesetzt.
 */

import {
  clampCoordsToBounds,
  classifySyncError,
  computeBackoffMs,
  evaluateCircuit,
  explainSyncErrorCode,
  getSyncApiKey,
  isTransientSyncError,
  openCircuit,
  probeMp4Stream,
  recordCircuitSuccess,
  validateFrameFace,
} from "./syncso-preflight.ts";
import { enforceMinFaceSize } from "./anchor-min-face-size.ts";

const SYNC_API_BASE = "https://api.sync.so/v2";
const SYNC_MODEL = "sync-3";
const SAMPLE_RATE = 24_000;
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 6 * 60_000;

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface AutopilotTurn {
  /** Kanonische ID — Server-Wahrheit, nie über Namen matchen. */
  id: string;
  text: string;
  speakerCharacterId?: string | null;
  speakerName?: string | null;
  voiceId?: string | null;
  language?: string | null;
}

export interface TurnTrack {
  turnIndex: number;
  turn: AutopilotTurn;
  /** Szenenlange WAV: Stille davor/danach, Sprache exakt an ihrer Position. */
  url: string;
  startSec: number;
  endSec: number;
}

export interface TurnTrackResult {
  ok: boolean;
  reason?: string;
  tracks: TurnTrack[];
  /** Alle Turns in einer Spur — das ist die VO-Spur für den Endschnitt. */
  masterUrl?: string;
  totalSec: number;
}

export interface FaceGateResult {
  ok: boolean;
  reason?: string;
  /** Normalisierte Boxen (0..1), row-major sortiert. */
  boxes: Array<{ x: number; y: number; w: number; h: number }>;
  faceScore: number | null;
  minWidthRatio: number;
  /** Prompt-Suffix für einen engeren Anker-Retry, wenn das Gate scheitert. */
  framingSuffix: string;
}

export interface LipSyncPass {
  trackUrl: string;
  startSec: number;
  box: { x: number; y: number; w: number; h: number } | null;
  speakerName: string;
}

export interface LipSyncResult {
  ok: boolean;
  outputUrl?: string;
  /** Klartext für das Regie-Log. */
  reason?: string;
  errorClass?: string;
  passesDone: number;
}

// ───────────────────────────────────────────────────── Audio: Turn-Spuren

function wavHeader(dataBytes: number): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) header[offset + i] = text.charCodeAt(i);
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataBytes, true);
  return header;
}

function pcmToWav(pcm: Int16Array): Uint8Array {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const out = new Uint8Array(44 + bytes.byteLength);
  out.set(wavHeader(bytes.byteLength), 0);
  out.set(bytes, 44);
  return out;
}

async function elevenLabsPcm(args: {
  apiKey: string;
  voiceId: string;
  text: string;
  language: string;
}): Promise<Int16Array | null> {
  const url =
    `https://api.elevenlabs.io/v1/text-to-speech/${args.voiceId}?output_format=pcm_24000`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": args.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: args.text,
      // turbo_v2_5 ist der sprachgepinnte Standard der Plattform.
      model_id: "eleven_turbo_v2_5",
      language_code: args.language || "de",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.15,
        use_speaker_boost: true,
      },
    }),
  });
  if (!resp.ok) {
    console.warn(
      `[autopilotLipSync] elevenlabs ${resp.status}: ${(await resp.text()).slice(0, 200)}`,
    );
    return null;
  }
  const buf = new Uint8Array(await resp.arrayBuffer());
  // s16le → Int16Array (byteLength kann ungerade sein, dann letztes Byte weg)
  const usable = buf.byteLength - (buf.byteLength % 2);
  return new Int16Array(buf.buffer.slice(0, usable));
}

async function uploadWav(
  admin: Admin,
  path: string,
  wav: Uint8Array,
): Promise<string | null> {
  const { error } = await admin.storage
    .from("voiceover-audio")
    .upload(path, wav, { contentType: "audio/wav", upsert: true });
  if (error) {
    console.warn(`[autopilotLipSync] upload failed ${path}: ${error.message}`);
    return null;
  }
  const { data } = admin.storage.from("voiceover-audio").getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/**
 * Erzeugt pro Turn eine szenenlange WAV-Spur (Stille an allen Stellen, an
 * denen dieser Sprecher schweigt). Sync.so bekommt damit pro Pass ein Audio,
 * das exakt so lang ist wie der Clip — kein Loop-Drift, keine Zeitversätze.
 */
export async function buildTurnTracks(args: {
  admin: Admin;
  userId: string;
  productionId: string;
  sceneIndex: number;
  turns: AutopilotTurn[];
  sceneDurationSec: number;
  defaultLanguage?: string;
  gapSec?: number;
}): Promise<TurnTrackResult> {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) return { ok: false, reason: "elevenlabs_key_missing", tracks: [], totalSec: 0 };

  const gap = args.gapSec ?? 0.25;
  const spoken: Array<{ turn: AutopilotTurn; pcm: Int16Array; startSec: number }> = [];
  let cursorSec = 0;

  for (const turn of args.turns) {
    const text = (turn.text ?? "").trim();
    if (text.length < 2) continue;
    if (!turn.voiceId) {
      console.warn(`[autopilotLipSync] turn ${turn.id} ohne voiceId — übersprungen`);
      continue;
    }
    const pcm = await elevenLabsPcm({
      apiKey,
      voiceId: turn.voiceId,
      text,
      language: (turn.language || args.defaultLanguage || "de").slice(0, 2),
    });
    if (!pcm || pcm.length === 0) continue;
    spoken.push({ turn, pcm, startSec: cursorSec });
    cursorSec += pcm.length / SAMPLE_RATE + gap;
  }

  if (spoken.length === 0) {
    return { ok: false, reason: "no_audio_generated", tracks: [], totalSec: 0 };
  }

  const totalSec = Math.max(args.sceneDurationSec, cursorSec);
  const totalSamples = Math.ceil(totalSec * SAMPLE_RATE);

  const master = new Int16Array(totalSamples);
  const tracks: TurnTrack[] = [];

  for (let i = 0; i < spoken.length; i++) {
    const { turn, pcm, startSec } = spoken[i];
    const offset = Math.floor(startSec * SAMPLE_RATE);
    const lane = new Int16Array(totalSamples);
    for (let s = 0; s < pcm.length && offset + s < totalSamples; s++) {
      lane[offset + s] = pcm[s];
      const mixed = master[offset + s] + pcm[s];
      master[offset + s] = mixed > 32767 ? 32767 : mixed < -32768 ? -32768 : mixed;
    }
    const path =
      `${args.userId}/autopilot/${args.productionId}/s${args.sceneIndex}-t${i}.wav`;
    const url = await uploadWav(args.admin, path, pcmToWav(lane));
    if (!url) continue;
    tracks.push({
      turnIndex: i,
      turn,
      url,
      startSec,
      endSec: startSec + pcm.length / SAMPLE_RATE,
    });
  }

  if (tracks.length === 0) {
    return { ok: false, reason: "track_upload_failed", tracks: [], totalSec };
  }

  const masterUrl = await uploadWav(
    args.admin,
    `${args.userId}/autopilot/${args.productionId}/s${args.sceneIndex}-master.wav`,
    pcmToWav(master),
  ) ?? undefined;

  return { ok: true, tracks, masterUrl, totalSec };
}

// ───────────────────────────────────────────────────────────── Face-Gate

/** Row-major: erst Zeile (y), dann Spalte (x) — gleiche Ordnung wie im Composer. */
function sortRowMajor<T extends { x: number; y: number; h: number }>(boxes: T[]): T[] {
  const rowHeight = Math.max(0.12, Math.max(...boxes.map((b) => b.h), 0.12));
  return [...boxes].sort((a, b) => {
    const rowA = Math.floor(a.y / rowHeight);
    const rowB = Math.floor(b.y / rowHeight);
    if (rowA !== rowB) return rowA - rowB;
    return a.x - b.x;
  });
}

/**
 * Prüft das Ankerbild, bevor Motion-Credits fließen. Das Ankerbild ist der
 * i2v-Eingang, also geometrisch das, was der Clip zeigen wird.
 */
export async function checkAnchorFaces(args: {
  anchorUrl: string;
  expectedSpeakers: number;
  minWidthRatio?: number;
}): Promise<FaceGateResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const face = await validateFrameFace({
    supabaseUrl,
    serviceKey,
    videoUrl: args.anchorUrl,
    frameNumber: 0,
    fps: 24,
  });

  const boxes = sortRowMajor(
    (face.faceBoxes ?? []).map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
  );

  // Nominelle Plate-Breite 1000 — enforceMinFaceSize rechnet nur Verhältnisse.
  const gate = enforceMinFaceSize({
    faces: boxes.map((b) => ({
      bbox: [b.x * 1000, b.y * 1000, (b.x + b.w) * 1000, (b.y + b.h) * 1000] as
        [number, number, number, number],
    })),
    plateWidth: 1000,
    plateHeight: 1000,
    expectedSpeakers: args.expectedSpeakers,
    minWidthRatio: args.minWidthRatio ?? 0.12,
  });

  const score = face.faceScore ?? null;
  const scoreOk = score == null || score >= 0.4;

  if (!face.ok) {
    // Validator selbst kaputt → nicht blockieren, nur weiterreichen.
    return {
      ok: true,
      reason: `validator_unavailable:${face.error ?? "unknown"}`,
      boxes,
      faceScore: score,
      minWidthRatio: gate.minWidthRatio,
      framingSuffix: gate.framingSuffix,
    };
  }

  if (boxes.length < args.expectedSpeakers) {
    return {
      ok: false,
      reason: `only_${boxes.length}_of_${args.expectedSpeakers}_faces`,
      boxes,
      faceScore: score,
      minWidthRatio: gate.minWidthRatio,
      framingSuffix: gate.framingSuffix,
    };
  }

  if (!gate.ok) {
    return {
      ok: false,
      reason: gate.reason ?? "face_too_small",
      boxes,
      faceScore: score,
      minWidthRatio: gate.minWidthRatio,
      framingSuffix: gate.framingSuffix,
    };
  }

  if (!scoreOk) {
    return {
      ok: false,
      reason: `face_score_${score?.toFixed(2)}`,
      boxes,
      faceScore: score,
      minWidthRatio: gate.minWidthRatio,
      framingSuffix: gate.framingSuffix,
    };
  }

  return {
    ok: true,
    boxes,
    faceScore: score,
    minWidthRatio: gate.minWidthRatio,
    framingSuffix: gate.framingSuffix,
  };
}

// ───────────────────────────────────────────────────── Sync.so-Dispatch

async function dispatchSyncPass(args: {
  apiKey: string;
  videoUrl: string;
  audioUrl: string;
  coords: [number, number] | null;
  frameNumber: number;
}): Promise<{ ok: boolean; outputUrl?: string; error?: string; errorCode?: string }> {
  const options: Record<string, unknown> = { sync_mode: "loop" };
  if (args.coords) {
    options.active_speaker_detection = {
      auto_detect: false,
      frame_number: args.frameNumber,
      coordinates: args.coords,
    };
  } else {
    options.active_speaker_detection = { auto_detect: true };
  }

  const resp = await fetch(`${SYNC_API_BASE}/generate`, {
    method: "POST",
    headers: { "x-api-key": args.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SYNC_MODEL,
      input: [
        { type: "video", url: args.videoUrl },
        { type: "audio", url: args.audioUrl },
      ],
      options,
    }),
  });

  const created = await resp.json().catch(() => ({}));
  if (!resp.ok || !created?.id) {
    return {
      ok: false,
      error: created?.message ?? created?.error ?? `http_${resp.status}`,
      errorCode: created?.error_code ?? null,
    };
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const poll = await fetch(`${SYNC_API_BASE}/generate/${created.id}`, {
      headers: { "x-api-key": args.apiKey },
    });
    const job = await poll.json().catch(() => ({}));
    const status = String(job?.status ?? "").toUpperCase();
    if (status === "COMPLETED" && job?.outputUrl) {
      return { ok: true, outputUrl: String(job.outputUrl) };
    }
    if (status === "FAILED" || status === "CANCELED" || status === "REJECTED") {
      return {
        ok: false,
        error: job?.error ?? status.toLowerCase(),
        errorCode: job?.error_code ?? null,
      };
    }
  }
  return { ok: false, error: "poll_timeout" };
}

/**
 * Ein Pass pro Sprecher: Ausgabe des Passes N ist Eingabe von Pass N+1, damit
 * jeder Mund einzeln und identitätstreu animiert wird. Bei einem Sprecher ist
 * das exakt ein Durchlauf mit `auto_detect`.
 */
export async function runLipSyncPasses(args: {
  admin: Admin;
  clipUrl: string;
  durationSec: number;
  passes: LipSyncPass[];
  fps?: number;
}): Promise<LipSyncResult> {
  const apiKey = getSyncApiKey();
  if (!apiKey) {
    return { ok: false, reason: "Sync.so-Schlüssel fehlt", errorClass: "auth", passesDone: 0 };
  }
  if (args.passes.length === 0) {
    return { ok: false, reason: "keine Sprechspur", errorClass: "audio_no_voice", passesDone: 0 };
  }

  // Block 1.3 — offener Circuit: gar nicht erst dispatchen.
  const circuit = await evaluateCircuit(args.admin, "sync.so");
  if (!circuit.allow) {
    return {
      ok: false,
      reason: "Sync.so ist gerade nicht erreichbar (Schutzschalter offen)",
      errorClass: "circuit_open",
      passesDone: 0,
    };
  }

  // Block 1.1 — Codec-Probe. Sync.so lehnt Nicht-H.264 ab.
  const probe = await probeMp4Stream(args.clipUrl);
  if (probe.isUnsupportedCodec) {
    return {
      ok: false,
      reason: `Clip-Codec ${probe.codec} wird von Sync.so nicht akzeptiert`,
      errorClass: "video_codec_unsupported",
      passesDone: 0,
    };
  }
  const width = probe.width ?? 0;
  const height = probe.height ?? 0;
  const fps = args.fps ?? 25;

  let currentUrl = args.clipUrl;
  let passesDone = 0;

  for (const pass of args.passes) {
    let coords: [number, number] | null = null;
    if (pass.box && width && height) {
      // Mundhöhe ≈ 75 % der Gesichtsbox.
      coords = clampCoordsToBounds(
        [
          (pass.box.x + pass.box.w / 2) * width,
          (pass.box.y + pass.box.h * 0.75) * height,
        ],
        width,
        height,
      );
    }
    const frameNumber = Math.max(
      0,
      Math.min(
        Math.round(args.durationSec * fps) - 1,
        Math.round(pass.startSec * fps),
      ),
    );

    let lastError = "unknown";
    let lastClass = "other";
    let done = false;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const out = await dispatchSyncPass({
        apiKey,
        videoUrl: currentUrl,
        audioUrl: pass.trackUrl,
        coords,
        frameNumber,
      });
      if (out.ok && out.outputUrl) {
        currentUrl = out.outputUrl;
        passesDone++;
        done = true;
        break;
      }
      lastError = explainSyncErrorCode(out.errorCode) ?? out.error ?? "unknown";
      lastClass = classifySyncError(out.error);
      if (attempt < 3 && isTransientSyncError(lastClass)) {
        await new Promise((r) => setTimeout(r, computeBackoffMs(attempt)));
        continue;
      }
      break;
    }

    if (!done) {
      await openCircuit(args.admin, "sync.so", lastClass);
      return {
        ok: passesDone > 0,
        outputUrl: passesDone > 0 ? currentUrl : undefined,
        reason: `${pass.speakerName}: ${lastError}`,
        errorClass: lastClass,
        passesDone,
      };
    }
  }

  await recordCircuitSuccess(args.admin, "sync.so");
  return { ok: true, outputUrl: currentUrl, passesDone };
}
