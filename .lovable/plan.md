## Ziel
Kling Omni darf bei ausgewähltem Deutsch keine englisch-akzentierte Fantasiesprache mehr erzeugen. Wenn Deutsch nicht zuverlässig nativ unterstützt wird, wird Audio/Lip-Sync hart deaktiviert statt dem Nutzer ein falsches Ergebnis zu liefern.

## Befund
Die aktuelle Verdrahtung sendet zwar `spokenLanguage=de` und hängt den Dialog an den Prompt, aber das Replicate-API-Beispiel für `kwaivgi/kling-v3-omni-video` dokumentiert nur `prompt`, `duration` und `generate_audio`. Das spricht dafür, dass `dialog`, `spoken_language`, `voice` und `speaker_voices` zumindest nicht zuverlässig als harte Steuerparameter wirken. Deshalb erfindet Kling weiterhin Sprache aus dem Prompt.

## Plan

### 1. Kling Omni Deutsch/Spanisch nicht mehr als „native Lip-Sync kompatibel“ ausweisen
- In der AI-Video-Studio-Logik wird Kling Omni für native Provider-Stimmen nur noch als zuverlässig für Englisch behandelt.
- Für Deutsch/Spanisch greift automatisch der bestehende Ambient/Silent-Fallback.
- Die UI-Texte wie „Native Lip-Sync in DE/EN/ES“ werden korrigiert, damit nichts versprochen wird, was das Modell nicht stabil liefert.

### 2. Harte Runtime-Sperre gegen Fantasie-Sprache
- Wenn Kling Omni aktiv ist und `effectiveSpokenLang !== 'en'`:
  - `generateAudio` wird vor dem Backend-Call deaktiviert bzw. `suppressDialogue=true` gesetzt.
  - `dialogText`, `voicePreset`, `speakerVoices`, `nativeLipSync` werden nicht gesendet.
  - Der Prompt bekommt eine klare Silence-Direktive: keine Sprache, keine Lippenbewegung zu Sprache, nur Ambient/Roomtone.

### 3. Backend zusätzlich absichern
- In `generate-kling-video` wird dieselbe Regel serverseitig gespiegelt: Kling Omni + nicht-Englisch + Dialog/Audio wird nicht an den Provider weitergereicht.
- Dadurch kann auch ein veralteter Client oder ein manipulierter Request keine deutsche Fantasiesprache auslösen.
- Provider-Input-Logging bleibt, aber ohne sensible Inhalte; es zeigt klar, ob `suppressDialogue` aktiv ist.

### 4. UI ehrlich machen
- Im Kling-Omni-Panel bei Deutsch anzeigen: Deutsch ist für Kling Omni aktuell silent-only; für echtes deutsches Lip-Sync muss die Motion-Studio/gesicherte Pipeline genutzt werden.
- Der Lip-Sync-Schalter für Omni wird bei Deutsch/Spanisch deaktiviert oder automatisch auf „aus“ gesetzt, damit keine Credits für ein erwartbar falsches Ergebnis ausgegeben werden.

### 5. Smoke-Test / Verifikation
- Prüfen, dass ein deutscher Omni-Request keinen `dialog`, kein `spoken_language=german`, kein `generate_audio=true` und keine Voice-Felder mehr an Kling sendet.
- Prüfen, dass Englisch weiterhin mit Omni Native Audio/Lip-Sync möglich bleibt.
- Edge Function deployen.

## Ergebnis
Deutsch in Kling Omni produziert dann nicht mehr „Fairytale-Sprache“, sondern gar keine Provider-Stimme/Lip-Sync. Das ist die sichere Variante, bis Kling Omni über die API eine wirklich steuerbare deutsche Dialog-/Voice-Schnittstelle bereitstellt.