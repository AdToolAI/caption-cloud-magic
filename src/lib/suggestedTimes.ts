/**
 * Get suggested posting times based on platform and current time
 * Based on general social media best practices
 */

interface TimeSlot {
  hour: number;
  minute: number;
  label: string;
}

const platformTimes: Record<string, TimeSlot[]> = {
  instagram: [
    { hour: 11, minute: 0, label: '11:00 AM - Morning engagement' },
    { hour: 14, minute: 0, label: '2:00 PM - Lunch break' },
    { hour: 19, minute: 0, label: '7:00 PM - Evening peak' },
  ],
  tiktok: [
    { hour: 9, minute: 0, label: '9:00 AM - Morning commute' },
    { hour: 12, minute: 0, label: '12:00 PM - Lunch time' },
    { hour: 19, minute: 0, label: '7:00 PM - After work' },
  ],
  linkedin: [
    { hour: 8, minute: 0, label: '8:00 AM - Start of workday' },
    { hour: 12, minute: 0, label: '12:00 PM - Lunch break' },
    { hour: 17, minute: 0, label: '5:00 PM - End of workday' },
  ],
  facebook: [
    { hour: 13, minute: 0, label: '1:00 PM - Early afternoon' },
    { hour: 15, minute: 0, label: '3:00 PM - Mid afternoon' },
    { hour: 20, minute: 0, label: '8:00 PM - Evening' },
  ],
  x: [
    { hour: 9, minute: 0, label: '9:00 AM - Morning news' },
    { hour: 12, minute: 0, label: '12:00 PM - Lunch browsing' },
    { hour: 17, minute: 0, label: '5:00 PM - Evening check' },
  ],
};

/**
 * Get the next suggested posting time for a platform
 */
export function getNextSuggestedTime(platform: string): { time: string; label: string } {
  const platformKey = platform.toLowerCase();
  const times = platformTimes[platformKey] || platformTimes.instagram;
  
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  // Find the next time slot after current time
  for (const slot of times) {
    if (slot.hour > currentHour || (slot.hour === currentHour && slot.minute > currentMinute)) {
      const timeString = `${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')}`;
      return { time: timeString, label: slot.label };
    }
  }
  
  // If no future time today, return first slot for tomorrow
  const firstSlot = times[0];
  const timeString = `${String(firstSlot.hour).padStart(2, '0')}:${String(firstSlot.minute).padStart(2, '0')}`;
  return { time: timeString, label: firstSlot.label + ' (tomorrow)' };
}

/**
 * Get all suggested times for a platform
 */
export function getAllSuggestedTimes(platform: string): Array<{ time: string; label: string }> {
  const platformKey = platform.toLowerCase();
  const times = platformTimes[platformKey] || platformTimes.instagram;
  
  return times.map(slot => ({
    time: `${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')}`,
    label: slot.label,
  }));
}

/**
 * Get suggested date (today or tomorrow based on time)
 */
export function getSuggestedDate(time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const now = new Date();
  const suggested = new Date();
  
  suggested.setHours(hours, minutes, 0, 0);
  
  // If the time has passed today, suggest tomorrow
  if (suggested <= now) {
    suggested.setDate(suggested.getDate() + 1);
  }
  
  return suggested;
}
