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
  }>;
  voiceOverUrl?: string | null;
  voiceOverEnabled?: boolean;
  currentVoiceId?: string | null;
  backgroundMusicUrl?: string | null;
  subtitleClips: Array<{
    id: string;
    text?: string;
    color?: string;
    backgroundColor?: string;
    fontSize?: number;
  }>;
  showSubtitles?: boolean;
  exportAspectRatio?: string;
}

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

  return findings;
}

export const preflightBlocks = (findings: PreflightFinding[]) =>
  findings.some((f) => f.severity === 'fail');
