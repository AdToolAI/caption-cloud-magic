export const GOLD = "#F5C76A";
export const GOLD_SOFT = "#E8B75A";
export const CYAN = "#7FD4E8";
export const INK = "#050816";
export const CREAM = "#F4EFE6";

export const SCENES = {
  title: { from: 0, duration: 84 },
  home: { from: 84, duration: 138 },
  text: { from: 222, duration: 90 },
  motion: { from: 312, duration: 98 },
  video: { from: 410, duration: 80 },
  library: { from: 490, duration: 110 },
  calendar: { from: 600, duration: 128 },
  analytics: { from: 728, duration: 78 },
  end: { from: 806, duration: 106 },
} as const;

export const SUBTITLES: { from: number; to: number; text: string }[] = [
  { from: 21, to: 80, text: "One creator. A whole studio." },
  { from: 87, to: 218, text: "AdTool AI brings every leading AI model into one continuous workflow." },
  { from: 226, to: 313, text: "Write campaign copy with premium reasoning models." },
  { from: 321, to: 484, text: "Direct cinematic video in Motion Studio — cast, location, storyboard, render." },
  { from: 491, to: 601, text: "Build a consistent cast that stays recognizable in every scene." },
  { from: 609, to: 726, text: "Schedule and publish across every platform from one command center." },
  { from: 733, to: 802, text: "Then measure what actually performs." },
  { from: 809, to: 901, text: "AdTool AI. Your whole studio, in one place." },
];
