## Was passiert (Beobachtung)

Der vorherige Fix hat zwei Schalter scharf gestellt:
- `appliesToScene` (Identity-Card nur in Charakter-Szenen) ✅
- `usePortraitAsFirstFrame` (Portrait als i2v-Anchor) — **default OFF** ❌

Resultat: Matthew-Szenen bekommen jetzt zwar die Identity-Card im Prompt, aber **kein** `referenceImageUrl` mehr → Hailuo/Kling/Wan generieren irgendeinen passenden Mann, nicht Matthew. Gesicht-Konsistenz ist weg.

## Ziel

Wenn die Szene den Charakter featured, soll dessen Portrait automatisch als Identitäts-Referenz an die Engine gehen — **ohne** dass das Portrait dabei zwangsläufig als 1:1 erstes Frame eingeblendet wird (Charakter darf später in der Szene erscheinen, anders gekleidet sein, Kamera kann woanders starten).

## Realität der Provider

Composer unterstützt heute (`compose-video-clips/index.ts`):

| Provider   | Reference-Slot               | Modus               |
|------------|------------------------------|---------------------|
| Hailuo 2.3 | `first_frame_image`          | hard first frame    |
| Kling 3    | `start_image`                | hard first frame    |
| Wan 2.5    | `image` (i2v variant)        | hard first frame    |
| Seedance   | i2v `image`                  | hard first frame    |
| Luma Ray 2 | `start_image`                | hard first frame    |
| Vidu Q2    | `reference_images[]`         | **subject ref**, kein first-frame ✨
| Runway Gen-4| `reference_images[]`        | **subject ref**, kein first-frame ✨

→ Echte „Charakter passt rein, ist aber nicht der Start" gibt es nur bei **Vidu Q2** und **Runway Gen-4**. Bei den i2v-Providern ist die Portrait-Referenz immer ein hartes Startbild.

## Plan

### 1. Portrait-Anchor wieder default-aktiv machen (für Charakter-Szenen)
**`src/components/brand-characters/...`** & **CharacterManager.tsx (Z. 201, 329)**
- `usePortraitAsFirstFrame` Default → **`true`** für neu gelinkte Brand-Characters.
- Bestehende Cast-Einträge: beim Mount migrieren (`usePortraitAsFirstFrame ?? true`).
- Toggle-Label umbenennen in „Portrait als Charakter-Referenz nutzen" (nicht mehr „first frame").

### 2. Anchor-Mode pro Szene/Provider unterscheiden
**`src/components/video-composer/ClipsTab.tsx` (Z. 308–345 und 463–471)**
Statt einer einzigen `referenceImageUrl`, zwei semantische Felder an die Engine schicken:

```ts
{
  referenceImageUrl: s.referenceImageUrl,        // explizite Frame-Chain / Upload (hart)
  characterReferenceUrl: brandAnchor || castAnchor, // Identity-Hint (soft, falls Provider kann)
}
```

`brandAnchor` greift künftig sobald **`appliesToScene === true`** (kein zweiter Toggle nötig).

### 3. Engine: Subject-Reference vs First-Frame korrekt routen
**`supabase/functions/compose-video-clips/index.ts`**
- Neuer Helper `resolveAnchor(scene, provider)`:
  - **Vidu / Runway**: `characterReferenceUrl` → in `reference_images[]` (Tag `character`), `referenceImageUrl` separat als Start-Frame falls gesetzt.
  - **Hailuo / Kling / Wan / Seedance / Luma**: Fallback `referenceImageUrl ?? characterReferenceUrl` → `first_frame_image / start_image / image`. Log-Hinweis „provider supports first-frame only — character reference will be used as start frame".
- Keine Schema-Changes in der DB nötig (Felder bleiben in der Function-Payload, persistiert wird weiterhin nur `reference_image_url` wenn explizit gesetzt).

### 4. UI-Transparenz (Cast-Map + SceneCard)
- **CastConsistencyMap**: neue Anchor-Klasse `'character-ref'` (gold-cyan Punkt) für Szenen, in denen das Portrait automatisch als Identity-Referenz mitfließt. Tooltip: „Portrait wird als Charakter-Referenz an die Engine geschickt — bei Hailuo/Kling als Startbild, bei Vidu/Runway als Subject-Reference".
- **SceneCard Live-Preview**: Badge `character-ref · auto` neben `brand`-Badge, wenn Anchor aktiv.
- **Hinweis-Banner** in CharacterManager: „Für Szenen, in denen der Charakter erst später auftaucht, wechsle zu Vidu Q2 oder Runway Gen-4 — sonst wird das Portrait als Startframe verwendet."

### 5. Per-Szene Override
SceneCard erhält in der Charakter-Sektion einen kleinen Schalter „Portrait-Referenz für diese Szene": `auto` (default, folgt `appliesToScene`) | `force on` | `force off`. Persistiert als `scene.characterAnchorMode` (lokaler Composer-State, kein DB-Migration jetzt — Storyboard-Save erweitern in eigenem Schritt).

## Verifikation

1. Matthew-Projekt, „Alle Clips neu generieren":
   - S1, S5 (Matthew genannt) → Hailuo bekommt `first_frame_image = portrait` → Matthew-Gesicht.
   - S2 („spray pump"), S3 („Matthew's hands" — Name match!) → S3 bekommt Anchor, S2 nicht.
   - S4 („drone") → kein Anchor.
2. Im SceneCard-Preview: `brand` + `character-ref · auto` Badges sichtbar in S1/S3/S5.
3. Cast-Map zeigt Gold-Cyan-Punkte exakt in den Charakter-Szenen.
4. Modell auf Vidu Q2 wechseln in S5 → Edge-Function-Log: „Vidu scene S5 uses subject reference (no start_frame lock)".

## Out of Scope
- Keine DB-Migration (Anchor-Mode bleibt im Composer-State).
- Kein Eingriff in `compose-video-storyboard`, Auto-Director oder Director's Cut.
- Library-Character `@-mention`-Pfad bleibt unverändert (User-getrieben).
- Subject-Reference-Routing für Pika/HappyHorse/Sora wird in einem Folge-Schritt geprüft (heute first-frame-only behandelt).
