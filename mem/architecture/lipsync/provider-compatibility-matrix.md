---
name: Lipsync Provider Compatibility Matrix
description: Welche Video-Provider arbeiten zuverlässig mit welcher Lip-Sync-Engine (HeyGen, Cinematic-Sync/Sync-Segments, Sync-Polish, B-Roll)
type: feature
---

# Lip-Sync × Video-Provider Kompatibilität

Die Lipsync-Pipeline ist NICHT mit jedem Provider gleichwertig. Stand Juni 2026.

## Engines

- **heygen-talking-head** — eigener Photo-Avatar Pfad, unabhängig vom Video-Provider.
- **sync-segments** / **cinematic-sync** — Sync.so sync-3 / lipsync-2-pro auf einer Action-Plate. Plate = Hailuo (primär).
- **sync-polish** — Sync.so Polish-Pass auf einem bereits gerenderten Clip. Provider-agnostisch.
- **broll** — kein Lip-Sync, VO als Off-Screen. Provider-agnostisch.

## Matrix

| Engine | Hailuo | HappyHorse | Kling | Seedance | Wan | Luma | Vidu | Sora | Pika | Runway | Grok | Veo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| HeyGen Talking-Head | n/a (eigener Pfad) |
| Cinematic-Sync / Sync-Segments | ✅ primär | ⚠️ wird auto-migriert → Hailuo | ⚠️ Multi-Speaker unzuverlässig — **v209 User-Consent erforderlich** (Ghost-Mouthing, kein Refund für Lipsync-Artefakte) | ⚠️ nur als Plate | ❌ kein audio_plan | ❌ | ❌ | ❌ | ❌ Composer-Fallback → Hailuo | ⚠️ V2V-Spezialist | ❌ | ❌ |
| Sync-Polish | ✅ alle Provider — läuft auf jedem MP4 |
| B-Roll | ✅ alle Provider |

## Auto-Migrationen (compose-video-clips)

1. **HappyHorse + cinematic-sync/sync-segments + (≥1 Sprecher ODER Dialog ODER Cast)** → migriert auf `ai-hailuo` (Stage 2/7, Juni 2026 hardened mit robusterem Speaker-Detektor für `NAME — MOOD:` Format).
2. **HappyHorse + cinematic-sync ohne Anchor-URL** → Soft-Fallback: clip_source=ai-hailuo, clip_status=pending, kein Hard-Fail mehr.
3. **Pika cinematic-sync** → ai-hailuo (kein audio_plan).

## Regel

Echte Lip-Sync-Szenen mit Cast-Dialog laufen verlässlich nur über:
- **HeyGen** für statische Direct-Address Beats
- **Hailuo + Sync-Segments** für Action-Beats

Andere Provider eignen sich als B-Roll-Plate mit nachgelagertem Sync-Polish — aber nicht als Master für die Dialog-Pipeline.
