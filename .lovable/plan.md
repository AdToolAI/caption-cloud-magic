# Outfit-Override Fix — manuell gewähltes Outfit muss IMMER gewinnen

## Was passiert aktuell (Root-Cause-Analyse, im Code verifiziert)

Drei zusammenwirkende Bugs sorgen dafür, dass ein manuell gepicktes Outfit (z. B. Römerrüstung im Business-Briefing) ignoriert oder verwässert wird:

### Bug 1 — Universal-Anchor-Pfad sucht Outfit-Bilder gar nicht erst nach
`supabase/functions/compose-video-clips/index.ts:1773–1789` (Universal-Anchor für Hailuo / Kling / Pika / Seedance / Luma / Wan / HappyHorse) baut `portraitsFromCast` **direkt aus `charById.get(...).referenceImageUrl`** — die `outfitLookId` des Cast-Slots wird nie gelesen, kein Outfit-Cover wird geladen.

Die identische Outfit-Auflösung existiert nur im **cinematic-sync**-Zweig (Zeile 1232–1266). Heißt: nur in der Sprach-Pipeline kommt das gewählte Outfit überhaupt im Anchor an — alle anderen Engines sehen das blanke Default-Porträt.

### Bug 2 — Client-Resolver liest `__outfitImageUrl`, aber niemand setzt es
`src/lib/motion-studio/resolveSceneCharacterAnchor.ts:175` macht `(slot as any).__outfitImageUrl` — eine Property, die in der gesamten Codebase nirgends geschrieben wird. Das war ein altes Stub, das nie zu Ende geführt wurde. `prepareSceneAnchor` (Client-Pfad in `useGenerateAllClips` / `ClipsTab`) sendet dadurch auch im besten Fall nur das Basis-Porträt an `compose-scene-anchor`.

### Bug 3 — `compose-scene-anchor` hat keine Wardrobe-Lock-Klausel
Selbst wenn das Outfit-Cover als Image #1 ankommt, sagt der Prompt in `supabase/functions/compose-scene-anchor/index.ts:358` nur: *„Use the body/wardrobe from Image #1 for Sarah, but the FACE from this image"*. Diese Formulierung gewichtet Wardrobe vs. Scene-Description nicht. Wenn der Scene-Text *„professional business meeting"* sagt, hedget Nano Banana 2 und rendert oft Business-Kleidung in Römer-Stil oder umgekehrt.

Es gibt keine Anweisung wie *„Wardrobe IS LOCKED. If the scene says 'office' but the wardrobe shows Roman armor, render Roman armor inside the office."*

---

## Lösung

Drei chirurgische Eingriffe, alle additiv, kein Schema, keine UI-Änderung, Lip-Sync-Pipeline bleibt unangetastet (es geht ausschließlich um die Bild-Komposition vor dem i2v-Render).

### 1. Universal-Anchor: Outfit-Cover-Auflösung mirror'n
**Datei:** `supabase/functions/compose-video-clips/index.ts`
**Stelle:** ab Zeile 1773, direkt vor dem Aufbau von `portraitsFromCast`.

