## Voice Studio — Skript sichtbar während Aufnahme + Namens-Platzhalter

### Änderungen

**1. `src/config/voiceTrainingScripts.ts`**
- „Alex" in allen drei Sprachen (DE/EN/ES) durch Platzhalter `{NAME}` ersetzen (nur an der Vorstellungsstelle).
- Optional Hint-Text ergänzen: „Ersetze {NAME} durch deinen eigenen Namen."

**2. `src/components/voice/studio/VoiceStudioDialog.tsx`**
- **Step 1 (Skript):** Neues Eingabefeld „Dein Name" oberhalb des Skript-Textes. Der Platzhalter `{NAME}` wird live im angezeigten Skript ersetzt (Fallback: „[Dein Name]" wenn leer). Name in State (`speakerName`) speichern.
- **Step 2 (Aufnehmen):** Neues, kompaktes, scrollbares Skript-Panel oberhalb der Mikrofon/Upload-Tabs. Zeigt das personalisierte Skript in lesbarer Typo (max-height ~40vh, monospace-freundlich, ruhiger Kontrast, sticky beim Scrollen im Dialog). Auch beim Upload-Tab sichtbar, damit User die WhatsApp-Nachricht danach aufnehmen kann.
- Name optional als `description`-Präfix an `cloneVoice` weitergeben (z. B. „Voice of {Name}"), damit er in der Library erkennbar ist — nur falls Feld leer bleibt, unverändert.

### Nicht geändert
- Aufnahme-/Upload-Logik, Cloning-Pipeline, Backend-Funktion `clone-voice`.
- Voice-Library-Panel und Audio-Studio-Einstiege.

### Technische Details
- `{NAME}`-Replace über einfache `String.replaceAll` in einer memoisierten `personalizedScript`-Variable.
- Skript-Panel: `<ScrollArea>` aus shadcn, `whitespace-pre-wrap`, dezenter Border + `bg-muted/40`.
