## Was du beobachtest

1. **„Sarah" war keine Charakter-Anlage, sondern eine Stimme.** Der Talking-Head-Dialog hat sie als Voice-Preset (`Sarah – warm female`) gespeichert — es wurde also nie ein neuer Charakter angelegt, sondern nur ein Video mit dem hochgeladenen Foto + Sarahs Stimme generiert.
2. **Kein Namensfeld.** Der Dialog hat heute nur ein Foto-Upload + Avatar-Grid (aus `useAccessibleCharacters`, also `/avatars`). Es gibt keinen Input „Name dieses Charakters" — weil bisher kein neuer Charakter erzeugt werden sollte, sondern nur ein Talking-Head-Clip.
3. **Szene zeigt nichts Neues.** Die Edge-Function setzt `composer_scenes.clip_status='processing'` + `clip_source='talking-head'`, aber das Storyboard-UI rendert in der Szenen-Card weiterhin den Cast-Avatar (Matthew aus dem Briefing). Erst wenn HeyGen nach 1–3 Min liefert, kommt `clip_url` rein — und auch dann landet es als Clip, nicht als „Cast-Mitglied im Briefing".

Kurz: Der Talking-Head-Dialog erzeugt **Clips**, nicht **Cast-Charaktere**. Deine Intuition ist genau richtig — die beiden Welten sollten zusammen­gezogen werden.

## Vorschlag (deckt sich mit deiner Idee)

**Talking-Head wird zur „Stimme & Performance" für einen Briefing-Charakter, nicht zur Foto-Upload-Bühne.**

### Tab „Charakter" im Talking-Head-Dialog (neu)

```text
┌─ Charakter wählen ─────────────────────────────┐
│ Aus deinem Briefing-Cast:                      │
│ ┌────┐ ┌────┐ ┌────┐                           │
│ │ MA │ │ AN │ │ CA │                           │
│ │Matt│ │Anna│ │Carl│                           │
│ └────┘ └────┘ └────┘                           │
│                                                │
│ Kein passender Charakter?                      │
│ ┌──────────────────────────────────────────┐   │
│ │ + Neuen Charakter ins Briefing aufnehmen │   │
│ │   Name: [_________]   Foto: [Upload]     │   │
│ │   ✓ Wird auch im Cast Consistency Map    │   │
│ │     für andere Szenen verfügbar          │   │
│ └──────────────────────────────────────────┘   │
└────────────────────────────────────────────────┘
```

Konkret:
- **Quelle = `briefing.characters`** (`ComposerCharacter[]`), nicht mehr `useAccessibleCharacters`. Damit ist der Talking-Head zwingend Teil deines Storyboard-Casts und taucht in der Cast Consistency Map auf.
- **Pflichtfeld Name** — entweder über Auswahl eines bestehenden Cast-Mitglieds oder über das Inline-Formular „neuen Charakter hinzufügen".
- **Inline-Formular** macht zwei Dinge atomar:
  1. Lädt Foto in `brand-characters` Bucket hoch (gleicher Path wie Avatar Library).
  2. Hängt einen neuen `ComposerCharacter` (`{ id, name, referenceImageUrl, brandCharacterId? }`) an `briefing.characters` an → wird sofort in `BriefingTab` / `CastConsistencyMap` sichtbar.
- **Optional aus `/avatars` importieren** — kleiner Link „Avatar aus Bibliothek übernehmen" öffnet ein Mini-Picker (deine `useAccessibleCharacters`), kopiert Portrait + Default-Voice in einen neuen `ComposerCharacter`. So bleibt die Brand-Character-Bibliothek nutzbar, ohne dass sie *direkt* zur Talking-Head-Quelle wird.

### Tab „Skript & Stimme"

Bleibt wie heute (Skript, Voice-Preset/Custom Voice, Aspect, Resolution, optionales Szenen-Target).

### Szenen-Anbindung

- Wenn eine Szene gewählt ist, schreibt die Edge-Function zusätzlich `composer_scenes.character_ids = [composerCharacterId]`, damit die `CastConsistencyMap` den richtigen Punkt setzt und die Szenen-Card im Storyboard den richtigen Avatar im Header zeigt — auch *bevor* HeyGen fertig ist.
- Während `clip_status='processing'` zeigt die Szenen-Card einen Skeleton + „Talking-Head wird generiert (1–3 Min)" mit dem Foto des Charakters als Vorschau, statt nur dem alten Storyboard-Bild.

### Geänderte Dateien (Frontend + 1 Edge-Function-Patch)

- `src/components/video-composer/TalkingHeadDialog.tsx` — Avatar-Quelle umstellen auf `briefing.characters`, Name-Pflicht, Inline-„Neuer Charakter"-Block, optional Library-Import.
- `src/components/video-composer/StoryboardTab.tsx` — `briefing` + `onUpdateBriefing` an Dialog reichen; nach Anlage neuen Charakter via `onUpdateBriefing({ characters: [...] })`.
- `src/components/video-composer/SceneCard.tsx` (oder `SortableSceneItem.tsx`) — Wenn `clip_source='talking-head'` & `clip_status='processing'`, Foto + Loader anzeigen.
- `supabase/functions/generate-talking-head/index.ts` — `composerCharacterId` annehmen, in `composer_scenes.character_ids` schreiben (UPDATE auf Array-Spalte).

### Verifikation

1. Dialog öffnen → Tab „Charakter" zeigt Briefing-Cast (Matthew) + „+ Neuer Charakter".
2. „Sarah" anlegen mit Foto-Upload → erscheint sofort in Cast Consistency Map als zweite Zeile mit Spalten-Punkten.
3. Skript schreiben, Szene 2 wählen, generieren → Szene-Card S2 zeigt sofort Sarahs Foto + „Generiert…", Cast-Map setzt grünen Punkt in Spalte S2.
4. Nach 1–3 Min: HeyGen-Video ersetzt Skeleton in S2.
5. Zweiter Talking-Head in S4 mit *bestehendem* Charakter Sarah → kein neuer Cast-Eintrag, Cast-Map bekommt zusätzlichen Punkt in Spalte S4.

### Nicht im Scope

- Kein Marketplace-/Avatar-Library-Umbau.
- Kein neuer DB-Trigger; alles über bestehende `composer_scenes`/`composer_briefings`-Spalten.
- Kein Hedra/HeyGen-Modellwechsel.
