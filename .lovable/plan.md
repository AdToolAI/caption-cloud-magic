# Vidu Q2 Integration — Multi-Reference Specialist (10. Provider)

## Ziel

Vidu Q2 als einzigartigen **Multi-Reference / Multi-Character Specialist** integrieren. Killer-Feature: **bis zu 7 Reference-Bilder** in einer Szene (Charakter + Produkt + Location + Style). Vollintegration in **AI Video Toolkit** (alle Modi), **Video Composer**, **Brand Character Lock** und **Avatar Library**.

## Provider-Specs

| Modell | Modus | Dauer | Auflösung | Replicate Slug | Preis |
|---|---|---|---|---|---|
| `vidu-q2-reference` | Reference2V (1-7 Refs) | 5s | 1080p | `vidu/vidu-q2-reference-to-video` | ~€0.45 |
| `vidu-q2-i2v` | Image-to-Video | 5s | 1080p | `vidu/vidu-q2-image-to-video` | ~€0.40 |
| `vidu-q2-t2v` | Text-to-Video | 5s | 1080p | `vidu/vidu-q2-text-to-video` | ~€0.40 |

Verifiziert via Replicate-Modell-Naming. Final werden die Slugs in der Edge-Function geprüft und ggf. korrigiert (Replicate ändert gelegentlich Pfade).

## Architektur-Übersicht

```text
┌─────────────────────────────────────────────────────────────┐
│  AI Video Toolkit  (/ai-video-studio?model=vidu-q2-…)        │
│  ├─ Modus-Tabs: T2V | I2V | Multi-Reference (NEU)            │
│  └─ Multi-Reference-UI: 7 Slots mit Rollen-Badges            │
├─────────────────────────────────────────────────────────────┤
│  Video Composer  (clipSource: 'ai-vidu')                     │
│  ├─ Per-Scene Multi-Ref Picker (Char/Product/Location)       │
│  └─ Auto-Pull aus aktivem Brand Character Lock               │
├─────────────────────────────────────────────────────────────┤
│  Edge: generate-vidu-video                                   │
│  ├─ Polling + EdgeRuntime.waitUntil                          │
│  ├─ Storage-Rehost → ai-videos bucket                        │
│  └─ Refund-Hook bei Failure (idempotent)                     │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### 1. Edge Function: `generate-vidu-video`

Neue Function nach Vorbild von `generate-pika-video`:
- **Input**: `prompt`, `model` (`vidu-q2-reference` | `vidu-q2-i2v` | `vidu-q2-t2v`), `aspectRatio`, `referenceImages[]` (1-7 URLs), `referenceRoles[]` (`character` | `product` | `location` | `style` | `prop`), optional `seed`, `negativePrompt`
- **Validation**: Zod-Schema; Reference-Mode erfordert mind. 1 Bild, max. 7
- **Pricing-Map** wie Pika; Credits-Reservation via bestehendem Wallet-System
- **Polling**: 8min Timeout, 5s Intervall (Vidu rendert 60-120s)
- **Rehost**: Replicate-URL → `ai-videos/{userId}/{generationId}.mp4`
- **DB**: `ai_video_generations` Tabelle (existierend), kein Schema-Change nötig
- **Refund**: Bei Fail → automatische Wallet-Refund (Idempotency-Key = generationId)
- **Config**: `verify_jwt = true`, Timeout 300s in `supabase/config.toml`

### 2. Toolkit-Registry: `aiVideoModelRegistry.ts`

Neue Family `'vidu'` zur Union hinzufügen. Drei Einträge in `AI_VIDEO_TOOLKIT_MODELS`:
- `vidu-q2-reference` (group: `recommended`, badge: `Multi-Ref`, capability: neuer `multiRef: true` flag)
- `vidu-q2-i2v` (group: `fast`)
- `vidu-q2-t2v` (group: `fast`)

`ToolkitModel.capabilities` um `multiRef?: boolean` und `maxReferences?: number` (=7) erweitern.

Neue Konfigdatei `src/config/viduVideoCredits.ts` analog zu `pikaVideoCredits.ts`.

### 3. Toolkit-UI: Multi-Reference-Card

Neue Komponente `src/components/ai-video-toolkit/MultiReferenceUploader.tsx`:
- 7 Slots in 2 Reihen (Bento-Grid, James-Bond-Glassmorphism)
- Pro Slot: Drag-&-Drop Upload, Rollen-Selector (Character/Product/Location/Style/Prop), Vorschau
- "Aus Brand Character Lock laden"-Button → autofills Slot 1 mit aktivem Avatar
- "Aus Picture Studio laden"-Button → öffnet Media-Picker
- Sichtbar nur wenn `selectedModel.capabilities.multiRef === true`

Im `AIVideoToolkit.tsx`: bei `vidu-q2-reference` standardmäßig Multi-Ref-Card statt Standard-Image-Upload.

### 4. Composer-Integration

- `ClipSource` Type um `'ai-vidu'` erweitern (`src/types/video-composer.ts`)
- `COMPOSER_FAMILIES` Set in `modelMapping.ts` um `'vidu'` ergänzen
- Per-Scene "Multi-Ref"-Toggle in `SceneEditor`: bei aktivem Vidu erscheint kompakte 3-Slot-Variante (Character / Product / Location) — Vereinfachung gegenüber Toolkit
- `compose-video-clips` Edge-Function: neuer Branch für `ai-vidu` der `generate-vidu-video` aufruft. Fallback bei fehlenden Refs → `ai-hailuo` (analog Runway-Fallback)
- Brand Character Lock: wenn aktiv, Auto-Inject in Slot "Character"

### 5. Brand Character Lock + Avatar Library

In `useBrandCharacterLock` (oder vergleichbarem Hook): neuer `getViduReferenceCard()` Helper, der `{ url, role: 'character' }` zurückgibt. Wird in Toolkit + Composer konsumiert.

Avatar Library (`/avatars`): Multi-Select-Modus erlauben (max 2) für Vidu-Dialog-Szenen.

### 6. Routing & Navigation

- Neue Legacy-Route `/vidu-studio` → Redirect auf `/ai-video-studio?model=vidu-q2-reference` (analog zu allen anderen)
- Hub-Card im AI-Video-Hub: "Vidu Q2 — Multi-Reference Specialist"
- `legacyRoute` Property in Registry-Einträgen setzen

### 7. Localization

EN/DE/ES Strings für:
- Multi-Reference-Card Labels & Tooltips
- Rollen-Namen (Character, Product, Location, Style, Prop)
- Onboarding-Hint: "Lade bis zu 7 Bilder — dein Avatar, dein Produkt, dein Setting"

Visual Prompts bleiben EN (gemäß Core-Memory).

### 8. Memory-Update

Neuer Memory-Eintrag `mem://features/ai-video-studio/vidu-q2-multi-reference-integration` mit:
- Replicate-Slugs (verifiziert)
- 7-Slot-Limit & Rollen-Mapping
- Composer-Fallback-Verhalten
- Brand Character Lock Auto-Inject-Pfad

