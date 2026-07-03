// W4.2 CI-Preflight: consistency & brand-integrity checks before Lambda render.
// Pure client-side checks — no network calls. Returns findings the CIPreflightDialog renders.

export type PreflightSeverity = 'fail' | 'warn' | 'info';

export interface PreflightFinding {
  id: string;
  severity: PreflightSeverity;
  title: string;
  detail?: string;
  hint?: string;
}

export interface PreflightInput {
  projectId?: string;
  totalDuration: number;
  scenes: Array<{
    id: string;
    start_time: number;
    end_time: number;
    isBlackscreen?: boolean;
    thumbnail_url?: string;
    sourceMode?: string;
    aspect_ratio?: string | null;
    width?: number | null;
    height?: number | null;
  }>;
  voiceOverUrl?: string | null;
  voiceOverEnabled?: boolean;
  currentVoiceId?: string | null;
  backgroundMusicUrl?: string | null;
  musicVolume?: number; // 0..100
  voiceoverVolume?: number; // 0..100
  subtitleClips: Array<{
    id: string;
    text?: string;
    color?: string;
    backgroundColor?: string;
    fontSize?: number | string;
  }>;
  showSubtitles?: boolean;
  exportAspectRatio?: string;
}

// Normalise aspect strings like "16:9", "9/16", "1080x1920" into a numeric ratio (w/h).
const parseAspect = (s?: string | null, w?: number | null, h?: number | null): number | null => {
  if (w && h && w > 0 && h > 0) return w / h;
  if (!s) return null;
  const cleaned = s.trim().toLowerCase();
  const m = /^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/.exec(cleaned);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  if (!a || !b) return null;
  return a / b;
};

const aspectLabel = (r: number): string => {
  const presets: Array<[string, number]> = [
    ['16:9', 16 / 9],
    ['9:16', 9 / 16],
    ['1:1', 1],
    ['4:5', 4 / 5],
    ['21:9', 21 / 9],
  ];
  let best = presets[0];
  let bestDiff = Math.abs(r - best[1]);
  for (const p of presets) {
    const d = Math.abs(r - p[1]);
    if (d < bestDiff) { best = p; bestDiff = d; }
  }
  return best[0];
};

