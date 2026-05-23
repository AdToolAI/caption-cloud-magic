## Phase C — Continuity Auto-Lock + Tonality-Marker + Voice-Profil-Editor

Drei Bausteine, die den Dialog-Pipeline-Loop schließen: Charakter bleibt visuell konsistent, Performance pro Zeile wird steuerbar, Brand-Voice ist tatsächlich „Brand".

---

### Baustein 1 — Continuity Auto-Lock im Dialog-Modus

**Problem:** Bei Multi-Take/Multi-Scene Dialogen driftet der Hailuo-Plate optisch (Kleidung, Frisur, Licht), obwohl wir denselben Avatar nutzen. Continuity-Drift gibt's, wird im Dialog-Modus aber nicht automatisch genutzt.

**Lösung:**
- In `compose-dialog-scene`: nach dem ersten erfolgreichen Plate-Render wird der `lastFrameUrl` (bzw. Mid-Frame via Client-Hook `useFrameContinuity`) als **Lock-Reference** in `composer_scenes.lock_reference_url` gespeichert (sofern `dialogMode=true` und Szene noch keinen Lock hat).
- Folgeszenen mit demselben Cast bekommen diesen Frame automatisch als zusätzliche i2v-Referenz in den Hailuo-Payload injiziert (zweite Image-Slot, neben dem Scene-Anchor).
- UI: Im `SceneDialogStudio` ein neues Badge **„Continuity locked"** mit Toggle (User kann Lock per Szene rauswerfen oder neu setzen). Bei Lock-Bruch (z.B. anderer Cast) wird Lock auto-cleared.

**Dateien:**
- `src/components/video-composer/SceneDialogStudio.tsx` — Badge + Toggle
- `src/hooks/useFrameContinuity.ts` — kleine Erweiterung: `extractFirstThirdFrame` (für stabilere Lock-Ref als Last-Frame)
- `src/components/video-composer/VideoComposerDashboard.tsx` — auto-Propagation des Locks an Folgeszenen mit gleichem Cast
- `supabase/functions/compose-dialog-scene/index.ts` — wenn `lockReferenceUrl` mitgesendet → als zweite `referenceImages[]` an Hailuo

**Edge-Function-Touchpoint:** ja, eine Datei, additive Logik.

---

### Baustein 2 — Tonality-Marker pro Zeile

**Problem:** Alle Dialog-Zeilen klingen gleich (gleiches ElevenLabs `voice_settings`), egal ob Flüstern, Schreien oder ruhig erzählend. Im Werbespot tödlich.

**Lösung:**
- Skript-Syntax-Erweiterung in `parseDialogScript.ts`:
  ```
  Sarah [whisper]: Komm näher...
  Matthew [shouting]: PASS AUF!
  Sarah: Das war knapp.   ← kein Marker = default
  ```
- 8 Presets im neuen `src/config/dialogTonalityPresets.ts`:
  `neutral, whisper, shouting, excited, calm, serious, playful, sad`
  Jeder mappt auf ein ElevenLabs-Tuning (stability/style/speed) – analog `adTonalityVoiceMap`.
- `DialogBlock` bekommt `tonality?: DialogTonalityId`.
- TTS-Synth in `SceneDialogStudio.tsx` übergibt das Tuning pro Zeile an `generate-voiceover`.
- Take-Key (Phase B) wird invalidiert, wenn sich Tonality ändert → automatischer Re-Roll möglich, alte Takes bleiben in der Historie.
- UI: pro Block ein kleiner Tonality-Pill-Dropdown (Default folgt dem Skript-Marker, kann pro Block überschrieben werden).

**Dateien:**
- `src/config/dialogTonalityPresets.ts` (neu)
- `src/lib/talking-head/parseDialogScript.ts` — Regex erweitern, `tonality` extrahieren
- `src/lib/talking-head/dialogTakeKey.ts` — Tonality in den Hash mit aufnehmen
- `src/components/video-composer/SceneDialogStudio.tsx` — Pill + Tuning-Übergabe
- `src/components/video-composer/DialogTakeStrip.tsx` — Tonality-Pill an aktivem Take anzeigen

**Edge-Function-Touchpoint:** keine — `generate-voiceover` akzeptiert `voice_settings` bereits.

---

### Baustein 3 — Voice-Profil-Editor pro Brand Character

**Problem:** `default_voice_id` reicht nicht — eine Stimme klingt je nach `stability/similarity/style/speed` komplett anders. Heute hat jeder Character nur die nackte Voice-ID.

**Lösung:**
- Neue Spalte `brand_characters.voice_settings` (jsonb, nullable), Struktur:
  ```ts
  { stability:0.5, similarityBoost:0.75, style:0.3, useSpeakerBoost:true, speed:1.0 }
  ```
- Auf `/avatars/:id` neue Karte **„Voice Profile"**:
  4 Slider + 1 Toggle + ein „Preview"-Button, der einen 5-Sek-Test mit der gewählten Voice + Settings synthetisiert.
- Im Composer (`SceneDialogStudio`): wenn Character ein `voice_settings` hat, wird es als Default in den TTS-Call injiziert. Tonality-Marker aus Baustein 2 wird auf dem Brand-Setting **multiplikativ** (clampt auf [0,1]) als Modulation appliziert, sodass Brand-Identität nie komplett überschrieben wird.
- Gold-„Brand-Voice"-Badge aus Phase A wird zu „Brand-Voice + Profile" wenn `voice_settings` vorhanden.

**Dateien:**
- DB-Migration: `ALTER TABLE brand_characters ADD COLUMN voice_settings jsonb`
- `src/components/avatars/VoiceProfileCard.tsx` (neu)
- `src/pages/AvatarDetail.tsx` (bzw. die existierende Detail-Seite) — Karte einhängen
- `src/lib/voice-studio/resolveDialogVoice.ts` — `resolveCharacterVoiceProfile(character)` + `mergeWithTonality(profile, tonality)`
- `src/components/video-composer/SceneDialogStudio.tsx` — Profile-Merge vor TTS-Call

**Edge-Function-Touchpoint:** keine.

---

### Was bewusst NICHT in Phase C landet

- Auto-Tonality-Detection aus Skript-Text via LLM → später (Phase D)
- Pro-Take individuelle Tonality-Overrides → Phase D
- Voice-Cloning UI im Editor → bleibt im bestehenden Voice Studio

---

### Akzeptanzkriterien

1. Sobald in einer Dialog-Szene der erste Plate gerendert ist, sehe ich ein **„Continuity locked"** Badge; die nächste Dialog-Szene mit demselben Cast bekommt die Lock-Reference automatisch ohne mein Zutun.
2. Schreibe ich `Sarah [whisper]: ...`, klingt die Zeile hörbar leiser/intimer als eine Default-Zeile von Sarah, ohne dass ich an Settings drehe.
3. Ändere ich auf `/avatars/:id` Sarahs `stability` von 0.5 auf 0.8, klingen **alle** neu gerenderten Dialog-Takes von Sarah ruhiger — alte gepinnte Takes bleiben unverändert.
4. Ein Lock wird automatisch gelöscht, wenn ich den Cast einer Szene komplett austausche.
5. Take-Keys aus Phase B invalidieren korrekt, wenn ich nur die Tonality einer Zeile ändere (Text bleibt gleich).

---

### Aufwand

- 1 DB-Migration (additive Spalte)
- 1 Edge-Function-Edit (`compose-dialog-scene`, additiv)
- ~6 Frontend-Dateien + 1 neuer Config + 1 neue Karte
- 0 neue Edge Functions, 0 Credit-Änderungen

Soll ich loslegen?
