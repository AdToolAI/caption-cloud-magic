// Shared helpers for NLE-Export (FCPXML 1.10 + CMX 3600 EDL).
// Pure string-builders — no external deps so they're cheap to import.

export interface NLEScene {
  id: string;
  order_index: number;
  duration_seconds: number;
  /** URL of the actual video clip (clip_url || upload_url). */
  videoUrl: string | null;
  /** Optional human-readable name for the asset. */
  name?: string;
}

export interface NLEAudio {
  /** Lane offset starting at 1 (will be placed at lane -laneIndex). */
  laneIndex: number;
  url: string;
  name: string;
  /** Duration in seconds — defaults to total project duration. */
  durationSeconds: number;
}

export interface NLEProject {
  id: string;
  title: string;
  fps: 24 | 30 | 60;
  width: number;
  height: number;
  scenes: NLEScene[];
  audio: NLEAudio[];
}

/* ---------------------------------------------------------------- */
/* Shared utilities                                                 */
/* ---------------------------------------------------------------- */

const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** FCPXML uses rational time: "FRAMES/FPSs". */
const rational = (seconds: number, fps: number) => {
  const frames = Math.max(0, Math.round(seconds * fps));
  return `${frames}/${fps}s`;
};

/** "0s" or rational time. */
const rationalOrZero = (seconds: number, fps: number) =>
  seconds <= 0 ? "0s" : rational(seconds, fps);

/** SMPTE timecode HH:MM:SS:FF (non-drop-frame). */
const smpte = (seconds: number, fps: number) => {
  const totalFrames = Math.max(0, Math.round(seconds * fps));
  const h = Math.floor(totalFrames / (3600 * fps));
  const m = Math.floor((totalFrames % (3600 * fps)) / (60 * fps));
  const s = Math.floor((totalFrames % (60 * fps)) / fps);
  const f = totalFrames % fps;
  return [h, m, s, f].map((n) => n.toString().padStart(2, "0")).join(":");
};

const inferAssetName = (sc: NLEScene, idx: number) =>
  sc.name?.trim() || `scene_${(sc.order_index ?? idx).toString().padStart(3, "0")}`;

/* ---------------------------------------------------------------- */
/* FCPXML 1.10 (Apple — works in Resolve, Premiere, FCP)            */
/* ---------------------------------------------------------------- */

export function buildFCPXML(project: NLEProject): string {
  const { fps, width, height, scenes, audio } = project;

  const usableScenes = scenes
    .filter((s) => !!s.videoUrl)
    .sort((a, b) => a.order_index - b.order_index);

  // Total project duration (sum of scene durations) — also used to clamp audio.
  const totalDuration = usableScenes.reduce((sum, s) => sum + s.duration_seconds, 0);

  // ---- format ----
  const formatId = "r1";
  const frameDuration = `1/${fps}s`;
  const formatLine = `<format id="${formatId}" name="FFVideoFormat${height}p${fps}" frameDuration="${frameDuration}" width="${width}" height="${height}"/>`;

  // ---- assets ----
  const videoAssets: string[] = [];
  const audioAssets: string[] = [];
  let assetCounter = 2; // r1 is the format

  const sceneAssetIds: string[] = [];
  for (let i = 0; i < usableScenes.length; i++) {
    const sc = usableScenes[i];
    const id = `r${assetCounter++}`;
    sceneAssetIds.push(id);
    const name = inferAssetName(sc, i);
    const dur = rationalOrZero(sc.duration_seconds, fps);
    videoAssets.push(
      `<asset id="${id}" name="${escapeXml(name)}" src="${escapeXml(sc.videoUrl!)}" start="0s" duration="${dur}" hasVideo="1" hasAudio="1" format="${formatId}" videoSources="1" audioSources="1" audioChannels="2" audioRate="48000"/>`,
    );
  }

  const audioAssetIds: string[] = [];
  for (const a of audio) {
    const id = `r${assetCounter++}`;
    audioAssetIds.push(id);
    const dur = rationalOrZero(a.durationSeconds || totalDuration, fps);
    audioAssets.push(
      `<asset id="${id}" name="${escapeXml(a.name)}" src="${escapeXml(a.url)}" start="0s" duration="${dur}" hasVideo="0" hasAudio="1" audioSources="1" audioChannels="2" audioRate="48000"/>`,
    );
  }

  // ---- spine clips ----
  const clips: string[] = [];
  let cursor = 0;
  for (let i = 0; i < usableScenes.length; i++) {
    const sc = usableScenes[i];
    const id = sceneAssetIds[i];
    const dur = rationalOrZero(sc.duration_seconds, fps);
    const offset = rationalOrZero(cursor, fps);
    clips.push(
      `<asset-clip name="${escapeXml(inferAssetName(sc, i))}" ref="${id}" offset="${offset}" duration="${dur}" start="0s"/>`,
    );
    cursor += sc.duration_seconds;
  }

  // ---- audio lanes ----
  const audioClips: string[] = [];
  for (let i = 0; i < audio.length; i++) {
    const a = audio[i];
    const id = audioAssetIds[i];
    const lane = -(a.laneIndex || i + 1);
    const dur = rationalOrZero(Math.min(a.durationSeconds || totalDuration, totalDuration), fps);
    audioClips.push(
      `<asset-clip name="${escapeXml(a.name)}" ref="${id}" offset="0s" duration="${dur}" start="0s" lane="${lane}" audioRole="dialogue"/>`,
    );
  }

  const sequenceDuration = rationalOrZero(totalDuration, fps);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    ${formatLine}
    ${videoAssets.join("\n    ")}
    ${audioAssets.join("\n    ")}
  </resources>
  <library>
    <event name="${escapeXml(project.title)}">
      <project name="${escapeXml(project.title)}">
        <sequence format="${formatId}" duration="${sequenceDuration}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
            ${clips.join("\n            ")}
            ${audioClips.join("\n            ")}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;
}

