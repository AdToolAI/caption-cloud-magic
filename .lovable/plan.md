## Befund

Ja — die Voice wird inzwischen in der Datenbank automatisch gesetzt, aber das Frontend zeigt sie noch nicht korrekt an.

Aktueller DB-Stand der neuesten 3 Szenen:

- `character_voice_id = JBFqnCBsd6RMkjVDRZzb` → George
- `dialog_voices = { 483f9cdc...: JBFqnCBsd6RMkjVDRZzb }`
- Samuel hat weiterhin keine Avatar-Default-Voice, aber `gender = male`

Das heißt: Die Auto-Zuweisung funktioniert backend-/persistenzseitig. Der sichtbare Fehler ist jetzt die UI-Bindung in `SceneDialogStudio.tsx`.

Warum zeigt der Select trotzdem „Stimme wählen“?

- Die DB speichert `dialog_voices` unter der Brand-Character-ID `483f9cdc...`.
- Die UI-Speaker-Liste nutzt aber häufig die lokale Composer-Character-ID `sp.id`.
- Im Render liest der Select nur `voicePerSpeaker[sp.id]`.
- Dadurch existiert die Voice unter dem Alias-Key, aber der sichtbare Select schaut auf den falschen Key.

## Ziel

Wenn `dialog_voices`, `character_voice_id` oder ein AI-Pool-Fallback existiert, darf das Frontend nie mehr „Stimme wählen“ zeigen.

Akzeptanz:
- Samuel zeigt sofort eine konkrete Stimme, z. B. George/Brian/Liam.
- Das Auto-Badge erscheint, wenn die Stimme aus dem AI-Pool kommt.
- Der Play-Button ist aktiv.
- Nach Reload bleibt die Stimme sichtbar.
- Bei bis zu 4 Sprechern bleiben die Stimmen unterscheidbar.

## Patch-Plan

### 1. UI-Key-Resolver für Sprecher einbauen
In `SceneDialogStudio.tsx` eine kleine Helper-Funktion ergänzen:

```ts
getSpeakerVoice(sp)
```

Diese liest in dieser Reihenfolge:

1. `voicePerSpeaker[sp.id]`
2. `voicePerSpeaker[brandCharacterId]`
3. `scene.dialogVoices[sp.id]`
4. `scene.dialogVoices[brandCharacterId]`
5. bei Single-Speaker: `scene.characterVoiceId`
6. Avatar `default_voice_id`
7. Auto-Pool-Fallback nach Gender

Wichtig: Der Helper gibt immer eine normalisierte `DialogVoiceCfg` zurück, nicht nur eine String-ID.

### 2. Render-Select auf resolved Voice umstellen
Im Sprecher-UI-Block:

- aktuell: `const cfg = voicePerSpeaker[sp.id]`
- neu: `const cfg = getSpeakerVoice(sp)`

Damit zeigt der Select die persistierte DB-Voice auch dann, wenn sie unter der Brand-ID gespeichert wurde.

### 3. Auto-Bind persistiert beide Alias-Keys
Der bestehende Auto-Bind-Effekt soll bei einer gefundenen Voice beide Keys setzen:

- `patched[sp.id] = chosen`
- `patched[brandCharacterId] = chosen`

So funktionieren Parser, Select, Voiceover-Generation und Reload unabhängig davon, ob ein Flow mit lokaler ID oder Brand-ID arbeitet.

### 4. `characterVoiceId` nicht nur setzen, sondern im UI nutzen
Wenn genau ein Sprecher vorhanden ist und `characterVoiceId` gesetzt ist:

- Select zeigt diese Voice direkt an.
- `dialogVoices` wird automatisch daraus ergänzt.
- `onUpdate({ dialogVoices, characterVoiceId })` speichert die Reparatur zurück.

### 5. Voice-Namen robust anzeigen
Falls `list-voices` die Voice-Library noch lädt oder die ID nicht in der Liste steht:

- Auto-Voice IDs aus `AUTO_VOICE_OPTIONS` bleiben im Picker enthalten.
- Für bekannte IDs wird Name angezeigt (`George`, `Brian`, etc.).
- Wenn unbekannt, wird die ID angezeigt statt leerem Placeholder.

### 6. Keine Änderung an Generation/Lip-Sync
Nicht anfassen:

- HappyHorse/Hailuo/Sync.so
- Render-Provider
- Prompt-Generierung
- Briefing-Parser

Das ist ein reiner Frontend-Binding-/Persistenz-Fix.

## Verifikation

Nach Implementierung prüfen:

1. Aktuelles Projekt öffnen.
2. Szene 1 mit Samuel öffnen.
3. Erwartung: Select zeigt `George` statt „Stimme wählen“.
4. Setup-Badge ist weg, Auto-/Voice-Badge sichtbar.
5. DB bleibt unverändert korrekt: `dialog_voices` + `character_voice_id` gesetzt.
