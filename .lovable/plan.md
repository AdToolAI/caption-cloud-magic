## Phase A — Voice Auto-Bind + Dialog Pre-Flight

Ziel: ~80% der schlechten Dialog-Renders verhindern, ohne die Pipeline umzubauen. Zwei kleine, in sich geschlossene Bausteine.

---

### Baustein 1 — Voice Auto-Bind

**Problem:** Sprecher wird im `SceneDialogStudio` ausgewählt, aber die hinterlegte `default_voice_id` des Brand Characters wird nicht automatisch übernommen. User muss pro Szene & pro Sprecher manuell die Stimme nochmal setzen → vergessen → Default-Stimme → Marken-Inkonsistenz.

**Lösung:**
- Beim Hinzufügen eines Sprechers (Cast → Dialog) automatisch `scene.dialogVoices[characterId]` mit der `default_voice_id` des Charakters vorbelegen (sofern leer).
- Wenn die Voice fehlt: dezenter Hinweis "Kein Standard-Voice — bitte wählen" + Quick-Link zum Charakter (`/avatars/:id`).
- Visuelles Lock-Badge an der Voice-Zeile, wenn sie vom Brand Character geerbt wurde (Gold, "Brand-Voice"). User kann pro Szene überschreiben (Override behält dann Vorrang).

**Dateien (Lesen + kleine Edits):**
- `src/components/video-composer/SceneDialogStudio.tsx` — Auto-Bind beim Cast-Add, Lock-Badge
- `src/hooks/useAccessibleCharacters.ts` (bzw. `useUnifiedMentionLibrary`) — sicherstellen dass `default_voice_id` mitgeliefert wird
- `src/lib/voice-studio/resolveDialogVoice.ts` — kleine Helper-Erweiterung `resolveCharacterDefaultVoice(character)`

**Edge-Function-Touchpoint:** keine. Reine Frontend-Vorbelegung; `compose-dialog-scene` bekommt den vollen `dialogVoices[]`-Payload wie gehabt.

---

### Baustein 2 — Dialog-Pre-Flight Erweiterung

**Problem:** Der bestehende `RenderPreFlightDialog` (Phase 4) prüft Szenen-Basics (leerer Prompt, Drift, Continuity). **Dialog-Modus** hat aber eigene tödliche Failure-Modes, die er heute übersieht:
1. `dialogMode = true`, aber **kein Cast** → Render läuft → Hailuo-Plate ohne Sprecher → Refund.
2. `dialogMode = true`, aber **kein Skript** (`dialogScript` leer) → Sync.so bekommt 0s VO → Failure.
3. `dialogMode = true`, aber **clipSource nicht in den 7 Native-Dialog-Modellen** (kann passieren wenn Toggle nachträglich aus/an).
4. Sprecher im Skript erwähnt (`@Anna:`), aber **nicht im Cast** der Szene.
5. Skript-Zeile > ~12 s VO bei 5 s Plate (Hailuo-Limit) → Sync.so `cut_off` greift → User bekommt abgeschnittenen Dialog.

**Lösung:** `analyzeScenes()` in `RenderPreFlightDialog.tsx` um 5 neue Findings erweitern (alle als `warning` außer #1+#2 = `blocker`).

**Dateien:**
- `src/components/video-composer/RenderPreFlightDialog.tsx` — neue Checks, Icons, deutsche Texte (DE/EN/ES via vorhandenem i18n-Pattern in der Datei selbst nicht nötig — Datei ist aktuell DE-only, bleibt konsistent)
- `src/lib/video-composer/modelMapping.ts` — re-use `NATIVE_DIALOGUE_CLIP_SOURCES` für Check #3
- `src/types/video-composer.ts` — keine Änderung nötig

**Edge-Function-Touchpoint:** keine.

---

### Was bewusst NICHT in Phase A landet

- **Take-System A/B/C** → Phase B
- **Continuity Auto-Lock im Dialog-Modus** → Phase C
- **Tonality-Marker pro Zeile** (`[whisper]`, `[shouting]`) → Phase C
- **Voice-Profil-Editor mit ElevenLabs `voice_settings` pro Character** → Phase C
- Keine DB-Migration, keine neuen Edge Functions, keine Credit-Änderungen

---

### Akzeptanzkriterien

1. Wenn ich im Dialog-Modus einen Sprecher zur Szene hinzufüge, ist die Stimme **vorbelegt** und mit Gold-"Brand-Voice"-Badge markiert.
2. Wenn ein Charakter keine `default_voice_id` hat, sehe ich einen klickbaren Hinweis zur Charakter-Seite.
3. Wenn ich „Render All & Stitch" klicke und eine Dialog-Szene **leeren Cast** oder **leeres Skript** hat → Render ist **geblockt** mit klarer Fehlermeldung.
4. Wenn ich `dialogMode=true` mit z.B. `ai-hailuo` (außerhalb der 7) habe → Warnung im Pre-Flight (Render-Button bleibt aktiv, da Auto-Switch greift).
5. Wenn ich im Skript `@Anna:` schreibe, Anna aber nicht im Cast ist → Warnung mit Szenen-Nummer.

---

### Aufwand

- ~3 Frontend-Dateien
- 0 Edge Functions
- 0 DB-Migrations
- 1 Implementierungs-Runde

Soll ich loslegen?
