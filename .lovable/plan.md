## Ziel

Eine einzige, zentrale Stimmen-Auswahl für die gesamte Plattform: überall volle Bibliothek (8.477 Stimmen), volle Sprachauswahl (21 Sprachen), **kategorisch vorsortiert** — auch für Sprecher 2, 3 und 4. Alle hartcodierten Mini-Listen werden entfernt, nicht nur ergänzt.

## Warum so

Aktuell existieren mindestens sechs parallele Stimmen-Auswahlen mit eigenen Listen und eigener Sprachlogik. Jede Änderung müsste sechsmal gepflegt werden — daher stammt der aktuelle Fehler. Der Plan konsolidiert auf **eine** Komponente + **eine** Datenquelle und ergänzt eine Kategorie-Navigation, damit aus 8.477 Stimmen in zwei Klicks die passende wird.

## 1. Kategorien-Ebene (neu)

`src/lib/voice-categories.ts` — kuratierte Kategorien, gemappt auf die vorhandenen Facetten von `list-voices` (`use_case`, `gender`, `age`, `accent`, `tier`):

| Kategorie | Mapping |
|---|---|
| ⭐ Meine Stimmen | eigene Clones (`custom_voices`) |
| 📣 Werbung & Ads | `use_case=social_media/conversational`, energetisch |
| 🎙️ Erzähler & Hörbuch | `use_case=narration` |
| 🎭 Charaktere & Rollen | `use_case=characters` |
| 📰 Nachrichten & Seriös | `use_case=news` |
| 🧒 Jung & Frisch | `age=young` |
| 👔 Reif & Autoritär | `age=old/middle_aged` + männlich/weiblich |
| 🌍 Akzente | Gruppierung nach `accent` innerhalb der Sprache |

Im `UniversalVoiceLibraryPicker`:
- linke Kategorie-Spalte (Desktop) bzw. horizontale Chip-Leiste (Mobile) mit Trefferzahl pro Kategorie
- Quick-Filter-Chips darüber: Geschlecht, Alter, Nativ-only, Sortierung
- **„Empfohlen für diesen Kontext"** ganz oben: der aufrufende Bereich gibt eine Default-Kategorie mit (Content Creator → Werbung, Hörbuch-Cast → Erzähler, Szenendialog → Charaktere, Nachrichten-Template → News)
- „Zuletzt verwendet" (lokal pro Nutzer gespeichert) als erste Zeile

Serverseitig: `list-voices` bekommt optional `category` und liefert `facetCounts` zurück, damit die Zahlen echt sind statt clientseitig geschätzt.

## 2. Single Source of Truth

Neu:
- `src/components/voices/VoiceSlot.tsx` — kanonische Auswahl-Zeile: Sprechername, aktuelle Stimme (Name, Sprache, Kategorie-/Tier-Badge), Buttons „Bibliothek", Vorhören, Entfernen.
- `src/components/voices/VoiceLanguageSelect.tsx` — Sprach-Dropdown über `VOICE_LANGUAGES` (21 Sprachen).
- `src/lib/voice-defaults.ts` — sprach- und kategoriebewusste Default-Stimme statt hartcodierter 4er-Liste.

## 3. Einbau + Rückbau (pro Datei)

| Datei | Aktion |
|---|---|
| `universal-creator/steps/ContentVoiceStep.tsx` | DE/EN/ES-Tabs → `VoiceLanguageSelect`; Select → `VoiceSlot` (Screenshot-Bereich), Default-Kategorie „Werbung" |
| `video-composer/VoiceSubtitlesTab.tsx` | Tabs + `voicesForTab`-Filter raus → `VoiceSlot` |
| `video-composer/SceneDialogStudio.tsx` | `elPickerEntries`-Dropdown pro Sprecher → `VoiceSlot`, Kategorie „Charaktere" (hier fehlt die Bibliothek heute komplett) |
| `video-composer/briefing/ScriptSpeakerMapper.tsx` | Sprecher-Zeilen → `VoiceSlot` |
| `video-composer/TalkingHeadDialog.tsx` | → `VoiceSlot` |
| `video-composer/voice-studio/SpeakerMappingBar.tsx` | Ad-hoc-Picker + `elDefaults`-Array → `VoiceSlot` |
| `audio-studio/audiobook/AudiobookCastPanel.tsx` | → `VoiceSlot`, Kategorie „Erzähler" |
| `motion-studio/VoicePicker.tsx` | dünner Wrapper um `VoiceSlot` |
| `video/VoiceOverEditor.tsx` | hartcodiertes `VOICE_OPTIONS` (10 Stimmen) löschen → `VoiceSlot` |

Hume bleibt erhalten, wo es heute wählbar ist: Engine-Umschalter über dem Slot.

## 4. Sprache pro Sprecher

Jeder Slot speichert `language` im bestehenden Config-Objekt (`speakerMap[id].language`, Dialog-Voice-Config, Audiobook-Cast, `voiceoverConfig`) und reicht sie an die TTS-Edge-Functions, die sie über `_shared/tts-language.ts` auf `language_code` + `eleven_turbo_v2_5` pinnen. Kein DB-Umbau nötig (JSONB vorhanden).

## 5. Absicherung

- Generieren blockt, wenn ein Sprecher keine gültige `voiceId` hat (statt still auf Aria zu fallen).
- Vitest-Guard: keine hartcodierten ElevenLabs-Voice-IDs mehr im `src/`-Baum.
- Memory `mem://features/voice/language-wiring.md` um „ein Slot, eine Quelle + Kategorien" ergänzen.

## Nicht enthalten
Keine Änderungen an Preisen/Credits, Lip-Sync-Pipeline oder Render-Pfaden.