Spiegelt die bewährte cinematic-sync-Logik (Zeile 1232–1266):
- Sammle alle `outfitLookId` aus `castShots`.
- Eine Query auf `avatar_outfit_looks` (id, cover_url, front_url).
- Beim Bauen von `portraitsFromCast`: wenn der Slot ein `outfitLookId` mit aufgelöster URL hat → die Outfit-URL nehmen, sonst Fallback auf `referenceImageUrl`.
- Zusätzlich: `wardrobeLock: outfitUrlById.size > 0` und `wardrobeLockNames: [Namen der Char-Slots mit Outfit]` an `compose-scene-anchor` mitgeben (siehe #3).
- `identityPortraitUrls` (canonical face-only) wird **immer** aus `referenceImageUrl` befüllt — bleibt unverändert, damit Face-Lock weiter funktioniert.

### 2. Client-Resolver `__outfitImageUrl` echt befüllen
**Datei:** `src/lib/motion-studio/prepareSceneAnchor.ts`
**Stelle:** ab Zeile 153 in `prepareSceneAnchor`, vor dem `supabase.functions.invoke('compose-scene-anchor', …)` (Zeile 197).

- Sammle `outfitLookId` über alle aktiven `characterShots`/`characterShot`.
- Eine `supabase.from('avatar_outfit_looks').select('id, cover_url, front_url').in('id', ids)` Query (cached pro Render-Run reicht — wird einmal pro Szene gefeuert, das ist akzeptabel).
- Map id → URL.
- Beim Bauen von `portraitUrls` (Zeile 187): wenn der Anchor zu einem Charakter mit gesetztem Outfit gehört, statt `a.referenceImageUrl` die Outfit-URL nehmen; `identityPortraitUrls` parallel mit dem echten Porträt befüllen und an `compose-scene-anchor` mitgeben.
- `wardrobeLock` + `wardrobeLockNames` an den Body anhängen.
- Resolver darf so bleiben — die alte `__outfitImageUrl`-Stelle wird obsolet, kann aber als Fallback drin bleiben.

### 3. `compose-scene-anchor`: Wardrobe-Lock-Klausel
**Datei:** `supabase/functions/compose-scene-anchor/index.ts`
**Stellen:** `Body`-Interface (Zeile 23–61), Klausel-Bereich (~ Zeile 350–365) und `editInstruction` (Zeile 366–370).

- `Body` um `wardrobeLock?: boolean` und `wardrobeLockNames?: string[]` erweitern.
- Neue Klausel `WARDROBE_LOCK_SUFFIX`:

  > „**WARDROBE LOCK** — the wardrobe shown in the reference image for {NAMES} is MANDATORY and OVERRIDES any clothing implied by the scene description. If the scene description says 'modern office' or 'business meeting' but the wardrobe reference shows {e.g. Roman armor / fantasy robe / costume X}, the character wears EXACTLY that wardrobe inside the described environment. Do NOT translate the outfit into a 'scene-appropriate' equivalent. Do NOT swap fabrics, colors, or silhouettes to match the setting. The wardrobe in the reference IS the ground truth — the scene only provides location, lighting and pose."

- Klausel ans `editInstruction` anhängen, hinter `STRICT_SWAP_SUFFIX` / `FACE_LOCK_SUFFIX`, vor `worldClause`.
- Wenn `wardrobeLock` nicht gesetzt ist → Klausel leer (kein Verhaltenwechsel für Calls ohne explizites Outfit). Keine bestehenden Aufrufer brechen.

### 4. Logging
Beide Edge Functions geben bereits Outfit-Stats aus (cinematic-sync Zeile 1335). Spiegeln für Universal-Anchor und einmal in `compose-scene-anchor` (`wardrobeLock=true count=N`). Damit lässt sich im Edge-Function-Log binnen 5 Sekunden verifizieren, ob ein Render mit oder ohne Wardrobe-Lock lief.

---

## Was sich NICHT ändert (Schutzzone)

- **Schema** — `avatar_outfit_looks`, `composer_scenes`, `brand_characters` werden nicht angefasst.
- **UI** — Outfit-Picker (`CharacterCastPicker`, `SavedOutfitsSection`) bleibt wie er ist; die Auswahl-Spec (`outfitLookId`) stimmt bereits.
- **Lip-Sync-Pipeline** — `compose-dialog-segments/*`, `sync-so-webhook`, `audioPlan`, `LIPSYNC_MODEL`, `poll-dialog-shots`, `syncso_inflight_jobs`, `MIN_VO_DURATION`, `update_dialog_shot_pass`, `formatAudioPlan` — null Berührung.
- **Talking-Head (HeyGen)** — nutzt eigene Portrait-Pipeline, ist in beiden Anchor-Pfaden schon `skip`.
- **Vidu Q2** — `subject-reference` Pfad bleibt unverändert (er bekommt das Outfit-Bild bereits direkt als Subject-Ref, weil die Anchor-URL = `referenceImageUrl` ist; Vidu liest Wardrobe direkter aus dem Bild und braucht keine separate Lock-Klausel).

---

## Erwartetes Verhalten danach

- Briefing „AdTool AI Werbekampagne, Business" + manuell ausgewähltes Outfit „Römerrüstung" für Sarah → Nano Banana 2 rendert Sarah in **echter Römerrüstung** im modernen Büro/Boardroom, Identity bleibt durch die separate Face-Only-Identity-Referenz exakt gelockt, alle anderen Cast-Member ohne explizites Outfit tragen weiter Business.
- Kein Outfit gepickt → 100 % identisches Verhalten zu heute (Lock-Klausel wird nicht emittiert).
- Funktioniert für alle i2v-Engines (Hailuo, Kling, Pika, Seedance, Luma, Wan, HappyHorse) und cinematic-sync; Vidu Q2 funktioniert weiter wie heute.

---

## Aufwand

~1 h Arbeit, 3 Files geändert (`compose-video-clips/index.ts`, `prepareSceneAnchor.ts`, `compose-scene-anchor/index.ts`), keine Migration.
