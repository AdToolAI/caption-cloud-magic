
# Voice-Library Rollout – schrittweise, ein Studio pro Runde

Der neue `UniversalVoiceLibraryPicker` (Suche · 5 Filter · Nur-nativ · Preview · Infinite Scroll · Tier-Badges) ersetzt in **6 Studios** je einen Alt-Picker. Jede Runde: 1 Studio → du prüfst → nächste Runde. So bleibt jederzeit ein rollback-fähiger Zwischenstand.

## Reihenfolge (nach Risiko / Sichtbarkeit sortiert)

| # | Studio | Datei(en) | Alt-Picker | Sprach-Kontext |
|---|--------|-----------|------------|----------------|
| 1 | **Motion Studio** | `motion-studio/VoicePicker.tsx`, `motion-studio/CharacterEditor.tsx` | eigener `VoicePicker` (Hume/Curated Mix) | Multi-Lang, `nativeOnly` an für DE/ES |
| 2 | **AI Video Studio** (Kling Omni + TTS) | `ai-video/ToolkitGenerator.tsx` | Inline `Select` über `list-voices` | **EN-only** für Omni (`enforceNative={false}`, `language="en"`), DE/ES normal für TTS |
| 3 | **Director's Cut** | `directors-cut/studio/CapCutSidebar.tsx`, `directors-cut/features/AIVoiceOver.tsx` | Inline `Select` | Projekt-Sprache, `nativeOnly` an |
| 4 | **Universal Content Creator** | `universal-creator/steps/ContentVoiceStep.tsx` | Inline `Select` | Nutzer-gewählte Sprache |
| 5 | **Video Composer** | `video-composer/VoiceSubtitlesTab.tsx`, `video-composer/SceneDialogStudio.tsx`, `video-composer/voice-studio/SpeakerMappingBar.tsx` | Inline `Select` pro Speaker | Per-Speaker Sprache |
| 6 | **Cast & World (Avatar-Voice-Zuordnung)** | `brand-characters/AvatarVoicePicker.tsx`, `avatars/VoiceProfileCard.tsx`, `brand-characters/BrandCharacterCard.tsx` | eigener `AvatarVoicePicker` | Character-Default, Multi-Lang erlaubt |

## Pro Runde – einheitlicher Ablauf

1. **Lesen** aller betroffenen Dateien vollständig (kein Blind-Edit).
2. **Bestehende Props/Selection-Contract** dokumentieren (welche Felder werden weitergegeben: nur `voiceId` oder `{id, name, language, gender}`?). Contract bleibt kompatibel – kein Ripple.
3. **Trigger-Button beibehalten** (Look & Feel des Studios unverändert), er öffnet nur den neuen Picker.
4. Auswahl-Callback ruft weiterhin die alte `onSelectVoice(id, meta?)` Signatur.
5. **Cloned Voices** (`tier: 'cloned'`) erscheinen automatisch ganz oben – kein Extra-Code nötig.
6. Fallback: Bleibt der Nutzer offline / Cache leer, zeigt der Picker Premium + Workspace-Voices (bereits im Backend geregelt).
7. **Kein Alt-Code löschen** in der gleichen Runde – nur „unused" markieren. Aufräumen erst in Runde 7 (Cleanup).
8. Ich nenne dir am Ende der Runde: geänderte Dateien, was zu testen ist, Screenshot-Punkte.

## Runde 7 – Cleanup (erst nach OK aus 1–6)

- Alte `motion-studio/VoicePicker.tsx` und `brand-characters/AvatarVoicePicker.tsx` entfernen, falls keine weiteren Referenzen.
- `useHumeVoices` prüfen – falls nur noch von entferntem Code genutzt: raus.
- Dead-Imports & Typen bereinigen.

## Was ich für Runde 1 (Motion Studio) konkret tun werde

- `src/components/motion-studio/VoicePicker.tsx` intern durch einen Trigger-Button + `UniversalVoiceLibraryPicker` ersetzen, **Prop-Signatur unverändert** (`value`, `onChange`, `language`) → keine Änderung an den Aufrufern.
- `CharacterEditor.tsx` bleibt unangefasst (nutzt weiter `VoicePicker`).
- `nativeOnly` Default: `true` wenn `language ∈ {de, es}`, sonst `false`.
- Sichtbare Änderung: schöneres Modal, aber gleiche Auswahl-Rückgabe.

## Wenn du OK gibst

Ich starte mit **Runde 1 – Motion Studio**, melde mich mit Ergebnis + Prüfhinweisen, und warte auf dein Go für Runde 2.
