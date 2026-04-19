// Shared slot scoring engine — mirrors PLATFORM_PEAKS from posting-times-api
// so generate-week-strategy can pick deterministic, score-backed posting slots
// without an extra HTTP call.

export type Lang = "en" | "de" | "es";

interface PlatformPeak {
  hour: number;
  dayTypes: Array<"all" | "weekday" | "weekend" | "tue-thu">;
  score: number;
  reasonKey: string;
}

export interface ScoredSlot {
  date: string;        // YYYY-MM-DD
  hour: number;        // 0-23
  isoStart: string;    // full ISO timestamp
  platform: string;
  score: number;
  reasons: string[];
}

const PLATFORM_PEAKS: Record<string, PlatformPeak[]> = {
  instagram: [
    { hour: 11, dayTypes: ["weekday"], score: 85, reasonKey: "lunch_break_high" },
    { hour: 14, dayTypes: ["weekday"], score: 80, reasonKey: "afternoon_engagement" },
    { hour: 19, dayTypes: ["all"], score: 90, reasonKey: "prime_time_evening" },
    { hour: 21, dayTypes: ["weekend"], score: 88, reasonKey: "weekend_relaxation" },
    { hour: 9, dayTypes: ["weekday"], score: 65, reasonKey: "morning_check" },
    { hour: 13, dayTypes: ["weekday"], score: 70, reasonKey: "lunch_break" },
    { hour: 17, dayTypes: ["weekday"], score: 68, reasonKey: "end_of_work" },
    { hour: 20, dayTypes: ["all"], score: 72, reasonKey: "evening_relaxation" },
  ],
  tiktok: [
    { hour: 18, dayTypes: ["all"], score: 88, reasonKey: "after_work_school" },
    { hour: 21, dayTypes: ["all"], score: 92, reasonKey: "evening_peak" },
    { hour: 12, dayTypes: ["weekend"], score: 85, reasonKey: "weekend_lunch" },
    { hour: 16, dayTypes: ["weekday"], score: 70, reasonKey: "afternoon_scroll" },
    { hour: 19, dayTypes: ["weekday"], score: 75, reasonKey: "early_evening" },
    { hour: 22, dayTypes: ["weekend"], score: 68, reasonKey: "late_night" },
  ],
  linkedin: [
    { hour: 8, dayTypes: ["tue-thu"], score: 87, reasonKey: "early_business" },
    { hour: 12, dayTypes: ["weekday"], score: 85, reasonKey: "lunch_break" },
    { hour: 17, dayTypes: ["weekday"], score: 83, reasonKey: "end_of_work" },
    { hour: 9, dayTypes: ["weekday"], score: 72, reasonKey: "work_start" },
    { hour: 14, dayTypes: ["weekday"], score: 65, reasonKey: "afternoon" },
    { hour: 16, dayTypes: ["weekday"], score: 70, reasonKey: "late_afternoon" },
  ],
  x: [
    { hour: 9, dayTypes: ["weekday"], score: 83, reasonKey: "morning_commute" },
    { hour: 13, dayTypes: ["weekday"], score: 80, reasonKey: "noon_hour" },
    { hour: 17, dayTypes: ["weekday"], score: 86, reasonKey: "evening_commute" },
    { hour: 8, dayTypes: ["weekday"], score: 70, reasonKey: "early_morning" },
    { hour: 12, dayTypes: ["weekday"], score: 72, reasonKey: "noon" },
    { hour: 19, dayTypes: ["all"], score: 75, reasonKey: "evening" },
  ],
  facebook: [
    { hour: 13, dayTypes: ["weekday"], score: 82, reasonKey: "noon_check" },
    { hour: 19, dayTypes: ["all"], score: 85, reasonKey: "evening_relaxation" },
    { hour: 21, dayTypes: ["weekend"], score: 88, reasonKey: "weekend_social" },
    { hour: 11, dayTypes: ["weekday"], score: 68, reasonKey: "morning" },
    { hour: 15, dayTypes: ["weekday"], score: 65, reasonKey: "afternoon_break" },
    { hour: 20, dayTypes: ["all"], score: 70, reasonKey: "evening_time" },
  ],
  youtube: [
    { hour: 14, dayTypes: ["weekend"], score: 88, reasonKey: "weekend_afternoon" },
    { hour: 20, dayTypes: ["all"], score: 90, reasonKey: "prime_video" },
    { hour: 12, dayTypes: ["weekday"], score: 75, reasonKey: "lunch_entertainment" },
    { hour: 18, dayTypes: ["all"], score: 78, reasonKey: "after_work_video" },
    { hour: 22, dayTypes: ["all"], score: 70, reasonKey: "late_night_video" },
    { hour: 15, dayTypes: ["weekend"], score: 72, reasonKey: "afternoon" },
  ],
};

// twitter is an alias for x
PLATFORM_PEAKS.twitter = PLATFORM_PEAKS.x;