const readVoiceLock = (projectId?: string): { voiceId?: string } | null => {
  if (!projectId) return null;
  try {
    const raw = localStorage.getItem(`udc-voice-lock:${projectId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const parseHex = (c?: string): [number, number, number] | null => {
  if (!c) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const relLum = ([r, g, b]: [number, number, number]) => {
  const s = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
};

const contrastRatio = (a: string, b: string): number | null => {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  const la = relLum(ca);
  const lb = relLum(cb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

export function runCIPreflight(input: PreflightInput): PreflightFinding[] {
  const findings: PreflightFinding[] = [];

  // 1. Duration sanity
  if (!input.totalDuration || input.totalDuration < 1) {
    findings.push({
      id: 'duration',
      severity: 'fail',
      title: 'Timeline zu kurz',
      detail: `Gesamtdauer ${input.totalDuration.toFixed(2)}s — mindestens 1s benötigt.`,
    });
  }

  // 2. No scenes
  if (!input.scenes || input.scenes.length === 0) {
    findings.push({
      id: 'no-scenes',
      severity: 'fail',
      title: 'Keine Szenen auf der Timeline',
    });
  }

  // 3. Voice-Lock Mismatch
  const lock = readVoiceLock(input.projectId);
  if (lock?.voiceId && input.currentVoiceId && lock.voiceId !== input.currentVoiceId) {
    findings.push({
      id: 'voice-lock-mismatch',
      severity: 'warn',
      title: 'Voice-Lock weicht ab',
      detail: `Projekt ist auf Voice "${lock.voiceId}" gelockt, Voice-Over nutzt "${input.currentVoiceId}".`,
      hint: 'Entsperre den Lock oder generiere das Voice-Over mit der gelockten Stimme neu.',
    });
  }

  // 4. Voice-Over enabled aber keine URL
  if (input.voiceOverEnabled && !input.voiceOverUrl) {
    findings.push({
      id: 'vo-missing',
      severity: 'fail',
      title: 'Voice-Over aktiv, aber nicht generiert',
      hint: 'Öffne den Voice-Over-Tab und generiere die Datei vor dem Render.',
    });
  }

  // 5. Ultra-short scenes
  const shortScenes = input.scenes.filter((s) => {
    const d = (s.end_time ?? 0) - (s.start_time ?? 0);
    return d > 0 && d < 0.2;
  });
  if (shortScenes.length > 0) {
    findings.push({
      id: 'short-scenes',
      severity: 'warn',
      title: `${shortScenes.length} sehr kurze Szene${shortScenes.length > 1 ? 'n' : ''} (<0.2s)`,
      detail: 'Unter 0.2s wird die Szene im finalen Render kaum sichtbar.',
    });
  }

  // 6. Subtitle contrast
  if (input.showSubtitles && input.subtitleClips.length > 0) {
    const bad = input.subtitleClips.filter((c) => {
      if (!c.color || !c.backgroundColor) return false;
      const r = contrastRatio(c.color, c.backgroundColor);
      return r !== null && r < 3;
    });
    if (bad.length > 0) {
      findings.push({
        id: 'subtitle-contrast',
        severity: 'warn',
        title: `${bad.length} Untertitel mit schwachem Kontrast`,
        detail: 'Kontrast unter 3:1 → schwer lesbar (WCAG AA erfordert 4.5:1 für Text).',
      });
    }

    // Empty subtitle text
    const empty = input.subtitleClips.filter((c) => !c.text?.trim());
    if (empty.length > 0) {
      findings.push({
        id: 'subtitle-empty',
        severity: 'info',
        title: `${empty.length} leere Untertitel-Clips`,
        hint: 'Diese werden beim Export automatisch entfernt.',
      });
    }
  }

  // 7. Aspect Ratio present
  if (!input.exportAspectRatio) {
    findings.push({
      id: 'aspect-missing',
      severity: 'warn',
      title: 'Kein Seitenverhältnis gewählt',
      hint: 'Standardmäßig wird 16:9 verwendet.',
    });
  }

  // 8. Music without VO ducking hint
  if (input.backgroundMusicUrl && !input.voiceOverUrl) {
    findings.push({
      id: 'music-no-vo',
      severity: 'info',
      title: 'Musik ohne Voice-Over',
      hint: 'Ducking wird nicht angewendet — Musik läuft auf voller (gedämpfter) Lautstärke.',
    });
  }

  // 9. W4.6 Aspect-Ratio consistency across scenes
  const targetRatio = parseAspect(input.exportAspectRatio) ?? 16 / 9;
  const targetLabel = aspectLabel(targetRatio);
  const mismatched = input.scenes.filter((s) => {
    if (s.isBlackscreen) return false;
    const r = parseAspect(s.aspect_ratio ?? null, s.width ?? null, s.height ?? null);
    if (r === null) return false;
    // Allow 3% tolerance to account for rounding
    return Math.abs(r - targetRatio) / targetRatio > 0.03;
  });
  if (mismatched.length > 0) {
    findings.push({
      id: 'aspect-mismatch',
      severity: 'warn',
      title: `${mismatched.length} Szene${mismatched.length > 1 ? 'n' : ''} mit abweichendem Seitenverhältnis`,
      detail: `Projekt rendert in ${targetLabel} — betroffene Szenen werden beschnitten oder mit Letterbox versehen.`,
      hint: 'Ersetze Assets oder ändere das Export-Seitenverhältnis passend.',
    });
  }

  // 10. W4.6 Endcard-Check — final scene should be long enough for logo/CTA
  const realScenes = input.scenes.filter((s) => !s.isBlackscreen);
  if (realScenes.length > 0) {
    const last = realScenes[realScenes.length - 1];
    const lastDur = (last.end_time ?? 0) - (last.start_time ?? 0);
    if (lastDur > 0 && lastDur < 1.5) {
      findings.push({
        id: 'endcard-short',
        severity: 'info',
        title: 'Endcard sehr kurz',
        detail: `Letzte Szene ${lastDur.toFixed(2)}s — für Logo, CTA oder Call-out werden 1.5–3s empfohlen.`,
      });
    }
  }

  // 11. W4.6 Loudness approximation — social platforms target ~-14 LUFS
  // Approximation: normalised sum of active audio channels. Music at high vol
  // combined with VO tends to clip perceived loudness on TikTok / Meta.
  const musicVol = typeof input.musicVolume === 'number' ? input.musicVolume : 70;
  const voVol = typeof input.voiceoverVolume === 'number' ? input.voiceoverVolume : 100;
  const hasMusic = !!input.backgroundMusicUrl;
  const hasVO = !!input.voiceOverUrl;
  if (hasMusic && hasVO) {
    // Rough loudness proxy: linearly combine normalised volumes weighted by presence.
    // Values >1.4 (i.e. music >70% AND vo >70%) tend to push past -14 LUFS after mastering.
    const proxy = (musicVol / 100) * 0.6 + (voVol / 100);
    if (proxy > 1.4) {
      findings.push({
        id: 'loudness-hot',
        severity: 'warn',
        title: 'Mix wirkt zu laut',
        detail: `Musik ${musicVol}% + Voice-Over ${voVol}% überschreiten voraussichtlich -14 LUFS (Social-Standard).`,
        hint: 'Reduziere Musik auf ~40–50% oder aktiviere stärkeres Ducking.',
      });
    }
  } else if (hasMusic && !hasVO && musicVol > 85) {
    findings.push({
      id: 'loudness-music',
      severity: 'info',
      title: 'Musik sehr laut',
      detail: `Musik-Bett auf ${musicVol}% — ohne Ducking kann das im Feed unangenehm knallen.`,
    });
  }

  // 12. Missing thumbnails on real scenes (asset not fully loaded / broken URL)
  // Skip scenes sourced from the original video — those always render from
  // source_video_url regardless of whether the UI thumbnail has been rendered.
  const KNOWN_SOURCE_MODES = new Set([
    'original',
    'from-original',
    'trim',
    'ai-generated',
    'uploaded',
    'stock',
  ]);
  const missingThumbs = input.scenes.filter((s) => {
    if (s.isBlackscreen) return false;
    if (s.thumbnail_url) return false;
    if (s.sourceMode && KNOWN_SOURCE_MODES.has(s.sourceMode)) return false;
    return true;
  });
  if (missingThumbs.length > 0) {
    findings.push({
      id: 'missing-thumbnails',
      severity: 'warn',
      title: `${missingThumbs.length} Szene${missingThumbs.length > 1 ? 'n' : ''} ohne geladenes Asset`,
      detail: 'Ohne Thumbnail fehlt beim Render eventuell das zugrundeliegende Video.',
      hint: 'Öffne die Szene und lade das Asset neu oder ersetze es.',
    });
  }

  // 13. Consecutive blackscreens — usually an editing artefact
  let blackRun = 0;
  let blackRunMax = 0;
  for (const s of input.scenes) {
    if (s.isBlackscreen) {
      blackRun += 1;
      blackRunMax = Math.max(blackRunMax, blackRun);
    } else {
      blackRun = 0;
    }
  }
  if (blackRunMax >= 2) {
    findings.push({
      id: 'consecutive-blackscreens',
      severity: 'info',
      title: `${blackRunMax} Blackscreens in Folge`,
      hint: 'Meist ein Restartefakt vom Schneiden — zusammenfassen oder entfernen.',
    });
  }

  // 14. Social-format hook-fatigue guard — >90s often underperforms in feed
  if (input.totalDuration > 90) {
    findings.push({
      id: 'too-long-for-social',
      severity: 'info',
      title: `Video ${Math.round(input.totalDuration)}s lang`,
      hint: 'Für TikTok / Reels / Shorts liefern 15–60s meist die beste Retention. Nutze Auto Cut-Down für kürzere Varianten.',
    });
  }

  return findings;
}

export const preflightBlocks = (findings: PreflightFinding[]) =>
  findings.some((f) => f.severity === 'fail');
