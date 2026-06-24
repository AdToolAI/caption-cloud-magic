## Problem

Scene `4c17be43…` failed with `cinematic_sync_anchor_missing_single_speaker`, even though Samuel Dusatko (Avatar + Skript + Stimme) was clearly selected.

DB-Inspektion zeigt die echte Ursache:

```
character_shots = [{ characterId: "outfit:18fdfdf2-…", shotType: "detail" }]
```

Der ausgewählte Eintrag ist eine **Saved Outfit-Look** (`useUnifiedMentionLibrary` setzt `id = outfit:<look_id>`). Beim Einfügen in eine Szene landet diese ID 1:1 in `characterShots[].characterId` — statt das echte Avatar zu referenzieren und die Outfit-ID separat in `outfitLookId` zu speichern.

Folge im Edge Function `compose-video-clips`:
1. `charById.get("outfit:…")` → nichts → `portraitUrls = []`
2. Brand-Character-Speaker-Fallback springt nicht an, weil `effectiveShots.length > 0` (der Outfit-Shot zählt mit)
3. Guard wirft `cinematic_sync_anchor_missing_single_speaker`

Zusätzlich loggt der Function `twoshot-audio prep failed: empty_dialog_script` — der Server-Parser bricht am Em-Dash (`SAMUEL DUSATKO — CASUAL:`), weil das Regex-Char-Class `[\w\s.'-]` U+2014 nicht enthält.

## Plan

### 1. `outfit:`-Prefix beim Einfügen in eine Szene auflösen (Client)

In allen Stellen, die `MotionStudioCharacter`-Mentions in `scene.characterShots` schreiben (vor allem `applySceneAssetsToPrompt` / SceneCard Mention-Drop / Scene-Director Resolver):

- Wenn `mention.id.startsWith('outfit:')`:
  - `outfitLookId = mention.id.slice('outfit:'.length)`
  - `characterId = <avatar_id>` (aus `outfitLooks` Map, parent Brand-Character)
  - `shotType` bleibt wie gewählt
- Für `catalog:character:` analog auf die echte Catalog-UUID mappen.

### 2. Server-seitige Auto-Recovery in `compose-video-clips`

Direkt nach dem Bau von `castShots` (Zeile ~1190), bevor `effectiveShots` ermittelt wird:

- Für jede Shot mit `characterId.startsWith('outfit:')`:
  - `avatar_outfit_looks` per `id` laden → `avatar_id`, `cover_url`, `front_url`
  - Shot umschreiben: `characterId = avatar_id`, `outfitLookId = <look>` (falls leer)
  - Parent `brand_characters` in `charById` einlesen, damit `referenceImageUrl` und Name vorhanden sind
- Wenn nach dem Umschreiben **immer noch** kein `portraitUrl` resolvable ist (z. B. defekte Outfit-Referenz), fällt der bestehende Brand-Character-by-Name-Fallback (Zeilen 1223–1260) ohnehin durch — wir lassen ihn dann auch laufen, wenn alle Shots „leer" sind (heißt: keinen aufflösbaren `referenceImageUrl` haben), nicht nur wenn `effectiveShots.length === 0`.

### 3. Em-Dash-tolerantes Speaker-Regex (Server)

In `compose-video-clips/index.ts` `uniqueSpeakerSlugsFromScript` (Zeile 587) und in `prepare-twoshot-audio` (gleicher Bug, daher `empty_dialog_script`):

- Char-Class von `[\w\s.'-]` auf `[\p{L}\p{N}\s.'\-—–]` umstellen (mit `u`-Flag), und nur die führende Speaker-Phrase **vor dem ersten `:`** matchen.
- Mood-Suffix (`— CASUAL`, `– hopeful`) wird beim Slug-Bau abgeschnitten: ersten Em/En/Hyphen-Block + Mood-Wort vor dem Doppelpunkt entfernen, dann `replace(/\s+/g,'-')`.

Damit wird aus `SAMUEL DUSATKO — CASUAL: …` zuverlässig der Slug `samuel-dusatko` (statt aktuell zufällig korrekt oder gar leer).

### 4. UI: Preflight zeigt jetzt den echten Defekt

`validateSceneForCinematicSync.ts` zusätzlich prüfen: wenn ein `characterShots[].characterId` mit `outfit:` oder `catalog:` startet **und** kein `portraitUrl` ableitbar ist → Warnung *„Outfit-Look ohne Avatar-Bindung — bitte Avatar erneut zuweisen"* statt erst nach Hailuo-Render zu failen.

## Technische Details

- Tabellen: `avatar_outfit_looks(id, avatar_id, cover_url, front_url)`, `brand_characters(id, name, reference_image_url, default_voice_id)`
- Betroffene Files:
  - `src/lib/video-composer/mentions/applySceneAssetsToPrompt.ts` (oder äquivalente Stelle, die Mentions in `characterShots` mappt)
  - `src/components/video-composer/SceneCard.tsx` (Mention-Drop-Handler)
  - `src/lib/video-composer/cinematic-sync/validateSceneForCinematicSync.ts`
  - `supabase/functions/compose-video-clips/index.ts` (Speaker-Regex + Outfit-Resolver)
  - `supabase/functions/prepare-twoshot-audio/index.ts` (Speaker-Regex)
- Migration einmalig: SQL-Patch für bestehende Scene-Rows, die `outfit:`-IDs in `character_shots` halten — entweder im selben Edge-Call lazy migrieren (beim ersten Auflösen direkt zurückschreiben) oder per Backfill-Script. Empfehlung: lazy in (2), kein DB-Migration nötig.

## Reihenfolge

1. (2) + (3) im Edge Function → behebt die laufende Szene sofort ohne dass der User etwas neu anlegen muss.
2. (1) Client-Mapping → verhindert das Entstehen neuer kaputter `outfit:`-IDs.
3. (4) Preflight-Warnung → User sieht Probleme bereits vor dem Generate-Klick.

Lipsync-Pipeline (Sync.so / Hailuo / HappyHorse) bleibt vollständig unangetastet — wir korrigieren nur die **Eingabe** (Portrait-Auflösung) vor dem Anchor-Step.
