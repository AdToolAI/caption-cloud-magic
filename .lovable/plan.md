## Befund

Du hast recht: Der Fehler hängt weiterhin am Skript-/Charakter-Mapping, nicht nur am `[Dialog]`-Block.

In den aktuellen DB-Daten ist sichtbar:

- Das Skript hat 3 Dialogzeilen, aber nur 2 eindeutige Sprecher: Matthew, Samuel, Matthew.
- `character_shots` ist korrekt: Matthew + Samuel.
- Der generierte visuelle Prompt ist aber widersprüchlich, z. B.:
  - `Featuring Samuel Dusatko (profile): Close-up profile shot of Matthew Dusatko...`
  - oder `Featuring Matthew Dusatko (profile): ... Samuel Dusatko...`
- Dadurch bekommt das Bildmodell gleichzeitig falsche Identitäts-Hinweise: Slot A sagt Samuel, der Prompt beschreibt aber Matthew. Das erklärt, warum trotz Matthew als Wiederholungs-Sprecher der andere Charakter doppelt/verkehrt auftaucht.
- Zusätzlich ordnet der Lip-Sync aktuell Pass 1 immer dem linken Gesicht und Pass 2 immer dem rechten Gesicht zu. Das ist nur korrekt, wenn die Anchor-Komposition dieselbe Links/Rechts-Reihenfolge wie `character_shots` erzeugt. Wenn das Bildmodell Matthew rechts und Samuel links platziert, werden Stimmen/Passes vertauscht.

## Plan

### 1. Sprecher statt Dialogzeilen als visuelle Cast-Liste verwenden

In `compose-video-clips` wird vor dem Anchor-Aufruf aus `dialogScript` eine deduplizierte Sprecherliste gebaut:

```text
Matthew, Samuel, Matthew -> [Matthew, Samuel]
Samuel, Matthew, Samuel -> [Samuel, Matthew]
```

Die Anchor-Portraits werden dann bevorzugt aus dieser Sprecherliste gebildet, nicht blind aus `character_shots` oder aus Prompt-Text.

### 2. Widersprüchliche `Featuring ...`-Promptteile entfernen

Der Sanitizer für den visuellen Anchor-Prompt wird erweitert:

- Entferne `Featuring X: ...` / `Featuring X (profile): ...` Prefixe.
- Entferne besonders problematische Sätze, in denen zwei verschiedene Charakternamen in einem Slot vermischt werden.
- Fallback für Multi-Speaker-Szenen wird bewusst neutral:

```text
Exactly 2 distinct people in a modern office conversation scene, one is Matthew Dusatko and one is Samuel Dusatko, each visible exactly once. No rendered text.
```

Damit sieht der Bildgenerator nicht mehr „Samuel-Slot mit Matthew-Beschreibung“.

### 3. Anchor-Cache erneut invalidieren

`compose-scene-anchor` bekommt eine neue Cache-Version (`v9` → `v10`), damit bereits erzeugte, fehlerhafte Anchors nicht wiederverwendet werden.

### 4. Sprecher/Portrait-Reihenfolge hart an den Anchor übergeben

Beim Anchor-Aufruf wird `characterNames` exakt in derselben Reihenfolge wie `portraitUrls` gesetzt. Bei Script-basierten Two-Shots also z. B.:

```text
portraitUrls[0] = Matthew portrait
characterNames[0] = Matthew Dusatko
portraitUrls[1] = Samuel portrait
characterNames[1] = Samuel Dusatko
```

Nicht mehr aus gemischten Prompt-Texten ableiten.

### 5. Lip-Sync-Face-Mapping gegen Links/Rechts-Vertauschung absichern

In `compose-twoshot-lipsync` wird das Face-Targeting nicht mehr nur nach Pass-Index gemacht (`Pass 1 -> links`, `Pass 2 -> rechts`). Stattdessen wird die Sprecher-/Shot-Reihenfolge mit der gespeicherten Anchor-Reihenfolge abgeglichen.

Praktisch:

- `audio_plan.twoshot.anchorCharacters` speichert die Reihenfolge der Anchor-Portraits.
- Lip-Sync-Passes targeten das Gesicht passend zum jeweiligen `character_id`.
- Wenn keine sichere Zuordnung möglich ist, bleibt die bestehende Fallback-Logik aktiv, aber mit präzisem Fehler statt stiller Vertauschung.

### 6. Betroffene Szenen resetten

Für die betroffenen aktuellen Szenen mit diesem Muster werden alte Artefakte gelöscht/zurückgesetzt:

- `reference_image_url`
- `clip_url`
- Lip-Sync-Felder
- `audio_plan.twoshot.faceMap`
- `scene_anchor_cache`

Danach muss der Clip neu gerendert werden, damit der neue saubere Anchor und das neue Face-Mapping greifen.

## Dateien

- `supabase/functions/compose-video-clips/index.ts`
- `supabase/functions/compose-scene-anchor/index.ts`
- `supabase/functions/compose-twoshot-lipsync/index.ts`
- optional Migration/Datencleanup für die betroffenen Szenen

## Erwartetes Ergebnis

- Bei 3 Dialogzeilen mit 2 eindeutigen Sprechern werden visuell nur 2 Personen erzeugt.
- Der Charakter, der zweimal spricht, wird nicht zweimal visualisiert.
- Matthew/Samuel werden nicht mehr durch widersprüchliche `Featuring`-Prompts vertauscht.
- Lip-Sync spricht gezielt den korrekten sichtbaren Charakter an, statt pauschal links/rechts zu verwenden.