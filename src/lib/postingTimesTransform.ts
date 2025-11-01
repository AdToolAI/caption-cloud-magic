import { PostingTimesData } from "@/hooks/usePostingTimes";

/**
 * Transforms posting-times-api response to heatmap format
 * @param data API response with platforms and slots
 * @param days Number of days to include (7 or 14)
 * @returns Record of platform to 7x24 or 14x24 matrix
 */
export function transformPostingSlotsToHeatmap(
  data: PostingTimesData | undefined,
  days: number = 7
): Record<string, number[][]> {
  if (!data || !data.platforms) {
    return {};
  }

  const result: Record<string, number[][]> = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Process each platform
  for (const [platform, platformDays] of Object.entries(data.platforms)) {
    // Initialize 7x24 or 14x24 matrix with zeros
    const matrix: number[][] = Array.from({ length: days }, () => 
      Array(24).fill(0)
    );

    // Build a map of date -> slots for quick lookup
    const dateSlotMap = new Map<string, typeof platformDays[0]['slots']>();
    platformDays.forEach(day => {
      dateSlotMap.set(day.date, day.slots);
    });

    // Fill matrix with scores
    for (let dayOffset = 0; dayOffset < days; dayOffset++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + dayOffset);
      const dateStr = targetDate.toISOString().split('T')[0];
      
      const slots = dateSlotMap.get(dateStr);
      
      if (slots && slots.length > 0) {
        // For each hour, find the highest score from slots overlapping that hour
        for (let hour = 0; hour < 24; hour++) {
          let maxScore = 0;
          
          slots.forEach(slot => {
            try {
              // Robustere Zeitstempel-Parsing mit Fallback
              const slotStart = new Date(slot.start);
              const slotEnd = new Date(slot.end);
              
              // Fallback: Wenn ungültige Timestamps, nutze getHours() direkt
              if (isNaN(slotStart.getTime()) || isNaN(slotEnd.getTime())) {
                console.warn('[Transform] Invalid timestamps:', slot);
                return;
              }
              
              // Einfachere Logik: Prüfe ob Slot-Stunde mit aktueller Stunde übereinstimmt
              const slotStartHour = slotStart.getHours();
              const slotEndHour = slotEnd.getHours();
              
              // Slot liegt in dieser Stunde oder überspannt sie
              if (
                (hour >= slotStartHour && hour < slotEndHour) || // Normaler Fall
                (slotStartHour === hour) || // Slot startet in dieser Stunde
                (slotEndHour > hour && slotStartHour < hour) // Slot überspannt diese Stunde
              ) {
                maxScore = Math.max(maxScore, slot.score);
              }
            } catch (error) {
              console.error('[Transform] Error parsing slot:', error, slot);
            }
          });
          
          matrix[dayOffset][hour] = Math.round(maxScore);
        }
      }
    }

    result[platform] = matrix;
  }

  return result;
}
