
## Fix: Custom-Voice („Samuel Dusatko") wird im Studio verworfen + Cast-Default wird nicht als Fallback benutzt

### Root Cause
`SceneDialogStudio.tsx` verwirft jede Auswahl aus dem Picker, deren `voiceId` ein UUID ist (Row-ID einer geklonten Stimme aus `custom_voices`). Grund: `cleanDialogVoiceCfg` läuft blind durch `cleanVoiceId`, das UUIDs als „ungültig" filtert — der Filter existiert um Provider-Namen wie `sync-3`/`lipsync-2` zu blockieren, trifft aber Custom-Voice-IDs mit.

Zweiter Layer: Der `default_voice_id` aus Cast & World (via `defaultVoiceByCharId`) wird zwar für den „Brand"-Badge gelesen, aber nie in die effektive Voice-Map (`resolvedVoicePerSpeaker`) übernommen — d. h. wenn du in Cast & World einen Default zuordnest, hilft das im Studio bisher nichts.

### Änderungen (frontend-only, kein DB-Migrationsbedarf)

**1) `src/components/video-composer/SceneDialogStudio.tsx` — `cleanDialogVoiceCfg`**
- Bei `cfg.isCustom === true`: Cfg unverändert durchreichen. Optional: `voiceName` mit "⭐ …" auffüllen wenn leer.
- Bei `cfg.isCustom !== true`: bisheriger `cleanVoiceId`-Pfad bleibt.

**2) `src/components/video-composer/SceneDialogStudio.tsx` — `resolvedVoicePerSpeaker` (Zeile 785)**
- Neuer Fallback in der Kette:
  `existing (voicePerSpeaker/scene.dialogVoices) → fromSceneRoot (single-speaker) → **brandDefault via defaultVoiceByCharId[sp.id]** → undefined`
- `brandDefault` als ElevenLabs-Voice via `toElevenLabsDialogVoice(brandDefault, getAutoVoiceName(brandDefault) ?? 'Brand-Stimme', false)` einsetzen.
- Damit wird die Cast-&-World-Zuordnung endlich als tatsächliche Studio-Voice benutzt (nicht nur als Chip).

**3) `src/components/video-composer/SceneDialogStudio.tsx` — Auto-Bind-Effect (Zeile 825)**
- Der Effect erweitert `patched` nun auch, wenn der neue `chosen` aus dem brandDefault-Fallback kommt — d. h. beim Öffnen einer Szene wird die Cast-&-World-Voice einmal in `voicePerSpeaker` persistiert und an `onUpdate({ dialogVoices })` durchgereicht. Guard bleibt: keine Endlos-Schleife, weil das Custom-Voice-Objekt stabil ist.

**4) `src/components/video-composer/SceneDialogStudio.tsx` — `updateSpeakerVoice` (Zeile 600)**
- Beim Custom-Voice-Pick zusätzlich `engine: 'elevenlabs'` explizit setzen (bisher nur aus `cur` geerbt) — verhindert, dass ein vorher auf Hume stehender Cfg-Wert die Custom-Voice fälschlich als Hume interpretiert.

**5) `src/lib/video-composer/autoVoiceAssignment.ts` — `cleanVoiceId` bleibt unverändert**
- Bewusst NICHT anfassen: der UUID-Filter hat legitime Zwecke (verhindert, dass Provider-Modell-IDs oder alte `characterVoiceId`-Werte, die versehentlich UUIDs sind, als Voice-IDs interpretiert werden). Der Fix wird gezielt eine Ebene höher in `cleanDialogVoiceCfg` gemacht, wo wir das `isCustom`-Signal kennen.

### Was das für den User ändert
- „Samuel Dusatko" (geklonte Stimme) lässt sich im Studio auswählen und bleibt.
- Cast-&-World-Zuordnung wirkt sofort: neue Szene öffnen → Samuel hat automatisch die zugeordnete Stimme, ohne Nachpicken.
- Andere Sprecher (Matthew/Sarah/Kailee) verhalten sich unverändert.

### Kein Backend-Eingriff nötig
- Keine Edge-Function-Änderung: `generate-voiceover` und alle Lip-Sync-Dispatcher lesen bereits `cfg.isCustom ? cfg.elevenlabsVoiceId : cfg.voiceId` (Zeilen 611, 1035, 1487) — der echte ElevenLabs-Key wird korrekt an ElevenLabs weitergegeben.
- Keine Migration: `custom_voices`-Schema bleibt gleich.

### Verifikation nach Umsetzung
1. In Cast & World Samuel Dusatko die geklonte Stimme zuweisen → Studio öffnen → Samuel-Zeile zeigt Stimmenname + „Brand"-Chip, kein „Setup"-Chip mehr.
2. Manuell im Picker eine andere Custom-Voice wählen → bleibt persistiert nach Klick (nicht nur Toast).
3. Preview-Button ▶ auf Samuel → ElevenLabs gibt die Custom-Voice zurück.
4. „Clip generieren mit Voiceover" → keine „Wähle eine Stimme für …"-Toast mehr.
