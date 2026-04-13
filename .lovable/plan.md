

## Plan: Fix Broken Images — Replace Deprecated Unsplash Source

### Problem
`source.unsplash.com` was shut down in 2023. All image URLs in `TrendCardMedia.tsx` return errors, triggering the gradient fallback every time. No real images ever appear.

### Solution
Replace with **Picsum Photos** (`picsum.photos`) — a free, no-API-key image service that actually works. Use deterministic seed-based URLs so each card gets a consistent, unique image.

### Changes in `src/components/trends/TrendCardMedia.tsx`

Replace the `getImageUrl` function:

```typescript
// OLD (broken):
// return `https://source.unsplash.com/600x400/?${keywords}&sig=${seed}`;

// NEW (working):
function getImageUrl(category: string, index: number): string {
  const seed = index * 137 + (category?.length || 5) * 31;
  return `https://picsum.photos/seed/${category}-${seed}/600/400`;
}
```

This gives:
- **Deterministic images** — same seed = same photo every time
- **Category-varied** — different categories get different photos
- **Reliable loading** — Picsum is actively maintained and fast
- **No API key needed**

### Files to Edit
- `src/components/trends/TrendCardMedia.tsx` — Update `getImageUrl` function (2 lines changed)

### Result
Real photographs will appear on all trend cards and the hero carousel immediately.

