

## Befund
User möchte **Quality-Tiers** (Standard / Pro) pro KI-Quelle wählbar machen — analog zu den Standalone-Studios (Hailuo Standard 768p / Pro 1080p, Kling Standard 720p / Pro 1080p, Sora Standard / Pro). Aktuell ist im Composer nur Standard hardcoded.

## Plan — Quality-Tier-System pro AI-Clip

### 1. Datenmodell (`src/types/video-composer.ts`)
- Neuer Typ `ClipQuality = 'standard' | 'pro'`
- Neues Feld in `ComposerScene`: `clipQuality: ClipQuality` (Default `'standard'`)
- `CLIP_SOURCE_COSTS` umbauen zu Matrix:
  ```
  CLIP_SOURCE_COSTS: Record<ClipSource, Record<ClipQuality, number>>
  ai-hailuo: { standard: 0.15, pro: 0.20 }
  ai-kling:  { standard: 0.15, pro: 0.21 }
  ai-sora:   { standard: 0.25, pro: 0.53 }
  stock/upload: { standard: 0, pro: 0 }
  ```
- Helper `getClipCost(source, quality, durationSec)` für UI + Header

### 2. DB-Migration
- Neue Spalte `clip_quality text default 'standard'` in `composer_scenes`
- Persistenz-Hook `useComposerPersistence.ts` mappt Feld mit

### 3. UI in `SceneCard.tsx` (Storyboard-Tab)
- Direkt unter der Quellen-Dropdown ein zweiter kleiner Tab/Toggle: **Standard** | **Pro**
- Nur sichtbar bei KI-Quellen (`ai-*`)
- Zeigt Live-Preis: *"Standard 768p — €0.15/s"* / *"Pro 1080p — €0.20/s"*
- Bei Wechsel: sofortiger Re-Calc des Header-Totals

### 4. UI in `ClipsTab.tsx`
- Pro Karte Mini-Badge: "Standard" oder "Pro" neben dem Source-Label
- Generate-Button-Cost zeigt korrekten Tier-Preis

### 5. Edge Function `compose-video-clips/index.ts`
- Für `ai-hailuo`: bei `clipQuality='pro'` → `resolution: '1080p'`, sonst `'768p'`
- Für `ai-kling`: bei `pro` → `kwaivgi/kling-v3-omni-video` (1080p Mode), sonst Standard 720p
- Für `ai-sora`: bei `pro` → Sora Pro Endpoint, sonst Standard
- `CLIP_COSTS` als Matrix synchron zum Client
- **Bonus-Fixes (aus letztem Plan):** `webhook_events_filter: ["completed"]` und bessere Fehler-Propagation

### 6. Briefing-Tab — Default-Quality
- Neuer Schalter im Briefing: *"Standard-Qualität für alle Szenen"* / *"Pro-Qualität (höhere Auflösung, höhere Kosten)"*
- Storyboard-Generator setzt `clipQuality` aller neuen Szenen entsprechend
- Pro-Szene-Override im Storyboard bleibt möglich

### 7. Lokalisierung
Neue Keys EN/DE/ES:
- `videoComposer.qualityStandard`, `videoComposer.qualityPro`
- `videoComposer.qualityHint` ("Pro: höhere Auflösung, höhere Kosten")
- `videoComposer.perSecond` ("/s")

### 8. Verify
- Hailuo 30s alle Standard → Header **€4.50** (30 × €0.15)
- 1× Szene auf Pro umschalten (5s lang) → Header **€4.25 + €0.25 = €4.50** ändert sich auf **€4.50 - 0.75 + 1.00 = €4.75** (5×0.20 statt 5×0.15)
- Generation läuft erfolgreich, Pro-Clip kommt in 1080p zurück
- Toast-Cost = Header-Cost (kein Drift)

### Was unverändert bleibt
- DB-Schema außer neue `clip_quality` Spalte
- Storyboard-AI-Logik, Upload-System, Persistenz-Hook-Struktur
- Universal Video Creator
- Tab-Struktur

