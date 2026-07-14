
# Voice Cloning Studio — Skript, Aufnahme, Enhance, Library

Kurz zur Idee: sehr gut und **schlanker Scope**. Wir haben schon `clone-voice` Edge-Function + `custom_voices` Tabelle + `VoiceLibraryPanel` in AudioStudio. Wir bauen den Upload-Dialog zu einem richtigen **Voice Studio Flow** aus. Kein neuer Backend-Stack nötig, ElevenLabs Instant Voice Clone (bereits verdrahtet) reicht.

## Was der User bekommt

Ein Dialog / Panel in `AudioStudio → Custom Voices` mit drei Schritten:

1. **Skript lesen** — vorgefertigter deutscher/englischer Trainingstext (~60–90s), der alle wichtigen Phoneme + Prosodie-Varianten abdeckt (Aussagesatz, Frage, Ausruf, Zahlen, weiche/harte Konsonanten). Copy-Button + Sprache umschaltbar.
2. **Aufnahme** — zwei Wege, side-by-side:
   - **Mikro aufnehmen**: In-Browser Recording, Web-Audio-API → WAV 16 kHz mono (kein `MediaRecorder`-Fragment-Problem). Live-Pegelanzeige, Mindestdauer 30s, Maximaldauer 180s.
   - **Datei hochladen**: MP3/M4A/OGG/WAV/OPUS (WhatsApp Voice Notes = OGG/Opus). Bis zu 5 Dateien, max 20 MB.
3. **Qualität + Klonen** — pro Sample zeigen wir: Dauer, RMS-Lautstärke, geschätzter Noise-Floor. Auto-Enhance-Toggle (default an) läuft **serverseitig** per bestehender `audio-studio-enhance` Function (Rauschentfernung / Normalisierung) bevor die gesäuberten Samples an ElevenLabs `voices/add` gehen. Danach Name + Sprache eintragen → Klonen.

Nach Erfolg landet die Stimme automatisch in der bestehenden Custom-Voices-Liste und ist im ganzen App-Voice-Picker verwendbar (VO, Motion Studio, Directors Cut) — keine Extra-Verdrahtung nötig.

## Technische Umsetzung

### Frontend
- Neuer Ordner `src/components/voice/studio/`:
  - `VoiceStudioDialog.tsx` — Stepper (Skript → Aufnahme → Review → Clone), ersetzt den heutigen `VoiceCloneDialog`.
  - `TrainingScript.tsx` — statische Skripte in `src/config/voiceTrainingScripts.ts` (DE/EN, ~120 Wörter, phonetisch balanciert).
  - `MicRecorder.tsx` — Web-Audio-API + `ScriptProcessor`/`AudioWorklet`, encodiert WAV 16 kHz mono via kleinem inline Encoder (`src/lib/audio/wavEncoder.ts`).
  - `SampleList.tsx` — Liste mit Waveform-Preview (bestehender `Wavesurfer`, sonst simple `<audio>`), Delete, Enhance-Badge.
- `useCustomVoices.ts` wird um `enhanceBeforeClone: boolean` erweitert (default true).

### Backend
- **Kein neues Modell.** Zwei bestehende Functions werden verkettet:
  1. Client uploadt Rohsamples nach Storage-Bucket `voice-samples` (private, RLS: `user_id` = erster Pfad-Segment). Falls Bucket noch nicht existiert → per `storage_create_bucket` anlegen + RLS-Policies.
  2. Neue Edge-Function `voice-sample-enhance` (dünner Wrapper) ruft für jedes Sample die vorhandene `audio-studio-enhance` Logik: Denoise + Loudness-Normalisierung auf −16 LUFS, Trim führende/hintere Stille. Ergebnis liegt in `voice-samples/enhanced/`.
  3. Bestehende `clone-voice` Function wird mit den **enhanced URLs** aufgerufen — keine Änderung an ElevenLabs-Payload nötig.
- WhatsApp-Opus wird **serverseitig** in der Enhance-Function nach WAV transkodiert (ffmpeg schon in Edge Functions verfügbar über bestehenden Audio-Enhance-Pfad). Falls nicht: fallback via `openai/gpt-4o-transcribe`-freundliches WAV re-encode Snippet.

### Storage / DB
- Neuer Bucket `voice-samples` (privat) — falls schon Bucket `voiceover-audio` mit passender RLS genutzt wird, weiterverwenden. Path: `{user_id}/{voice_draft_id}/raw/*` und `.../enhanced/*`.
- Kein Schema-Change nötig: `custom_voices.sample_urls` speichert bereits die finalen URLs. Optional Spalte `raw_sample_urls jsonb` als Backup — nur wenn User zustimmt.

### Guardrails
- Consent-Checkbox „Ich bin die Stimme oder habe die schriftliche Erlaubnis" — Pflicht vor Klonen (ElevenLabs-TOS).
- Mindestqualität: 30s Gesamt-Audio nach Trim, sonst Fehler mit klarer Meldung.
- Credit-Check vor Klonen (bestehendes Wallet-System).

## Was NICHT im Scope ist

- Realtime-Streaming-Transcription
- Multi-lingual Professional Voice Clone (dauert 4+h ElevenLabs training) — bleibt Instant Clone
- Voice-Marktplatz / Sharing zwischen Usern

## Offene Fragen

1. **Bucket-Strategie**: neuen `voice-samples` Bucket anlegen (empfohlen, klarer Scope) oder existierenden `voiceover-audio` weiternutzen?
2. **Enhance immer an?** Default AN, aber Toggle sichtbar — okay, oder soll Enhance stumm/immer laufen ohne Option?
3. **Sprachauswahl-Skripte**: erstmal nur **DE + EN**, oder direkt auch ES (weil die App dreisprachig ist)?

Wenn okay, baue ich Schritt für Schritt: (1) Trainingsskripte + WAV-Encoder, (2) Studio-Dialog mit Mic + Upload, (3) Enhance-Wrapper-Function + Bucket, (4) Integration in VoiceLibraryPanel, alten `VoiceCloneDialog` entfernen.
