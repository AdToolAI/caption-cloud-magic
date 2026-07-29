## Ist-Stand (geprüft)

**Sprache korrekt verdrahtet (Bibliothek + Sprachfilter):**
- Universal Content Creator (`ContentVoiceStep`) — Picker mit `language={selectedLanguage}`
- Director's Cut (`AIVoiceOver`) — Sprach-Tabs + Picker
- Hörbuch (`AudiobookCastPanel`) — Picker mit Projektsprache, Server sendet `language_code`

**Nicht verdrahtet:**
- **Cast & World** (`AvatarVoicePicker`): feste Liste von 9 englischen ElevenLabs-Stimmen, kein Sprachfilter, kein Zugriff auf die 8.477er-Bibliothek.
- **Motion Studio** (`VoicePicker`): nutzt zwar die Bibliothek, ist aber hart auf `language="all"` gesetzt — keine Projektsprache.
- **Video Composer Sprecher-Mapping** (`SpeakerMappingBar`): eigene Kurzliste + Hume-Fallback-ID, unabhängig von der Sprachwahl.
- **Legacy** `VoiceOverEditor` / `VoiceProfileCard` / Companion: fixe Voice-Styles.
- **Serverseitig:** nur `render-audiobook` sendet `language_code`. `generate-voiceover`, `preview-voice`, `director-cut-voice-over`, `generate-video-voiceover`, `generate-multi-speaker-vo` schicken nur `eleven_multilingual_v2` ohne Sprach-Pin → genau das Muster, das früher zu Englisch-/Fantasiesprache-Drift geführt hat.
- **Bibliothek** kann 9 Sprachen, der Picker-Typ erlaubt aber nur `de | en | es | all`.

## Umsetzungsplan

1. **Picker-Sprachen erweitern**: `UniversalVoiceLibraryPicker`/`useVoiceLibrary` von `de|en|es|all` auf den vollen Sprachcode-Satz der Bibliothek öffnen (String-Typ + Sprach-Dropdown mit den tatsächlich vorhandenen Sprachen aus `list-voices`).
2. **Cast & World**: `AvatarVoicePicker` auf den Universal-Picker umstellen (feste 9er-Liste entfällt), Sprache aus Brand-/UI-Sprache vorbelegen, gewählte Sprache zusammen mit `default_voice_id` am Charakter speichern.
3. **Motion Studio**: `VoicePicker` bekommt eine `language`-Prop; Aufrufer (CharacterEditor etc.) geben die Projektsprache durch statt `all`.
4. **Video Composer**: `SpeakerMappingBar` auf den Universal-Picker + Projektsprache umstellen, Fallback-Voice sprachabhängig statt fester ID.
5. **Serverseitiger Sprach-Pin** (zentral): gemeinsamer Helper in `supabase/functions/_shared/`, der bei jedem ElevenLabs-TTS-Call `language_code` setzt und bei gesetzter Sprache automatisch auf ein sprachfähiges Modell (`eleven_turbo_v2_5`/`eleven_v3`) wechselt, sonst `eleven_multilingual_v2` behält. Eingebaut in `generate-voiceover`, `preview-voice`, `director-cut-voice-over`, `generate-video-voiceover`, `generate-multi-speaker-vo`, `companion-speak`.
6. **Clients senden `language`** bei jedem dieser Aufrufe mit (UCC, DC, Composer, Motion Studio, Cast-Preview, Companion).
7. **Legacy-Pfade** `VoiceOverEditor` / `VoiceProfileCard`: entweder auf den Universal-Picker heben oder — falls ungenutzt — entfernen; ich prüfe die Referenzen und entscheide pro Datei.

## Technische Details

- Kein Schema-Wechsel nötig, außer optional einer Spalte `default_voice_language` auf `brand_characters` (Migration), damit Cast-Stimmen beim erneuten Öffnen mit richtiger Sprache vorgefiltert werden.
- `language_code` wird nur gesetzt, wenn die Stimme laut `supported_languages` die Zielsprache kann; sonst Warnung im Picker („nicht nativ").
- Prüfung nach dem Umbau: Preview je Sprache in Cast & World, Motion Studio und Composer.
