

## Plan: Trend Radar — Professional Media-Rich Redesign

### Problem
The current Trend Radar uses plain CSS gradient backgrounds (purple, pink, orange) on trend cards and the hero carousel. It looks generic and dated — no real images, no media previews, no visual richness. A professional social media tool should be visually immersive.

### Vision
Transform the Trend Radar into a media-rich, visually stunning experience using **real imagery** from Unsplash (free API, no key needed for `source.unsplash.com`), platform-authentic design patterns, and cinematic visual effects.

### Changes

#### 1. New Component: `TrendCardMedia.tsx`
A reusable component that generates rich visual backgrounds for each trend card:
- **Dynamic Unsplash images** based on trend category/keywords (e.g., `source.unsplash.com/400x200/?fitness,workout` for fitness trends)
- Keyword mapping: category → relevant photo search terms (social-media → "phone,content", ecommerce → "product,shopping", lifestyle → "wellness,nature", business → "office,technology", finance → "investment,money", motivation → "success,mountains")
- **Glassmorphism overlay** with gradient from platform color (subtle tint, not full solid)
- **Lazy loading** with skeleton shimmer while images load
- Fallback to current gradient if image fails

#### 2. Redesigned Trend Cards (`TrendRadar.tsx` — card section)
Each card gets a cinematic makeover:
- **Taller image header** (h-20 → h-40): Full bleed Unsplash image with dark gradient overlay from bottom
- **Platform badge** redesigned: Actual platform logo-style icon (Instagram gradient circle, TikTok vibrating logo, YouTube play button) instead of plain text
- **Popularity as a glowing arc/ring** instead of just a number — a small SVG donut chart with glow
- **Hover effect**: Image zooms slightly (scale 1.05), card lifts with cinematic shadow
- **"HOT" badge**: Animated fire gradient border instead of red pill
- **Category tag** with subtle icon and frosted glass background
- Card background: Very subtle frosted glass with image reflection/blur behind

#### 3. Redesigned Hero Carousel
- **Full-width cinematic hero** with Unsplash background image per trend
- **Ken Burns effect**: Slow zoom/pan animation on the background image
- **Split layout**: Image on right (60%), content on left (40%) with glassmorphism panel
- **Video preview indicator**: If trend has video content ideas, show a subtle play button overlay
- **Progress bar** at bottom showing auto-advance timing (like Instagram Stories)
- Platform-colored accent line at bottom instead of full gradient

#### 4. Niche Category Cards Enhancement
- Replace emoji-only icons with **Unsplash micro-thumbnails** (tiny 48x48 images) + icon overlay
- Active state: Image becomes full-color, inactive: grayscale with subtle tint
- Hover: Image pans slightly, border glows

#### 5. Visual Polish (James Bond 2028)
- **Scanline overlay** on hero images (subtle horizontal lines like a premium display)
- **Gold/cyan accent lighting**: Thin glowing lines framing key sections
- **Particle/noise texture** overlay on dark sections for depth
- **Typography**: Trend names in `font-display` (Playfair Display) for headlines
- **Micro-interactions**: Card flip has a brief light flash, bookmark adds a pulse ring

#### 6. Stats Section Enhancement
- Add mini Unsplash background thumbnails behind each stat card (blurred, 10% opacity)
- Stat numbers use `font-display` with subtle text-shadow glow

### Technical Approach
- Use `https://images.unsplash.com/photo-{id}?w=400&h=200&fit=crop` for deterministic images, or `source.unsplash.com/{w}x{h}/?{keywords}` for dynamic ones
- Image loading state managed per-card with `onLoad`/`onError` handlers
- CSS `object-fit: cover` for consistent image sizing
- All images get `loading="lazy"` for performance
- Keyword mapping as a simple utility function

### Files to Create
- `src/components/trends/TrendCardMedia.tsx` — Image/media background component

### Files to Edit
- `src/pages/TrendRadar.tsx` — Major card and carousel redesign
- `src/components/trends/TrendRadarHeroHeader.tsx` — Minor polish

### Scope
This is a significant visual overhaul but stays within existing data structures. No database or edge function changes needed. All image sourcing uses free Unsplash URLs (no API key required).

