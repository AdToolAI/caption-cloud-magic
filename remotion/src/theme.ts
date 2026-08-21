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

export const SUB_TIMINGS: { from: number; to: number }[] = [
  { from: 21, to: 80 },
  { from: 87, to: 218 },
  { from: 226, to: 313 },
  { from: 321, to: 484 },
  { from: 491, to: 601 },
  { from: 609, to: 726 },
  { from: 733, to: 802 },
  { from: 809, to: 901 },
];
