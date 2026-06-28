## Befund

Nein — der Briefing-Plan wurde größtenteils korrekt erstellt und ins Storyboard übernommen, aber die automatische Stimme ist noch nicht sauber umgesetzt.

Auf deinem Screenshot sieht man:
- Skript wurde übernommen.
- Sprecher Samuel wurde erkannt.
- Scene wurde angewendet/verifiziert.
- Aber im Dialog-Studio steht weiterhin **„Stimme wählen“**.

Die Codeprüfung zeigt den wahrscheinlichsten Grund: Die Auto-Voice-Zuweisung existiert bereits im Apply-Hook, aber die Dialog-UI bindet sie nicht zuverlässig, weil sie beim Öffnen fast nur `scene.dialogVoices` und Avatar-Defaults nutzt. Wenn Samuel keine Avatar-Default-Voice hat und/oder `dialog_voices` leer bzw. unter einem anderen Character-Key gespeichert wurde, fällt die UI zurück auf „Stimme wählen“, obwohl `characterVoiceId` ggf. vorhanden sein kann.

## Ziel

Wenn ein Sprecher im Briefing erkannt wird, muss immer automatisch eine konkrete Voice angezeigt und gespeichert werden — auch wenn im Briefing keine Voice genannt wurde und der Avatar keine Standard-Stimme hat.

Akzeptanz:
- Samuel zeigt nicht mehr „Stimme wählen“, sondern z. B. **Brian** oder eine andere passende ElevenLabs-Stimme.
- Die Voice wird in `dialog_voices` pro Sprecher gespeichert.
- `character_voice_id` wird für Single-Speaker-Szenen ebenfalls gesetzt.
- Nach Reload bleibt die Stimme erhalten.
- Bei bis zu 4 Sprechern erhalten die Sprecher unterschiedliche Stimmen.

## Patch-Plan

### 1. Gemeinsame Auto-Voice-Logik zentralisieren
Eine kleine gemeinsame Utility anlegen/verwenden für:
- gültige ElevenLabs Voice IDs
- Male/Female/Neutral Pools
- Voice-ID-Säuberung
- Gender-aware Round-Robin
- Voice-Name-Auflösung

Damit `useApplyProductionPlan.ts` und `SceneDialogStudio.tsx` dieselbe Logik verwenden und nicht auseinanderlaufen.

### 2. Apply-Hook härten
In `useApplyProductionPlan.ts` sicherstellen:
- Jede erkannte Cast-Person bekommt einen Eintrag in `dialogVoices`.
- Key ist immer der normalisierte Brand-Character-ID-Key, den die UI später auch findet.
- `characterVoiceId` wird aus dem ersten `dialogVoices`-Eintrag abgeleitet.
- Verifikation schlägt nicht nur bei komplett leerer Voice an, sondern auch wenn ein Dialog-Speaker ohne konkrete Voice bleibt.

### 3. Dialog-UI Fallback reparieren
In `SceneDialogStudio.tsx` die Auto-Bind-Logik erweitern:

Fallback-Reihenfolge pro Sprecher:
1. vorhandene `scene.dialogVoices[speakerId]`
2. vorhandene Voice unter `brandCharacterId`
3. `scene.characterVoiceId` bei Single-Speaker-Szenen
4. Avatar `default_voice_id`
5. neue Auto-Pool-Stimme nach Gender

Danach sofort `onUpdate({ dialogVoices, characterVoiceId })`, damit es gespeichert wird.

### 4. UI-Feedback verbessern
Wenn eine Stimme automatisch gesetzt wurde:
- Select zeigt den Voice-Namen statt „Stimme wählen“.
- Badge neben dem Sprecher: **Auto** oder **AI** statt nur „Setup“.
- „Setup“ nur noch anzeigen, wenn wirklich weder Brand-Default noch Auto-Voice vorhanden ist.

### 5. Persistenz/Reload absichern
In `VideoComposerDashboard.tsx` nur minimal prüfen/anpassen:
- DB-Feld `dialog_voices` bleibt DB-first.
- `character_voice_id` bleibt DB-first.
- Wenn `dialog_voices` leer ist, aber `character_voice_id` vorhanden und genau ein Sprecher existiert, soll die Szene beim Laden nicht wieder „voice-los“ wirken.

### 6. Verifikation
Nach Umsetzung prüfen:
- Neue Briefing-Plan-Anwendung ohne Voice-Angabe.
- Samuel ohne Avatar-Default zeigt automatisch z. B. Brian.
- Screenshot-Zustand darf nicht mehr „Stimme wählen“ zeigen.
- Datenbankzeile enthält `dialog_voices` und `character_voice_id`.

## Nicht im Scope

- Keine Änderung an Lip-Sync, HappyHorse, Hailuo oder Sync.so.
- Kein Redesign des Dialog-Studios.
- Keine Änderung am Briefing-Inhalt selbst, außer Voice-Mapping/Anzeige/Persistenz.