/* ---------------------------------------------------------------- */
/* CMX 3600 EDL                                                      */
/* ---------------------------------------------------------------- */

export function buildEDL(project: NLEProject): string {
  const { fps, scenes, title } = project;

  const usableScenes = scenes
    .filter((s) => !!s.videoUrl)
    .sort((a, b) => a.order_index - b.order_index);

  const lines: string[] = [];
  lines.push(`TITLE: ${title.replace(/[^\x20-\x7e]/g, "?").slice(0, 70)}`);
  lines.push(`FCM: NON-DROP FRAME`);
  lines.push("");

  let timelineCursor = 0;
  for (let i = 0; i < usableScenes.length; i++) {
    const sc = usableScenes[i];
    const dur = sc.duration_seconds;
    const reel = `CLIP${(i + 1).toString().padStart(3, "0")}`;
    const sourceIn = smpte(0, fps);
    const sourceOut = smpte(dur, fps);
    const recordIn = smpte(timelineCursor, fps);
    const recordOut = smpte(timelineCursor + dur, fps);

    // V (video) cut
    lines.push(
      `${(i + 1).toString().padStart(3, "0")}  ${reel.padEnd(8)} V     C        ${sourceIn} ${sourceOut} ${recordIn} ${recordOut}`,
    );
    // A (audio) cut on same reel
    lines.push(
      `${(i + 1).toString().padStart(3, "0")}  ${reel.padEnd(8)} A     C        ${sourceIn} ${sourceOut} ${recordIn} ${recordOut}`,
    );
    // Source comment with URL (so Resolve "Online Media" can reconnect)
    lines.push(`* FROM CLIP NAME: ${inferAssetName(sc, i)}`);
    lines.push(`* SOURCE FILE: ${sc.videoUrl}`);
    lines.push("");

    timelineCursor += dur;
  }

  lines.push("");
  lines.push(`* EDL exported from AdTool Composer — ${new Date().toISOString()}`);
  lines.push(`* Note: EDL format does not support text overlays, color grading, or effects.`);
  lines.push(`* Use the FCPXML export to preserve those.`);

  return lines.join("\n");
}

/* ---------------------------------------------------------------- */
/* README for the bundle                                             */
/* ---------------------------------------------------------------- */

export function buildBundleReadme(project: NLEProject, warnings: string[]): string {
  const { title, fps, width, height, scenes, audio } = project;
  const totalSec = scenes.reduce((s, x) => s + x.duration_seconds, 0);
  return `# ${title}

Exported from AdTool Composer — ${new Date().toISOString()}

## Project
- Resolution: ${width}x${height}
- Frame rate: ${fps} fps
- Duration: ${totalSec.toFixed(1)}s
- Scenes: ${scenes.length}
- Audio tracks: ${audio.length}

## Files
- \`sequence.fcpxml\` — open in DaVinci Resolve, Premiere Pro, or Final Cut Pro
- \`sequence.edl\` — legacy CMX 3600, for Avid or older NLEs (no effects, no overlays)
- \`/clips/\` — raw video clips referenced by the sequences
- \`/audio/\` — voiceover and music tracks

## How to import

### DaVinci Resolve
1. File → Import → Timeline → Pre-Conformed XML
2. Select \`sequence.fcpxml\`
3. Resolve will ask to relink media → point to \`/clips/\` and \`/audio/\`

### Premiere Pro
1. File → Import → \`sequence.fcpxml\`
2. Premiere creates a new sequence with all clips and audio in place

### Final Cut Pro
1. File → Import → XML
2. Select \`sequence.fcpxml\`

## Warnings
${warnings.length === 0 ? "_None_" : warnings.map((w) => `- ${w}`).join("\n")}

## Limitations
- Speed-ramping (curve-based) is exported as average rate; subtle timing may differ.
- Animated text overlays are exported as static text only.
- Color grading presets and per-scene effects are exported as comments only — re-apply in your NLE.
`;
}
