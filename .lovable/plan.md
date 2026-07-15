## Ziel

Music Studio (`universal_audio_assets` + Stock) und Voice Library (`useCustomVoices` → `user_voices`) so verdrahten, dass **jede** Kreativ-Oberfläche denselben Datenstand sieht — keine Sample-Libraries, keine hardcoded ElevenLabs-Presets, keine Duplikate.

## Ist-Zustand (Audit)

**Voice Library (`useCustomVoices` / user_voices):**
| Studio | Voice Library eingebunden? |
|---|---|
| Cast & World | ✅ `AvatarVoicePicker` |
| Motion Studio | ✅ `VoicePicker` |
| Video Composer / TalkingHead | ✅ `TalkingHeadDialog`, `SceneDialogStudio` |
| Universal Content Creator (Step: Voiceover) | ❌ nur `list-voices` (ElevenLabs-Presets) |
| AI Video Studio (Kling Omni Panel) | ❌ nur 5 hardcoded `voicePreset` Werte (`neutral` etc.) |
| Director's Cut (Timeline) | ❌ kein Voice-Picker für VO-Clips |

**Music Library (`universal_audio_assets` type='music' + Stock via `MusicLibraryBrowser`):**
| Studio | Library eingebunden? |
|---|---|
| Video Composer / AudioTab | ✅ `MusicLibraryBrowser` |
| Universal Content Creator | ✅ `AudioAssetSelector` |
| Director's Cut (AIToolsSidebar + FloatingAIPanel) | ❌ hardcoded `SAMPLE_MUSIC` + eigene Search-UI |
| Motion Studio | ❌ kein Music-Selector |
| AI Video Studio | ❌ kein Music-Selector (Nutzer muss zu Motion Studio wechseln) |

## Umsetzungsplan — 2 Phasen

### Phase 1 — Voice Library überall (Priorität A)

1. **Universal Content Creator → `ContentVoiceStep.tsx`**
   - Neben `list-voices` zusätzlich `useCustomVoices()` laden.
   - Gruppierte Select-Optionen: „⭐ Meine geklonten Stimmen" (aktive `user_voices` mit `elevenlabs_voice_id`) → dann „ElevenLabs Premium" → dann restliche.
   - Bei Auswahl einer Custom Voice: `voiceId` = `elevenlabs_voice_id`, `voiceName` = `name`. `generate-voiceover` läuft unverändert (nimmt beliebige EL Voice-ID).

2. **AI Video Studio → `ToolkitGenerator.tsx` (Kling Omni Cast Panel)**
   - `voicePreset` (Enum `neutral|warm|energetic|deep|bright`) erweitern zu einer **Voice-Source**-Struktur:
     - Preset (bisher) **oder** Custom-Voice-ID aus `useCustomVoices()`.
   - UI: bestehendes `<Select>` bekommt Sektionen „Presets" + „Meine Stimmen".
   - Wenn Charakter ein `default_voice_id` hat, wird diese automatisch vorselektiert (heute im Code schon vorbereitet, aber nicht ausgewertet).
   - Payload an `generate-kling-video`: neues optionales Feld `voice_id` pro Speaker; Preset bleibt Fallback. (Edge Function nimmt es aktuell noch nicht — separate Anpassung darin.)

3. **Director's Cut → Timeline VO-Regeneration**
   - Bestehendes VO-Clip-Kontextmenü um „Stimme wechseln / VO neu rendern" ergänzen mit `useCustomVoices()` + Presets.
   - Kein neuer Timeline-Track — nur Regenerate-Button.

### Phase 2 — Music Library überall (Priorität B)

4. **Director's Cut → `AIToolsSidebar.tsx` + `AIToolsSidebarExpanded.tsx` + `FloatingAIPanel.tsx`**
   - `SAMPLE_MUSIC` und eigene Search-UI komplett entfernen.
   - Stattdessen `<MusicLibraryBrowser>` als Dialog öffnen → Auswahl produziert einen Audio-Clip auf `track-music` (bestehender `handleAddMusic`-Kontrakt bleibt, nur die Quelle wechselt).

5. **Motion Studio + AI Video Studio → optionale Background-Music**
   - Kleiner „🎵 Musik hinzufügen"-Button, öffnet denselben `MusicLibraryBrowser`.
   - Motion Studio: schreibt `backgroundMusicUrl` in den Render-Payload (`compose-video-clips` / Motion Composer supportet das bereits über `background_music_url`).
   - AI Video Studio: als Post-Render-Overlay — der ausgewählte Track wird auf das gerenderte Video-Asset gemerged (neuer Edge-Function-Call `mix-audio-track` — dünner Wrapper um bestehende ducking-Pipeline). Alternativ: nur Metadaten speichern, Mixing beim Übergang in Director's Cut.

## Vereinheitlichte Datenkontrakte

- **Voice-Ref** (überall): `{ source: 'preset' | 'custom' | 'elevenlabs', id: string, name?: string }`.
- **Music-Ref** (überall): `LibraryTrack` (bereits Standard im Video Composer) — kein neuer Typ nötig.
- `MusicLibraryBrowser` wird aus `src/components/video-composer/` nach `src/components/media/MusicLibraryBrowser.tsx` verschoben (Re-Export aus dem alten Pfad, damit nichts bricht).

## Nicht enthalten

- Keine Änderungen an den Music-/Voice-Preisen oder am Generierungs-Flow selbst.
- Kein neues UI für Voice-Cloning oder Music-Generierung — die bleiben in Voice Studio / Music Studio.
- Keine Timeline-Refactorings im Director's Cut außer dem Music-Source-Swap.

## Rückfrage

Der Umfang ist real — Phase 1 ist ~4 Files, Phase 2 sind ~6 Files + eventuell ein neuer Edge-Function-Wrapper. Wie soll ich vorgehen?

**A) Beide Phasen komplett** (Voice + Music überall, größerer Wurf, empfohlen für „professionelle Verdrahtung").
**B) Erst Phase 1 (Voice)** — ausliefern & testen, dann Phase 2.
**C) Nur bestimmte Studios** — sag mir, welche zuerst, dann gehe ich chirurgisch vor.

Und beim AI Video Studio Music (Punkt 5): soll die Musik direkt auf das gerenderte Video gemischt werden, oder reicht Metadaten-Übergabe an Motion Studio / Director's Cut für den finalen Mix?