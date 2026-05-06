## Root Cause

Zwei unabhängige Bugs erzeugen genau das beobachtete Verhalten:

### Bug 1 — Jede Szene startet mit dem Portrait
In `src/components/video-composer/ClipsTab.tsx` (Zeile 319 / 457) wird der Brand-Character-Anker so berechnet:

```ts
const brandAnchor = brandCharacterInput && (brandCharacterInput as any).usePortraitAsFirstFrame !== false
  ? brandCharacterInput.referenceImageUrl
  : undefined;
```

`brandCharacterInput` wird aus dem Lieblings-Brand-Character gebaut (`activeBrandChar`, Zeilen 74–81). Dieses Objekt hat **gar kein** Feld `usePortraitAsFirstFrame` — der Vergleich `!== false` ist deshalb **immer true**, und `referenceImageUrl` (das Portrait) wandert in `referenceImageUrl` der Payload → in `compose-video-clips` wird `isI2V = true` für **jede** Szene → `first_frame_image / start_image / image` = Portrait → jede Szene startet exakt mit dem Gesicht.

Die Toggle-Logik wurde zwar für **Cast-Charaktere** (`castMember.usePortraitAsFirstFrame`) korrekt umgesetzt, aber der **Brand-Character-Pfad** ist invers (default = AN). Das ist die eigentliche Ursache, denn der verlinkte Avatar wird gleichzeitig als Brand-Char gehandhabt.

Zusätzlich: Wenn die Szene den Charakter via `@mention` referenziert, liefert `resolveMentions` (`mentionParser.ts` Zeile 168–177) eine `referenceImageUrl` zurück, die in `composed.referenceImageUrl` landet und ebenfalls ungated in den i2v-Anker fließt.

### Bug 2 — Banner „Matthew kommt in keiner Szene vor"
`CastConsistencyMap.getAnchor` (Zeile 29–45) matcht nur via `shot.characterId === character.id` oder First-Name-Substring **innerhalb der characterId**. Wenn das Storyboard `characterShot` gar nicht setzt (oder `shotType: 'absent'` zurückgibt — was es laut Prompt tun darf, wenn das LLM die Szene nicht als Charakter-Szene markiert), gilt jede Szene als „absent" — selbst wenn der Charakter-Name **im aiPrompt** klar genannt ist. Das Banner triggert fälschlich.

## Lösung

### 1. `src/components/video-composer/ClipsTab.tsx`
- Brand-Character-Anker auf **opt-in** umstellen, analog zu Cast-Charakteren:
  - Default = **kein** Portrait als ersten Frame.
  - Nur dann setzen, wenn das zugehörige `BrandCharacter`-Objekt explizit `use_portrait_as_first_frame === true` hat (Feld muss konsistent benannt sein — siehe Punkt 2).
- An beiden Stellen (Generate-All ~Zeile 319, Single-Generate ~Zeile 457) gleich behandeln.
- Zusätzlich: `composed.referenceImageUrl` (aus `@mention`) **nicht mehr** automatisch in die Payload kippen, wenn der User es nicht explizit angefordert hat. Stattdessen nur, wenn der gementionte Library-Character ebenfalls den Opt-in trägt — sonst bleibt das @mention reine Look-Referenz im Prompt-Block.
- Das bestehende `s.referenceImageUrl` (vom Frame-Chain / „Continuity → #x"-Button) bleibt unverändert — das ist eine bewusste User-Aktion.

### 2. Brand-Character-Toggle exponieren
- In `src/hooks/useBrandCharacters.ts` (bzw. dem Typ `BrandCharacter`) ein optionales Feld `use_portrait_as_first_frame?: boolean` ergänzen (default false). DB-Spalte ist nicht zwingend nötig — kann zunächst rein clientseitig per `localStorage`/Settings-Toggle laufen, oder via Migration als `boolean default false`.
- Im `BrandCharacterSelector` / `BrandCharacters`-Page einen kleinen Toggle einblenden („Portrait als ersten Frame im Composer erzwingen") — analog zum CharacterManager-Toggle, mit identischem DE/EN/ES-Wording.

### 3. `src/components/video-composer/CastConsistencyMap.tsx`
- `getAnchor` so erweitern, dass ein Charakter auch dann als „present" gilt, wenn sein Name (oder Vorname) im `scene.aiPrompt` vorkommt — selbst wenn `characterShot` fehlt/`absent` ist. Anker wird dann `'prompt'` (Kreis-Icon).
- Damit verschwindet das falsche Banner, sobald „Matthew Dusatko" im Prompt steht.

### 4. Verifikation
- Composer öffnen → Charakter mit verlinktem Avatar → Storyboard generieren → Clips-Tab: kein Szene-Payload enthält mehr `referenceImageUrl` (außer Frame-Chain). In `compose-video-clips`-Logs erscheint pro Szene `isI2V=false` für Hailuo/Kling/Wan/Seedance/Luma/Veo/HappyHorse → Szenen starten **nicht** mit dem Portrait.
- Cast-Map zeigt Matthew als „prompt-only present" (Kreis), nicht mehr als „absent" → Warnbanner verschwindet.
- Toggle im Brand-Character einschalten → Portrait wird wieder als erster Frame gesetzt (alter Look bleibt verfügbar).

## Out of Scope
Keine Änderung an `compose-video-clips` (Engine-Logik bleibt, sie reagiert nur auf `referenceImageUrl`). Keine Änderung an `compose-video-storyboard` — die Storyboard-Häufigkeitslogik (cameo/balanced/lead) wurde bereits korrekt umgesetzt.
