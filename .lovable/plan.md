# Storyboard-Fehler + Outfit pro Szene

Zwei Themen in einem Schritt: erst der `toLowerCase`-Crash beim Storyboard-Generieren, dann ein neuer **Outfit-Slot** neben der Charakter-Auswahl in jeder Szene.

---

## 1) Crash: „Cannot read properties of undefined (reading 'toLowerCase')"

### Wahrscheinliche Ursache
Der neue Charakter (oder ein vom Storyboard-LLM erzeugter Cast-Slot) kommt ohne `name` bzw. ohne `characterId` in die UI. Mehrere Stellen rufen direkt `.toLowerCase()` auf, ohne den Wert vorher zu prüfen — sobald **eine** dieser Stellen während des Render-Trees getroffen wird, fängt die globale `ErrorBoundary` und ersetzt die ganze Seite mit „Etwas ist schiefgelaufen".

Konkret ungeschützt:
- `src/lib/motion-studio/applyCastToPrompt.ts:38` → `fullName.toLowerCase()`
- `src/lib/motion-studio/applyCastToPrompt.ts:59` → `slot.characterId.toLowerCase()` (Slot-Guard prüft `slot.characterId`, aber nicht ob es ein String ist)
- `src/lib/motion-studio/mentionParser.ts:94` → `m[1].toLowerCase()` (sicher) — aber `buildIndex` iteriert auch über Items mit potenziell leerem `name`
- `src/components/video-composer/CharacterManager.tsx:142`, `CharacterCastPicker.tsx:83/85/89` — alle Lookups, die einen Slot-Wert direkt lowercasen
- `src/components/video-composer/SceneCard.tsx:203/204` → `s.name.trim().toLowerCase()` bricht, sobald ein gemergter Eintrag kein `name` hat

### Fix
Defensive Hardening — überall, wo ein Wert aus Library / LLM-Output / DB kommt, gilt: **erst optional chaining + Default, dann lowercasen**.

- Helfer `safeLower(v?: string | null) => v?.toLowerCase().trim() ?? ''` in `src/lib/motion-studio/strings.ts` einführen.
- In allen oben gelisteten Dateien `.toLowerCase()` durch `safeLower(...)` ersetzen und Folge-Logik mit `if (!x) continue/return` absichern.
- `mergeWithCatalog` in `SceneCard.tsx` filtert vorab: `saved.filter(s => s?.name)` bzw. `catalog.filter(c => c?.name)` — keine Crashes mehr, wenn ein neuer Avatar noch keinen Namen hat.
- Bonus: in `useUnifiedMentionLibrary` und `useBrandCharacters` Einträge ohne `name` aussortieren, damit der LLM-Prompt keine leeren `@`-Mentions bekommt.

Damit das Symptom **sofort** verschwindet, wickeln wir zusätzlich den Storyboard-Tab in eine eigene `ErrorBoundary` mit Inline-Fallback (statt Vollbild-Übernahme), sodass ein einzelner kaputter Szenen-Render nicht die ganze App leert.

---

## 2) Outfit pro Charakter pro Szene

### Status heute
- Charaktere haben Saved Outfits (`avatar_outfit_looks`, `useSavedOutfits`).
- In der Szene wählt man **nur den Charakter** (`characterShots[]` mit `characterId` + `shotType`).
- Das Outfit wird heute „zufällig" — was immer im Portrait/Identity-Card steckt — vom Modell übernommen.

### Ziel
Pro Charakter-Slot in der Szene zusätzlich ein **Outfit-Look** auswählen (Default = aktuelles Standard-Portrait). Der gewählte Look fließt sowohl in den Compose-Anchor (Nano Banana 2 First-Frame) als auch in die Identity-Card im Prompt ein.

### Datenmodell
`CharacterShot` (in `src/types/video-composer.ts`) bekommt ein optionales Feld:
```ts
outfitLookId?: string | null;
```
Kein DB-Touch nötig — die Looks existieren bereits in `avatar_outfit_looks`. Storyboard-LLM-Output bleibt rückwärts­kompatibel (Feld fehlt → wie heute).

