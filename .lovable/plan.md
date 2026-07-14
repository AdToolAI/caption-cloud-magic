# Plan: "Meine Stimmen"-Sektion im Audio Studio

Nach dem Klonen war unklar, wo die Stimme landet. Wir bauen eine sichtbare Voice-Library direkt ins Audio Studio, damit man alle eigenen Voices verwalten und testen kann.

## Was gebaut wird

1. **Neue Komponente `MyVoicesSection.tsx`** (in `src/components/audio-studio/`)
   - Grid/Liste aller Voices aus `useCustomVoices` (Filter: sichtbar für den User)
   - Pro Karte: Name, Sprache, Erstelldatum, Status-Badge (Aktiv / Inaktiv)
   - Aktionen:
     - **Preview** (Play-Button): nutzt Edge Function `preview-voice` mit einem kurzen Standardtext in der Voice-Sprache
     - **Umbenennen** (Inline-Edit)
     - **Aktiv-Toggle** (nutzt bestehendes `toggleVoiceActive`)
     - **Löschen** (mit Confirm-Dialog, nutzt bestehendes `deleteVoice`)
   - Empty State: „Noch keine eigenen Stimmen — jetzt klonen" mit CTA öffnet `VoiceStudioDialog`

2. **Integration in `src/pages/AudioStudio.tsx`**
   - Neue Sektion direkt unter der bestehenden „Eigene Stimme erstellen" Hero Card
   - Titel: **„Meine Stimmen"** mit Count-Badge (`{voices.length}`)
   - Auto-Refresh nach erfolgreichem Klonen (via `refetch` aus dem Hook)

3. **Post-Clone-Verbesserung in `VoiceStudioDialog.tsx`**
   - Success-Toast wird ergänzt um Hinweis: „Deine Stimme ist jetzt in ‚Meine Stimmen' verfügbar"
   - Dialog schließt und scrollt sanft zur neuen Sektion

## Technisches

- Datenquelle: bestehende Tabelle `custom_voices` via `useCustomVoices` Hook — keine Schema-Änderungen
- Preview: existierende Edge Function `preview-voice` (bereits im `VoicePicker` im Einsatz)
- Umbenennen: kleines Update in `useCustomVoices` — neue Funktion `renameVoice(id, name)` (UPDATE auf `custom_voices.name`)
- Design: konsistent mit James-Bond-2028 Tokens (Deep Black / Gold), Glassmorphism-Karten wie im restlichen Audio Studio

## Nicht enthalten

- Keine Änderungen am AI Video Studio / Kling Omni Panel (dort sind Custom Voices bereits über `AvatarVoicePicker` / `VoicePicker` verfügbar)
- Kein Sharing / keine Marketplace-Features für Voices