const REASON_LABELS: Record<string, Record<Lang, string>> = {
  lunch_break_high: { en: "Lunch break – high engagement", de: "Mittagspause – hohes Engagement", es: "Hora de almuerzo – alta interacción" },
  afternoon_engagement: { en: "Afternoon engagement window", de: "Engagement-Fenster am Nachmittag", es: "Ventana de interacción de tarde" },
  prime_time_evening: { en: "Prime time – evening", de: "Prime-Time am Abend", es: "Hora pico – tarde" },
  weekend_relaxation: { en: "Weekend relax mode", de: "Entspanntes Wochenende", es: "Relax de fin de semana" },
  morning_check: { en: "Morning check-in", de: "Morgendlicher Check", es: "Revisión matutina" },
  lunch_break: { en: "Lunch break", de: "Mittagspause", es: "Hora de almuerzo" },
  end_of_work: { en: "End of work day", de: "Feierabend", es: "Fin de jornada" },
  evening_relaxation: { en: "Evening wind-down", de: "Abendliche Entspannung", es: "Descanso de la tarde" },
  after_work_school: { en: "After work / school", de: "Nach Arbeit / Schule", es: "Después del trabajo / escuela" },
  evening_peak: { en: "Evening peak", de: "Abendlicher Peak", es: "Pico de la tarde" },
  weekend_lunch: { en: "Weekend lunch scroll", de: "Wochenend-Mittagszeit", es: "Almuerzo de fin de semana" },
  afternoon_scroll: { en: "Afternoon scrolling", de: "Nachmittag-Scrolling", es: "Scroll de tarde" },
  early_evening: { en: "Early evening", de: "Früher Abend", es: "Inicio de tarde" },
  late_night: { en: "Late night audience", de: "Nachteulen-Publikum", es: "Audiencia nocturna" },
  early_business: { en: "Early business hours", de: "Früher Geschäftsbeginn", es: "Horario laboral temprano" },
  work_start: { en: "Work start", de: "Arbeitsbeginn", es: "Inicio del trabajo" },
  afternoon: { en: "Afternoon", de: "Nachmittag", es: "Tarde" },
  late_afternoon: { en: "Late afternoon", de: "Später Nachmittag", es: "Tarde noche" },
  morning_commute: { en: "Morning commute", de: "Morgendlicher Pendelverkehr", es: "Viaje matutino" },
  noon_hour: { en: "Noon hour", de: "Mittagsstunde", es: "Hora del mediodía" },
  evening_commute: { en: "Evening commute", de: "Abendlicher Pendelverkehr", es: "Viaje vespertino" },
  early_morning: { en: "Early morning", de: "Früher Morgen", es: "Madrugada" },
  noon: { en: "Noon", de: "Mittag", es: "Mediodía" },
  evening: { en: "Evening", de: "Abend", es: "Tarde" },
  noon_check: { en: "Noon check", de: "Mittags-Check", es: "Revisión de mediodía" },
  weekend_social: { en: "Weekend social time", de: "Wochenend-Social-Time", es: "Tiempo social de fin de semana" },
  morning: { en: "Morning", de: "Morgen", es: "Mañana" },
  afternoon_break: { en: "Afternoon break", de: "Nachmittagspause", es: "Descanso de tarde" },
  evening_time: { en: "Evening time", de: "Abendzeit", es: "Hora de la tarde" },
  weekend_afternoon: { en: "Weekend afternoon", de: "Wochenend-Nachmittag", es: "Tarde de fin de semana" },
  prime_video: { en: "Prime video time", de: "Prime-Video-Zeit", es: "Hora pico de video" },
  lunch_entertainment: { en: "Lunch entertainment", de: "Mittags-Unterhaltung", es: "Entretenimiento de almuerzo" },
  after_work_video: { en: "After-work video", de: "Feierabend-Video", es: "Video tras el trabajo" },
  late_night_video: { en: "Late night video", de: "Spätabend-Video", es: "Video nocturno" },
};

function getDayType(date: Date): string {
  const day = date.getDay();
  if (day === 0 || day === 6) return "weekend";
  if (day >= 2 && day <= 4) return "tue-thu";
  return "weekday";
}

function localizeReason(key: string, lang: Lang): string {
  const entry = REASON_LABELS[key];
  return entry ? entry[lang] || entry.en : key;
}

/**
 * For a given platform + week range, return all candidate slots scored.
 */
export function scoreSlotsForPlatform(
  platform: string,
  weekDates: string[], // YYYY-MM-DD
  lang: Lang = "en",
): ScoredSlot[] {
  const peaks = PLATFORM_PEAKS[platform.toLowerCase()];
  if (!peaks) return [];

  const out: ScoredSlot[] = [];
  for (const dateStr of weekDates) {
    const date = new Date(`${dateStr}T00:00:00`);
    const dayType = getDayType(date);
    for (const peak of peaks) {
      const applies = peak.dayTypes.includes("all") || peak.dayTypes.includes(dayType as any);
      if (!applies) continue;
      const slotDate = new Date(date);
      slotDate.setHours(peak.hour, 0, 0, 0);
      out.push({
        date: dateStr,
        hour: peak.hour,
        isoStart: slotDate.toISOString(),
        platform: platform.toLowerCase(),
        score: peak.score,
        reasons: [localizeReason(peak.reasonKey, lang)],
      });
    }
  }
  return out;
}

