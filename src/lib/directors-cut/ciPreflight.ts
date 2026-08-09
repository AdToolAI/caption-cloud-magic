import { tx } from "@/lib/i18nText";
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
      title: tx({ de: 'Timeline zu kurz', en: 'Timeline too short', es: 'Línea de tiempo demasiado corta' }),
      detail: tx({ de: `Gesamtdauer ${input.totalDuration.toFixed(2)}s — mindestens 1s benötigt.`, en: `Total duration ${input.totalDuration.toFixed(2)}s — at least 1s needed.`, es: `Duración total ${input.totalDuration.toFixed(2)}s — se necesita al menos 1s.` }),
    });
  }

  // 2. No scenes
  if (!input.scenes || input.scenes.length === 0) {
    findings.push({
      id: 'no-scenes',
      severity: 'fail',
      title: tx({ de: "Keine Szenen auf der Timeline", en: "No scenes on the timeline", es: "No hay escenas en la línea de tiempo." }),
    });
  }

  // 3. Voice-Lock Mismatch
  const lock = readVoiceLock(input.projectId);
  if (lock?.voiceId && input.currentVoiceId && lock.voiceId !== input.currentVoiceId) {
    findings.push({
      id: 'voice-lock-mismatch',
      severity: 'warn',
      title: tx({ de: 'Voice-Lock weicht ab', en: 'Voice lock deviates', es: 'El bloqueo de voz se desvía' }),
      detail: tx({ de: `Projekt ist auf Voice "${lock.voiceId}" gelockt, Voice-Over nutzt "${input.currentVoiceId}".`, en: `Project is locked to voice "${lock.voiceId}", voice over uses "${input.currentVoiceId}".`, es: `El proyecto está bloqueado para la voz "${lock.voiceId}", la voz en off usa "${input.currentVoiceId}".` }),
      hint: tx({ de: 'Entsperre den Lock oder generiere das Voice-Over mit der gelockten Stimme neu.', en: 'Unlock the lock or regenerate the voice-over with the locked voice.', es: 'Desbloquea el candado o regenera la voz en off con la voz bloqueada.' }),
    });
  }

  // 4. Voice-Over enabled aber keine URL
  if (input.voiceOverEnabled && !input.voiceOverUrl) {
    findings.push({
      id: 'vo-missing',
      severity: 'fail',
      title: tx({ de: 'Voice-Over aktiv, aber nicht generiert', en: 'Voice-over active, but not generated', es: 'Voz en off activa, pero no generada' }),
      hint: tx({ de: 'Öffne den Voice-Over-Tab und generiere die Datei vor dem Render.', en: 'Open the voice-over tab and generate the file before rendering.', es: 'Abre la pestaña de voz en off y genera el archivo antes de renderizar.' }),
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
      title: tx({ de: `${shortScenes.length} sehr kurze Szene${shortScenes.length > 1 ? 'n' : ''} (<0.2s)`, en: `${shortScenes.length} very short scene${shortScenes.length > 1 ? 'n' : ''} (<0.2s)`, es: `${shortScenes.length} escena muy corta${shortScenes.length > 1 ? 'n' : ''} (<0,2s)` }),
      detail: tx({ de: 'Unter 0.2s wird die Szene im finalen Render kaum sichtbar.', en: 'Below 0.2s, the scene will be barely visible in the final render.', es: 'Por debajo de 0.2s, la escena apenas será visible en el render final.' }),
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
        title: tx({ de: `${bad.length} Untertitel mit schwachem Kontrast`, en: `${bad.length} Low contrast subtitles`, es: `${bad.length} Subtítulos de bajo contraste` }),
        detail: tx({ de: 'Kontrast unter 3:1 → schwer lesbar (WCAG AA erfordert 4.5:1 für Text).', en: 'Contrast below 3:1 → hard to read (WCAG AA requires 4.5:1 for text).', es: 'Contraste inferior a 3:1 → difícil de leer (WCAG AA requiere 4.5:1 para texto).' }),
      });
    }

    // Empty subtitle text
    const empty = input.subtitleClips.filter((c) => !c.text?.trim());
    if (empty.length > 0) {
      findings.push({
        id: 'subtitle-empty',
        severity: 'info',
        title: `${empty.length} leere Untertitel-Clips`,
        hint: tx({ de: 'Diese werden beim Export automatisch entfernt.', en: 'These will be automatically removed upon export.', es: 'Estos se eliminarán automáticamente al exportar.' }),
      });
    }
  }

  // 7. Aspect Ratio present
  if (!input.exportAspectRatio) {
    findings.push({
      id: 'aspect-missing',
      severity: 'warn',
      title: tx({ de: 'Kein Seitenverhältnis gewählt', en: 'No aspect ratio selected', es: 'Ninguna relación de aspecto seleccionada' }),
      hint: tx({ de: "Standardmäßig wird 16:9 verwendet.", en: "By default 16:9 is used.", es: "Por defecto se utiliza 16:9." }),
    });
  }

  // 8. Music without VO ducking hint
  if (input.backgroundMusicUrl && !input.voiceOverUrl) {
    findings.push({
      id: 'music-no-vo',
      severity: 'info',
      title: tx({ de: 'Musik ohne Voice-Over', en: 'Music without voice-over', es: 'Música sin voz en off' }),
      hint: tx({ de: 'Ducking wird nicht angewendet — Musik läuft auf voller (gedämpfter) Lautstärke.', en: 'Ducking not applied — music plays at full (attenuated) volume.', es: 'Ducking no aplicado — la música se reproduce a volumen completo (atenuado).' }),
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
      title: tx({ de: `${mismatched.length} Szene${mismatched.length > 1 ? 'n' : ''} mit abweichendem Seitenverhältnis`, en: `${mismatched.length} scene${mismatched.length > 1 ? 'n' : ''} with mismatched aspect ratio`, es: `${mismatched.length} escena${mismatched.length > 1 ? 'n' : ''} con relación de aspecto no coincidente` }),
      detail: tx({ de: `Projekt rendert in ${targetLabel} — betroffene Szenen werden beschnitten oder mit Letterbox versehen.`, en: `Project renders in ${targetLabel} — affected scenes will be cropped or letterboxed.`, es: `El proyecto se renderiza en ${targetLabel} — las escenas afectadas se recortarán o se les añadirá letterbox.` }),
      hint: tx({ de: "Ersetze Assets oder ändere das Export-Seitenverhältnis passend.", en: "Replace assets or change the export aspect ratio appropriately.", es: "Reemplace los activos o cambie la relación de aspecto de exportación de manera adecuada." }),
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
        title: tx({ de: 'Endcard sehr kurz', en: 'Endcard very short', es: 'Endcard muy corto' }),
        detail: tx({ de: `Letzte Szene ${lastDur.toFixed(2)}s — für Logo, CTA oder Call-out werden 1.5–3s empfohlen.`, en: `Last scene ${lastDur.toFixed(2)}s — 1.5–3s recommended for logo, CTA or call-out.`, es: `Última escena ${lastDur.toFixed(2)}s — se recomiendan 1.5–3s para el logo, CTA o llamada a la acción.` }),
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
        title: tx({ de: 'Mix wirkt zu laut', en: 'Mix seems too loud', es: 'La mezcla parece demasiado ruidosa' }),
        detail: tx({ de: `Musik ${musicVol}% + Voice-Over ${voVol}% überschreiten voraussichtlich -14 LUFS (Social-Standard).`, en: `Music ${musicVol}% + Voice-Over ${voVol}% are expected to exceed -14 LUFS (Social Standard).`, es: `Se espera que la música ${musicVol}% + Voice-Over ${voVol}% excedan los -14 LUFS (Estándar social).` }),
        hint: tx({ de: "Reduziere Musik auf ~40–50% oder aktiviere stärkeres Ducking.", en: "Reduce music to ~40-50% or enable more ducking.", es: "Reduzca la música a ~40-50% o habilite más agacharse." }),
      });
    }
  } else if (hasMusic && !hasVO && musicVol > 85) {
    findings.push({
      id: 'loudness-music',
      severity: 'info',
      title: tx({ de: 'Musik sehr laut', en: 'Music very loud', es: 'Música muy fuerte' }),
      detail: tx({ de: `Musik-Bett auf ${musicVol}% — ohne Ducking kann das im Feed unangenehm knallen.`, en: `Music bed at ${musicVol}% — without ducking, this can be unpleasantly loud in the feed.`, es: `Música de fondo al ${musicVol}% — sin atenuación, esto puede ser desagradablemente ruidoso en el feed.` }),
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
      title: tx({ de: `${missingThumbs.length} Szene${missingThumbs.length > 1 ? 'n' : ''} ohne geladenes Asset`, en: `${missingThumbs.length} scene${missingThumbs.length > 1 ? 'n' : ''} without loaded asset`, es: `${missingThumbs.length} escena${missingThumbs.length > 1 ? 'n' : ''} sin recurso cargado` }),
      detail: tx({ de: "Ohne Thumbnail fehlt beim Render eventuell das zugrundeliegende Video.", en: "Without a thumbnail, the underlying video may be missing from the render.", es: "Sin una miniatura, es posible que el vídeo subyacente no aparezca en el renderizado." }),
      hint: tx({ de: 'Öffne die Szene und lade das Asset neu oder ersetze es.', en: 'Open the scene and reload or replace the asset.', es: 'Abre la escena y recarga o reemplaza el recurso.' }),
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
      title: tx({ de: `${blackRunMax} Blackscreens in Folge`, en: `${blackRunMax} consecutive blackscreens`, es: `${blackRunMax} pantallas negras consecutivas` }),
      hint: tx({ de: 'Meist ein Restartefakt vom Schneiden — zusammenfassen oder entfernen.', en: 'Mostly a leftover artifact from cutting — merge or remove.', es: 'Principalmente un artefacto sobrante del corte — fusionar o eliminar.' }),
    });
  }

  // 14. Social-format hook-fatigue guard — >90s often underperforms in feed
  if (input.totalDuration > 90) {
    findings.push({
      id: 'too-long-for-social',
      severity: 'info',
      title: tx({ de: `Video ${Math.round(input.totalDuration)}s lang`, en: `Video ${Math.round(input.totalDuration)}s long`, es: `Vídeo de ${Math.round(input.totalDuration)} s de duración` }),
      hint: tx({ de: 'Für TikTok / Reels / Shorts liefern 15–60s meist die beste Retention. Nutze Auto Cut-Down für kürzere Varianten.', en: 'For TikTok / Reels / Shorts, 15-60s usually delivers the best retention. Use Auto Cut-Down for shorter versions.', es: 'Para TikTok/Reels/Shorts, entre 15 y 60 años suele ofrecer la mejor retención. Utilice Auto Cut-Down para versiones más cortas.' }),
    });
  }

  return findings;
}

export const preflightBlocks = (findings: PreflightFinding[]) =>
  findings.some((f) => f.severity === 'fail');
