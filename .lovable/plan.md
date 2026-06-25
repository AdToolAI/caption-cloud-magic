## Fix: Hailuo Pro + 6s wird still auf 10s gebumpt → API-Crash

### Root Cause (bestätigt)
`src/components/video-composer/SceneDialogStudio.tsx` Zeilen 1270–1292:
```ts
const audioRequired = Math.ceil(synthed.reduce(...) + gaps + 0.4);
const userPick = Number(scene.durationSeconds || 6);
const target = Math.max(userPick, audioRequired);   // ⚠ ignoriert User-Pick wenn VO länger
const masterDuration = masterProvider === 'ai-happyhorse'
  ? Math.min(15, Math.max(3, Math.ceil(target)))
  : target <= 6 ? 6 : 10;                            // ⚠ Hailuo: alles >6 → 10
```
Du wählst 6s + Pro → Dialog-VO ist z.B. 6.4s → `target=7` → `masterDuration=10` → Hailuo Pro 1080p × 10s → API E006 "10 seconds is only available for 768p resolution" → Szene fehlgeschlagen.

### Fix 1 — User-Dauer strikt respektieren (Frontend)
`src/components/video-composer/SceneDialogStudio.tsx`

```ts
// Hailuo: respect user pick (6 or 10); never silently bump because audio is longer.
// Sync.so cut_off trims overflow — same policy as the backend uses since June 2026.
const masterDuration =
  masterProvider === 'ai-happyhorse'
    ? Math.min(15, Math.max(3, Math.ceil(userPick)))      // HH: 3–15s nativ
    : (userPick >= 10 ? 10 : 6);                          // Hailuo: nur was der User gewählt hat

if (masterProvider === 'ai-hailuo' && audioRequired > masterDuration) {
  toast({
    title: 'Dialog länger als Szene',
    description: `Audio braucht ~${audioRequired}s, Szene ist ${masterDuration}s. Sync.so kürzt am Ende (cut_off). Für vollen Dialog Hailuo auf 10s setzen oder HappyHorse nutzen.`,
  });
}
```

Damit gilt: **6s gewählt ⇒ 6s gerendert. Immer.**

### Fix 2 — Hailuo Pro+10s Backend Safety Net
`supabase/functions/compose-video-clips/index.ts` Zeile 2467–2468:

```ts
const duration = scene.durationSeconds >= 8 ? 10 : 6;
// Hailuo API: 1080p nur bei 6s. Bei 10s zwingend 768p.
const resolution =
  duration === 10 ? "768p" : (quality === "pro" ? "1080p" : "768p");

if (quality === "pro" && duration === 10) {
  console.warn(
    `[compose-video-clips] Hailuo Pro+10s API-inkompatibel — Auflösung 768p (Scene ${scene.id}).`,
  );
}
```

So wird auch ein manueller Pro+10s-Pick nie wieder hart abbrechen.

### Fix 3 — UI-Hinweis (klein, optional)
`src/components/video-composer/SceneCard.tsx` beim Hailuo-Dauer-Picker, wenn `clipQuality==='pro' && duration===10`:
> *„10s bei Hailuo nur in 768p verfügbar — Pro wird auf Standard-Auflösung reduziert."*

### Bewusst NICHT angefasst
- Lip-Sync Policy (HappyHorse primär / Hailuo Fallback)
- Cinematic-Sync, Sync.so, Anchor-Audit, Cast-Resolver, Audio-Plan
- HappyHorse-Pfad (3–15s nativ — funktioniert)
- DB-Schema, keine Migration

### Verhalten nach Fix
| Szenario | Vorher | Nachher |
|---|---|---|
| Hailuo Pro + 6s, Dialog 6.4s | bump→10s + 1080p ⇒ **API-Fail** | bleibt **6s + 1080p OK**, Toast |
| Hailuo Std + 6s, Dialog 7s | bump→10s, Std OK | bleibt 6s, Sync.so cut_off, Toast |
| Hailuo Pro + 10s (manuell) | 1080p ⇒ **API-Fail** | 768p mit Warn-Log |
| HappyHorse + 6s | 6s | 6s (unverändert) |