/**
 * Deterministic slot picker.
 *
 * Distributes `count` posts across the 7-day week using the highest-scored
 * slot per (date, platform). Avoids duplicate (date, hour, platform) and
 * spreads platforms across days when multiple are available.
 */
export function pickWeekSlots(
  platforms: string[],
  weekDates: string[],
  count: number,
  lang: Lang = "en",
): ScoredSlot[] {
  if (platforms.length === 0 || weekDates.length === 0 || count <= 0) return [];

  // Build all candidate slots, grouped per date.
  const slotsByDate: Record<string, ScoredSlot[]> = {};
  for (const date of weekDates) slotsByDate[date] = [];
  for (const platform of platforms) {
    const platformSlots = scoreSlotsForPlatform(platform, weekDates, lang);
    for (const s of platformSlots) {
      slotsByDate[s.date].push(s);
    }
  }
  // Sort each day's slots by score desc.
  for (const d of weekDates) {
    slotsByDate[d].sort((a, b) => b.score - a.score);
  }

  const picked: ScoredSlot[] = [];
  const usedKeys = new Set<string>();
  // Round-robin: choose evenly spread day indices.
  // For count=3 across 7 days: pick day 0, 3, 5 etc.
  const dayIndices: number[] = [];
  const step = weekDates.length / count;
  for (let i = 0; i < count; i++) {
    dayIndices.push(Math.min(weekDates.length - 1, Math.round(i * step)));
  }

  let platformCursor = 0;
  for (let i = 0; i < count; i++) {
    const dayIdx = dayIndices[i];
    const date = weekDates[dayIdx];
    // Prefer slots from the current platform in rotation, but fall back to any.
    const preferredPlatform = platforms[platformCursor % platforms.length].toLowerCase();
    platformCursor++;

    const candidates = slotsByDate[date] || [];
    let chosen: ScoredSlot | null = null;
    // 1st pass — preferred platform, unused.
    for (const c of candidates) {
      const key = `${c.date}|${c.hour}|${c.platform}`;
      if (c.platform === preferredPlatform && !usedKeys.has(key)) {
        chosen = c;
        break;
      }
    }
    // 2nd pass — any platform, unused.
    if (!chosen) {
      for (const c of candidates) {
        const key = `${c.date}|${c.hour}|${c.platform}`;
        if (!usedKeys.has(key)) {
          chosen = c;
          break;
        }
      }
    }
    // 3rd pass — search neighbouring days if nothing free here.
    if (!chosen) {
      for (let off = 1; off < weekDates.length && !chosen; off++) {
        for (const dir of [-1, 1]) {
          const idx = dayIdx + dir * off;
          if (idx < 0 || idx >= weekDates.length) continue;
          const altDate = weekDates[idx];
          const altCandidates = slotsByDate[altDate] || [];
          for (const c of altCandidates) {
            const key = `${c.date}|${c.hour}|${c.platform}`;
            if (!usedKeys.has(key)) {
              chosen = c;
              break;
            }
          }
          if (chosen) break;
        }
      }
    }
    if (!chosen) continue;
    usedKeys.add(`${chosen.date}|${chosen.hour}|${chosen.platform}`);
    picked.push(chosen);
  }

  // Sort picked slots chronologically.
  picked.sort((a, b) => a.isoStart.localeCompare(b.isoStart));
  return picked;
}

/**
 * Score a single slot (used to warn the user when they manually move a post).
 */
export function scoreSingleSlot(
  platform: string,
  isoStart: string,
  lang: Lang = "en",
): { score: number; reasons: string[] } {
  const peaks = PLATFORM_PEAKS[platform.toLowerCase()];
  if (!peaks) return { score: 0, reasons: [] };
  const date = new Date(isoStart);
  const hour = date.getHours();
  const dayType = getDayType(date);
  let best: PlatformPeak | null = null;
  for (const p of peaks) {
    const applies = p.dayTypes.includes("all") || p.dayTypes.includes(dayType as any);
    if (!applies) continue;
    if (p.hour === hour) {
      if (!best || p.score > best.score) best = p;
    }
  }
  if (best) {
    return { score: best.score, reasons: [localizeReason(best.reasonKey, lang)] };
  }
  // Hour doesn't match any peak — find nearest peak within ±2h, decay score.
  let nearest: PlatformPeak | null = null;
  let nearestDist = 99;
  for (const p of peaks) {
    const applies = p.dayTypes.includes("all") || p.dayTypes.includes(dayType as any);
    if (!applies) continue;
    const dist = Math.abs(p.hour - hour);
    if (dist < nearestDist) {
      nearest = p;
      nearestDist = dist;
    }
  }
  if (!nearest) return { score: 30, reasons: [] };
  const decay = Math.max(0, 1 - nearestDist * 0.15);
  return {
    score: Math.max(20, Math.round(nearest.score * decay)),
    reasons: [],
  };
}