### UI: Cast-Karte in der Szene
In `CharacterCastPicker.tsx` (bzw. der Slot-Karte innerhalb von `SceneCard`) bekommt jeder Charakter-Slot direkt unter dem Shot-Type-Picker eine zweite Reihe:

```text
[Avatar-Thumb] Sarah Kim                 [Shot ▾]
└─ Outfit:   [Default ▾]  Knight · Gala · Casual …
              ↑ horizontale Pill-Liste mit Cover-Thumb (40×40)
```

- Quelle: `useSavedOutfits(slot.characterId)` — lädt nur die Looks dieses Avatars.
- „Default" = `outfitLookId: null` → benutzt das Hauptporträt wie bisher.
- Aktiver Look → goldener Bond-2028-Ring um die Thumb (`shadow-[0_0_18px_-6px_hsl(var(--primary)/0.55)]`).
- Wenn der Avatar **keine** gespeicherten Looks hat → Outfit-Reihe wird komplett versteckt + dezenter Link „Outfits in Avatars verwalten" (öffnet `/avatars/:id`).

### Pipeline
1. **Anchor-Resolver** (`resolveSceneCharacterAnchor.ts`)
   Wenn `slot.outfitLookId` gesetzt ist, ersetzt `referenceImageUrl` durch `outfit.cover_url` (bzw. `front_url` bevorzugt, `cover_url` fallback). Strategy-Auswahl (composed/direct/text-only) bleibt identisch.
2. **Identity-Card** (`buildCharacterPromptInjection` / `applyCastToPrompt`)
   Wenn ein Look aktiv ist, hängen wir `Wearing: <outfit.name>` an die Identity-Card an — englischer String, damit AI-Modelle ihn sauber lesen.
3. **Scene-Anchor-Composer** (`compose-scene-anchor` Edge Function)
   `portraitUrls[]` enthält bei Multi-Cast bereits mehrere Bilder. Pro Slot mit Look übergeben wir das Outfit-Bild statt des Standard-Porträts — die Edge-Function bleibt unverändert (sie kennt nur „Portrait-URL").
4. **Scene-Director** (Edge Function `scene-director`)
   Erweitert das Tool-Schema um `outfitLookId` und matcht `@Sarah:gala` → `{ characterId: sarah.id, outfitLookId: gala.id }`. Optional in Stage 2; im ersten Wurf reicht UI-Auswahl.

### Edge-Cases
- Outfit wurde gelöscht, Szene hat noch die alte `outfitLookId` → Picker zeigt „Outfit nicht mehr verfügbar (Default benutzen)" + Auto-Reset beim Render.
- Multi-Character: jeder Slot hat sein eigenes Outfit-Dropdown — keine globale Szenen-Wahl.
- Brand-Character-Auto-Inject (Favourite) ohne expliziten Slot → kein Outfit-Picker (zu unklar welches Outfit).

---

## Reihenfolge
1. `safeLower`-Helfer + Hardening aller `toLowerCase`-Stellen + `mergeWithCatalog`-Filter (behebt den Crash sofort).
2. Lokale `ErrorBoundary` um Storyboard-Tab als zweite Sicherung.
3. `CharacterShot.outfitLookId` einführen + Picker-Reihe in der Cast-Karte rendern.
4. Anchor-Resolver + Identity-Card-Injection erweitern.

## Geänderte Dateien
- `src/lib/motion-studio/strings.ts` (neu)
- `src/lib/motion-studio/applyCastToPrompt.ts`
- `src/lib/motion-studio/mentionParser.ts`
- `src/lib/motion-studio/resolveSceneCharacterAnchor.ts`
- `src/components/video-composer/SceneCard.tsx`
- `src/components/video-composer/CharacterCastPicker.tsx`
- `src/components/video-composer/CharacterManager.tsx`
- `src/components/video-composer/StoryboardTab.tsx` (ErrorBoundary-Wrap)
- `src/types/video-composer.ts` (`outfitLookId` Feld)

Keine DB-Migration, keine Edge-Function-Pflichtänderung (scene-director-Erweiterung optional als Stage 2).
