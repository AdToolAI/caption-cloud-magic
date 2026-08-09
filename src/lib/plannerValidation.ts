import { z } from "zod";
import { tx } from "@/lib/i18nText";

// Block validation schema base
const blockSchemaBase = z.object({
  title: z.string().trim().min(1, tx({ de: "Titel erforderlich", en: "Title required", es: "Título requerido" })).max(80, tx({ de: "Max. 80 Zeichen", en: "Max. 80 characters", es: "Máx. 80 caracteres" })),
  caption: z.string().max(2200, tx({ de: "Max. 2200 Zeichen", en: "Max. 2200 characters", es: "Máx. 2200 caracteres" })).optional(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  platform: z.enum(["Instagram", "TikTok", "LinkedIn", "Facebook", "X", "YouTube"]),
  status: z.enum(["draft", "scheduled", "approved", "queued", "posted", "failed"]),
  duration_sec: z.number().positive().optional(),
});

export const blockSchema = blockSchemaBase.refine(
  (data) => new Date(data.end_at) > new Date(data.start_at),
  { message: tx({ de: "Endzeit muss nach Startzeit liegen", en: "End time must be after start time", es: "La hora de finalización debe ser posterior a la de inicio" }), path: ["end_at"] }
);

export const blockSchemaPartial = blockSchemaBase.partial();

export type BlockFormData = z.infer<typeof blockSchema>;

// Platform-specific validation rules
export const platformRules = {
  Instagram: {
    maxVideoDuration: 90, // seconds for Reels
    maxImageSize: 8 * 1024 * 1024, // 8MB
    aspectRatios: ["1:1", "4:5", "9:16"],
  },
  TikTok: {
    maxVideoDuration: 180, // 3 minutes
    maxImageSize: 5 * 1024 * 1024, // 5MB
    aspectRatios: ["9:16"],
  },
  LinkedIn: {
    maxVideoDuration: 600, // 10 minutes
    maxImageSize: 10 * 1024 * 1024, // 10MB
    aspectRatios: ["1:1", "16:9"],
  },
  Facebook: {
    maxVideoDuration: 240, // 4 minutes
    maxImageSize: 10 * 1024 * 1024, // 10MB
    aspectRatios: ["1:1", "16:9", "4:5"],
  },
  X: {
    maxVideoDuration: 140, // 2:20 for free tier
    maxImageSize: 5 * 1024 * 1024, // 5MB
    aspectRatios: ["16:9", "1:1"],
  },
  YouTube: {
    maxVideoDuration: 900, // 15 minutes
    maxImageSize: 2 * 1024 * 1024, // 2MB for thumbnails
    aspectRatios: ["16:9"],
  },
};

// Conflict detection
export interface ConflictRule {
  type: "hard" | "soft";
  message: string;
  severity: "error" | "warning";
}

export function checkBlockConflicts(
  block: any,
  existingBlocks: any[],
  aiRecommendations?: any[]
): ConflictRule[] {
  const conflicts: ConflictRule[] = [];
  const blockStart = new Date(block.start_at);
  const blockEnd = new Date(block.end_at);

  // Hard conflict: Same platform overlap
  const platformConflicts = existingBlocks.filter((b) => {
    if (b.id === block.id) return false;
    if (b.platform !== block.platform) return false;
    
    const bStart = new Date(b.start_at);
    const bEnd = new Date(b.end_at);
    
    return (blockStart < bEnd && blockEnd > bStart);
  });

  if (platformConflicts.length > 0) {
    conflicts.push({
      type: "hard",
      message: `${tx({ de: "Kollision mit", en: "Conflict with", es: "Conflicto con" })} ${platformConflicts.length} ${tx({ de: "anderen", en: "other", es: "otras" })} ${block.platform}-Posts`,
      severity: "error",
    });
  }

  // Soft warning: Outside best time
  if (aiRecommendations) {
    const dayRecommendations = aiRecommendations.find((r: any) => {
      const recDate = new Date(r.date);
      return recDate.toDateString() === blockStart.toDateString();
    });

    if (dayRecommendations) {
      const inOptimalSlot = dayRecommendations.slots?.some((slot: any) => {
        const slotStart = new Date(slot.start);
        const slotEnd = new Date(slot.end);
        return blockStart >= slotStart && blockStart < slotEnd && (slot.score || 0) >= 60;
      });

      if (!inOptimalSlot) {
        conflicts.push({
          type: "soft",
          message: tx({ de: "Außerhalb der empfohlenen Posting-Zeiten", en: "Outside the recommended posting times", es: "Fuera de los horarios de publicación recomendados" }),
          severity: "warning",
        });
      }
    }
  }

  // Soft warning: Duration exceeds platform limits
  const duration = (blockEnd.getTime() - blockStart.getTime()) / 1000;
  const platformRule = platformRules[block.platform as keyof typeof platformRules];
  
  if (platformRule && duration > platformRule.maxVideoDuration) {
    conflicts.push({
      type: "soft",
      message: `${tx({ de: "Dauer", en: "Duration", es: "Duración" })} (${Math.round(duration)}s) ${tx({ de: "überschreitet", en: "exceeds", es: "supera" })} ${block.platform}-${tx({ de: "Limit", en: "limit", es: "límite" })} (${platformRule.maxVideoDuration}s)`,
      severity: "warning",
    });
  }

  // Soft warning: Too many posts per day
  const sameDay = existingBlocks.filter((b) => {
    const bDate = new Date(b.start_at);
    return bDate.toDateString() === blockStart.toDateString();
  });

  if (sameDay.length >= 5) {
    conflicts.push({
      type: "soft",
      message: `${tx({ de: "Bereits", en: "Already", es: "Ya hay" })} ${sameDay.length} ${tx({ de: "Posts an diesem Tag geplant", en: "posts scheduled for this day", es: "publicaciones programadas para este día" })}`,
      severity: "warning",
    });
  }

  return conflicts;
}

// Time validation helpers
export function snapToNearestSlot(date: Date, slotMinutes: number = 15): Date {
  const snapped = new Date(date);
  const minutes = snapped.getMinutes();
  const remainder = minutes % slotMinutes;
  
  if (remainder !== 0) {
    if (remainder < slotMinutes / 2) {
      snapped.setMinutes(minutes - remainder);
    } else {
      snapped.setMinutes(minutes + (slotMinutes - remainder));
    }
  }
  
  snapped.setSeconds(0, 0);
  return snapped;
}

export function isWorkingHours(date: Date): boolean {
  const hour = date.getHours();
  return hour >= 8 && hour < 22;
}