Index-Datei aktualisieren.

## Technische Details

**Reference-Roles → Vidu API**: Vidu nimmt Reference-Bilder in einem Array entgegen, ohne explizite Rollen-Felder. Die Rollen sind primär für **Prompt-Augmentation**: aus den UI-Rollen wird automatisch ein englischer Suffix gebaut, z.B. `"featuring the character from image 1, holding the product from image 3, in the location of image 4"`. Das verbessert nachweislich die Output-Konsistenz bei Vidu deutlich.

**Reference-Image-Constraints**: Replicate erwartet öffentlich erreichbare URLs. Daher: alle Refs müssen vor dem Call in Storage liegen. UI-Uploader nutzt bestehenden `mediaUpload.ts` → `ai-references/{userId}/...` Bucket (RLS-konform: userId als erste Pfad-Komponente).

**Cost-Estimation**: Vidu = Fixpreis pro Generation (nicht pro Sekunde). In `costPerSecond` Feld als `0.45 / 5 = 0.09` USD/EUR pro Sekunde abbilden, damit existierende UI-Cost-Anzeige funktioniert. Real abgerechnet wird der Fixbetrag in der Edge-Function.

**Aspect-Ratios**: Vidu Q2 unterstützt `16:9`, `9:16`, `1:1`.

**Capabilities-Flag**: V2V = false, Audio = false, T2V/I2V = true, neu: `multiRef = true` für `vidu-q2-reference` Variante.

## Files Created
- `supabase/functions/generate-vidu-video/index.ts`
- `src/config/viduVideoCredits.ts`
- `src/components/ai-video-toolkit/MultiReferenceUploader.tsx`
- `mem://features/ai-video-studio/vidu-q2-multi-reference-integration`

## Files Modified
- `src/config/aiVideoModelRegistry.ts` — Family + 3 Modelle, `multiRef`/`maxReferences` Capabilities
- `src/types/video-composer.ts` — `ClipSource` um `ai-vidu`
- `src/lib/video-composer/modelMapping.ts` — Family-Set + Source-Mapping
- `src/pages/AIVideoToolkit.tsx` — Multi-Ref-Card Conditional
- `src/components/video-composer/SceneEditor.tsx` (oder äquivalent) — kompakter 3-Slot-Picker für Vidu
- `supabase/functions/compose-video-clips/index.ts` — `ai-vidu` Branch + Fallback
- `src/App.tsx` — `/vidu-studio` Redirect
- `src/config/hubConfig.ts` — Hub-Card Eintrag
- `supabase/config.toml` — neuer Function-Block mit Timeout 300s
- `mem://index.md` — neuer Memory-Reference-Eintrag
- DE/EN/ES Translation-Files

## Out of Scope (später möglich)
- Vidu Q2 mit längerer Dauer (Vidu 1.5 Reference erlaubt 8s, Q2 noch nicht stabil)
- Vidu V2V (existiert noch nicht öffentlich auf Replicate)
- Multi-Character-Konversations-Templates im Composer (separater Feature-Slot)

Soll ich mit der Implementierung loslegen?
