/**
 * Calendar Prefill Data Interface
 * Used for transferring post data from AI Post Generator to Quick Schedule Form
 */
export interface CalendarPrefillData {
  title?: string;
  caption: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  platforms: string[];
  hashtags?: string[];
  hook?: string;
  timestamp: number;
}
