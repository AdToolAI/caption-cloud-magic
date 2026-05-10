// Phase 6.3 — Editorial Collections für Stock Video Hub.
// Jede Collection ist eine kuratierte Suchanfrage mit Filtern, die in der UI als Hero-Karte angezeigt wird.

export interface StockVideoCollection {
  id: string;
  title: string;
  description: string;
  query: string;
  filters?: {
    orientation?: "landscape" | "portrait" | "square";
    min_quality?: "hd" | "4k";
    min_fps?: number;
    max_duration?: number;
    min_duration?: number;
  };
  gradient: string; // tailwind gradient classes
  emoji: string;
}

export const STOCK_VIDEO_COLLECTIONS: StockVideoCollection[] = [
  {
    id: "cinematic-drone",
    title: "Cinematic Drone",
    description: "Sweeping aerial shots — coastlines, mountains, cities from above",
    query: "drone aerial cinematic",
    filters: { orientation: "landscape", min_quality: "hd" },
    gradient: "from-amber-500/40 via-orange-600/20 to-transparent",
    emoji: "🚁",
  },
  {
    id: "luxury-lifestyle",
    title: "Luxury Lifestyle",
    description: "Premium, editorial shots — yachts, fine dining, fashion",
    query: "luxury lifestyle elegant",
    filters: { min_quality: "hd" },
    gradient: "from-yellow-500/40 via-amber-600/20 to-transparent",
    emoji: "✨",
  },
  {
    id: "tech-ai",
    title: "Tech & AI",
    description: "Server rooms, code, holograms, futuristic interfaces",
    query: "technology computer code futuristic",
    filters: { min_quality: "hd" },
    gradient: "from-cyan-500/40 via-blue-600/20 to-transparent",
    emoji: "🤖",
  },
  {
    id: "nature-macro",
    title: "Nature Macro",
    description: "Detailed close-ups — water droplets, leaves, flowers",
    query: "macro nature slow motion",
    filters: { min_quality: "hd" },
    gradient: "from-emerald-500/40 via-green-600/20 to-transparent",
    emoji: "🌿",
  },
  {
    id: "urban-night",
    title: "Urban Night",
    description: "City lights, neon signs, traffic flow at night",
    query: "city night neon traffic",
    filters: { min_quality: "hd" },
    gradient: "from-fuchsia-500/40 via-purple-600/20 to-transparent",
    emoji: "🌃",
  },
  {
    id: "product-hero",
    title: "Product Hero",
    description: "Studio shots, rotating products, isolated backgrounds",
    query: "product studio rotation",
    filters: { min_quality: "hd" },
    gradient: "from-rose-500/40 via-pink-600/20 to-transparent",
    emoji: "📦",
  },
];
