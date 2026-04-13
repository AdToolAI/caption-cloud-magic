

## Plan: Voiceover aus Untertiteln generieren mit Lautstärke-Regler

### Feature
In der CapCut-Sidebar (Untertitel-Tab) erscheint ein neuer Bereich "Voiceover aus Untertiteln", wenn Untertitel mit Text vorhanden sind. Der User kann:
- Per Klick alle Untertitel-Texte zu einem zusammenhängenden Voiceover generieren lassen
- Stimme und Sprache wählen
- Die Lautstärke des generierten Voiceovers einstellen
- Das Voiceover wird automatisch als Clip in den Voiceover-Track eingefügt

### Umsetzung

**1. Neue UI-Sektion in `CapCutSidebar.tsx`** (nach der AI-Script-Sektion, ca. Zeile 1375)
- Komponente `SubtitleVoiceoverSection` — sichtbar wenn Untertitel mit Text vorhanden sind
- Voice-Select (Sarah, Roger, Aria, Laura etc.) + Sprache (DE/EN/ES)
- Lautstärke-Slider (0–100%)
- "Voiceover generieren" Button
- Nutzt die bestehende Edge Function `director-cut-voice-over` mit dem kombinierten Untertitel-Text
- Bei Erfolg: Callback `onVoiceOverGenerated` aufrufen → fügt Clip automatisch in den Voiceover-Track ein (bestehende Logik in CapCutEditor)

**2. Props erweitern** in `CapCutSidebar`
- `onVoiceOverGenerated` Prop durchreichen (existiert bereits in CapCutEditor, muss nur an Sidebar weitergegeben werden)

**3. Voiceover-Lautstärke** 
- Der Volume-Slider steuert die Track-Lautstärke des Voiceover-Tracks
- Dazu `onVoiceoverVolumeChange` Callback oder direktes Setzen über bestehende Audio-Track-Logik

**4. Translations** in `src/lib/translations.ts`
- Neue Keys: `dc.subtitleVoiceover`, `dc.subtitleVoiceoverDesc`, `dc.generateVoiceoverFromSubs`, `dc.voiceoverVolume`, `dc.voiceoverVoice` (DE/EN/ES)

### Dateien
- **Edit**: `src/components/directors-cut/studio/CapCutSidebar.tsx` — Neue `SubtitleVoiceoverSection` Komponente + Props
- **Edit**: `src/components/directors-cut/studio/CapCutEditor.tsx` — `onVoiceOverGenerated` an Sidebar durchreichen
- **Edit**: `src/lib/translations.ts` — Neue Übersetzungskeys

### Bestehende Infrastruktur (wird wiederverwendet)
- Edge Function `director-cut-voice-over` — generiert TTS via ElevenLabs, speichert in Storage
- `onVoiceOverGenerated` Callback — fügt Audio automatisch in Voiceover-Track ein
- Voiceover-Track mit Volume-Control in der Timeline

